-- Schema snapshot for the current application scope.
-- Source of truth: supabase/migrations/*.sql

create extension if not exists pgcrypto;

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.sync_expense_report_total()
returns trigger
language plpgsql
as $$
declare
  target_report_id uuid;
begin
  if tg_op = 'DELETE' then
    target_report_id := old.report_id;
  else
    target_report_id := new.report_id;
  end if;

  update public.expense_reports
  set
    total_amount_thb = coalesce(
      (
        select sum(amount_thb)
        from public.expense_items
        where report_id = target_report_id
      ),
      0
    ),
    updated_at = timezone('utc', now())
  where id = target_report_id;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create sequence if not exists public.expense_report_reference_sequence
  as bigint
  start with 1
  increment by 1
  minvalue 1;

create or replace function public.build_expense_report_code(
  p_reference_sequence bigint,
  p_expense_date date
)
returns text
language sql
immutable
as $$
  select format(
    'EXP-%s-%s%s%s',
    case
      when p_reference_sequence < 10000 then lpad(p_reference_sequence::text, 4, '0')
      else p_reference_sequence::text
    end,
    to_char(p_expense_date, 'DD'),
    (
      array[
        'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
        'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
      ]
    )[extract(month from p_expense_date)::integer],
    to_char(p_expense_date, 'YYYY')
  );
$$;

create or replace function public.assign_expense_report_code()
returns trigger
language plpgsql
as $$
begin
  if new.reference_sequence is null then
    new.reference_sequence := nextval('public.expense_report_reference_sequence');
  end if;

  if new.expense_date is null then
    new.expense_code := null;
  else
    new.expense_code := public.build_expense_report_code(
      new.reference_sequence,
      new.expense_date
    );
  end if;

  return new;
end;
$$;

create or replace function public.derive_user_account_display_name(
  p_email text,
  p_user_meta jsonb default '{}'::jsonb
)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(trim(coalesce(p_user_meta->>'full_name', p_user_meta->>'name')), ''),
    nullif(
      trim(
        initcap(
          regexp_replace(
            split_part(coalesce(p_email, ''), '@', 1),
            '[._-]+',
            ' ',
            'g'
          )
        )
      ),
      ''
    ),
    'Expense owner'
  );
$$;

create or replace function public.sync_user_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_accounts (
    user_id,
    email,
    display_name
  )
  values (
    new.id,
    new.email,
    public.derive_user_account_display_name(
      new.email,
      coalesce(new.raw_user_meta_data, '{}'::jsonb)
    )
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    display_name = excluded.display_name,
    updated_at = timezone('utc', now());

  return new;
end;
$$;

create or replace function public.upsert_expense_day(
  p_expense_date date,
  p_company_id uuid,
  p_company_name text,
  p_company_logo_bucket_name text,
  p_company_logo_object_path text,
  p_export_language text,
  p_employee_name text,
  p_note text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_report_id uuid;
  v_expense_code text;
  v_item jsonb;
  v_receipt jsonb;
  v_item_id uuid;
  v_position integer := 0;
  v_expense_type_id bigint;
  v_expense_type_label text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.expense_reports (
    user_id,
    expense_date,
    company_id,
    company_name,
    company_logo_bucket_name,
    company_logo_object_path,
    export_language,
    employee_name,
    note
  )
  values (
    auth.uid(),
    p_expense_date,
    p_company_id,
    p_company_name,
    p_company_logo_bucket_name,
    p_company_logo_object_path,
    coalesce(nullif(p_export_language, ''), 'en'),
    p_employee_name,
    p_note
  )
  on conflict (user_id, expense_date) do update
  set
    company_id = excluded.company_id,
    company_name = excluded.company_name,
    company_logo_bucket_name = excluded.company_logo_bucket_name,
    company_logo_object_path = excluded.company_logo_object_path,
    export_language = excluded.export_language,
    employee_name = excluded.employee_name,
    note = excluded.note,
    updated_at = timezone('utc', now())
  returning id, expense_code into v_report_id, v_expense_code;

  delete from public.expense_receipts
  where expense_item_id in (
    select id
    from public.expense_items
    where report_id = v_report_id
  );

  delete from public.expense_items
  where report_id = v_report_id;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_position := v_position + 1;

    select id, label
    into v_expense_type_id, v_expense_type_label
    from public.expense_types
    where code = nullif(v_item->>'type_code', '')
    limit 1;

    if v_expense_type_label is null then
      v_expense_type_label := 'Miscellaneous';
    end if;

    insert into public.expense_items (
      report_id,
      expense_type_id,
      expense_type_label,
      amount_thb,
      remark,
      line_number
    )
    values (
      v_report_id,
      v_expense_type_id,
      v_expense_type_label,
      (v_item->>'amount_thb')::numeric,
      v_item->>'remark',
      coalesce((v_item->>'line_number')::integer, v_position)
    )
    returning id into v_item_id;

    for v_receipt in
      select value
      from jsonb_array_elements(coalesce(v_item->'receipts', '[]'::jsonb))
    loop
      insert into public.expense_receipts (
        expense_item_id,
        bucket_name,
        object_path,
        original_file_name,
        mime_type,
        file_size_bytes
      )
      values (
        v_item_id,
        coalesce(nullif(v_receipt->>'bucket_name', ''), 'expense-receipts'),
        v_receipt->>'object_path',
        v_receipt->>'original_file_name',
        v_receipt->>'mime_type',
        (v_receipt->>'file_size_bytes')::bigint
      );
    end loop;
  end loop;

  update public.expense_reports
  set
    total_amount_thb = coalesce(
      (
        select sum(amount_thb)
        from public.expense_items
        where report_id = v_report_id
      ),
      0
    ),
    updated_at = timezone('utc', now())
  where id = v_report_id;

  return jsonb_build_object(
    'report_id',
    v_report_id,
    'expense_code',
    v_expense_code
  );
end;
$$;

create or replace function public.get_admin_expense_dashboard(
  p_period text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_selected_period text := coalesce(
    nullif(trim(p_period), ''),
    to_char(timezone('Asia/Bangkok', now()), 'YYYY-MM')
  );
  v_selected_year integer;
  v_selected_month integer;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if v_selected_period !~ '^\d{4}-\d{2}$' then
    v_selected_period := to_char(timezone('Asia/Bangkok', now()), 'YYYY-MM');
  end if;

  v_selected_year := substring(v_selected_period from 1 for 4)::integer;
  v_selected_month := substring(v_selected_period from 6 for 2)::integer;

  if v_selected_year < 2000 or v_selected_year > 2100 or v_selected_month < 1 or v_selected_month > 12 then
    v_selected_period := to_char(timezone('Asia/Bangkok', now()), 'YYYY-MM');
    v_selected_year := substring(v_selected_period from 1 for 4)::integer;
    v_selected_month := substring(v_selected_period from 6 for 2)::integer;
  end if;

  if not exists (
    select 1
    from public.user_accounts
    where user_id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Admin access required.';
  end if;

  with yearly_reports as (
    select
      expense_reports.id as report_id,
      expense_reports.user_id,
      expense_reports.expense_date,
      coalesce(nullif(trim(expense_reports.expense_code), ''), 'EXP') as expense_code,
      coalesce(nullif(trim(expense_reports.company_name), ''), 'No company') as company_name,
      coalesce(
        nullif(trim(expense_reports.employee_name), ''),
        user_accounts.display_name
      ) as employee_name,
      expense_reports.total_amount_thb::numeric as total_amount
    from public.expense_reports
    join public.user_accounts
      on user_accounts.user_id = expense_reports.user_id
    where expense_reports.expense_date >= make_date(v_selected_year, 1, 1)
      and expense_reports.expense_date <= make_date(v_selected_year, 12, 31)
  ),
  per_user as (
    select
      user_accounts.user_id,
      user_accounts.display_name,
      coalesce(nullif(trim(user_accounts.email), ''), 'No email') as email,
      coalesce(
        sum(
          case
            when to_char(yearly_reports.expense_date, 'YYYY-MM') = v_selected_period
              then yearly_reports.total_amount
            else 0
          end
        ),
        0
      )::numeric as monthly_expense,
      coalesce(sum(yearly_reports.total_amount), 0)::numeric as yearly_expense,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'companyName', yearly_reports.company_name,
            'date', to_char(yearly_reports.expense_date, 'YYYY-MM-DD'),
            'employeeName', yearly_reports.employee_name,
            'expenseCode', yearly_reports.expense_code,
            'reportId', yearly_reports.report_id,
            'totalAmount', yearly_reports.total_amount
          )
          order by yearly_reports.expense_date desc, yearly_reports.report_id
        ) filter (
          where to_char(yearly_reports.expense_date, 'YYYY-MM') = v_selected_period
        ),
        '[]'::jsonb
      ) as detail_rows
    from public.user_accounts
    left join yearly_reports
      on yearly_reports.user_id = user_accounts.user_id
    group by user_accounts.user_id, user_accounts.display_name, user_accounts.email
  )
  select jsonb_build_object(
    'selectedPeriod', v_selected_period,
    'selectedYear', v_selected_year,
    'selectedMonth', v_selected_month,
    'totals', jsonb_build_object(
      'monthlyExpense', coalesce(sum(per_user.monthly_expense), 0),
      'usersWithMonthlyExpenses', count(*) filter (where per_user.monthly_expense > 0),
      'yearlyExpense', coalesce(sum(per_user.yearly_expense), 0)
    ),
    'users', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'userId', per_user.user_id,
          'displayName', per_user.display_name,
          'email', per_user.email,
          'monthlyExpense', per_user.monthly_expense,
          'yearlyExpense', per_user.yearly_expense,
          'monthDaysWithExpenses', jsonb_array_length(per_user.detail_rows),
          'detailRows', per_user.detail_rows
        )
        order by per_user.yearly_expense desc, per_user.display_name asc
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from per_user;

  return coalesce(
    v_result,
    jsonb_build_object(
      'selectedPeriod', v_selected_period,
      'selectedYear', v_selected_year,
      'selectedMonth', v_selected_month,
      'totals', jsonb_build_object(
        'monthlyExpense', 0,
        'usersWithMonthlyExpenses', 0,
        'yearlyExpense', 0
      ),
      'users', '[]'::jsonb
    )
  );
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  employee_code text,
  department text,
  cost_center text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text not null check (length(trim(display_name)) > 0),
  role text not null default 'user' check (
    role in ('user', 'admin')
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company_name text not null check (length(trim(company_name)) > 0),
  logo_data_url text,
  logo_bucket_name text default 'company-assets',
  logo_object_path text,
  original_logo_file_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.expense_types (
  id bigint generated by default as identity primary key,
  code text not null unique,
  label text not null,
  description text,
  requires_receipt boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.expense_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reference_sequence bigint not null default nextval('public.expense_report_reference_sequence'),
  expense_code text not null,
  expense_date date not null,
  company_id uuid references public.user_companies (id) on delete set null,
  company_name text,
  company_logo_data_url text,
  company_logo_bucket_name text,
  company_logo_object_path text,
  export_language text not null default 'en' check (
    export_language in ('en', 'th')
  ),
  employee_name text,
  department text,
  cost_center text,
  note text,
  status text not null default 'draft' check (
    status in ('draft', 'submitted', 'approved', 'rejected', 'exported')
  ),
  total_amount_thb numeric(12, 2) not null default 0 check (total_amount_thb >= 0),
  submitted_at timestamptz,
  exported_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, expense_date)
);

create table if not exists public.expense_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.expense_reports (id) on delete cascade,
  expense_type_id bigint references public.expense_types (id),
  expense_type_label text not null,
  amount_thb numeric(12, 2) not null check (amount_thb > 0),
  remark text,
  line_number integer not null default 1 check (line_number > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.expense_receipts (
  id uuid primary key default gen_random_uuid(),
  expense_item_id uuid not null references public.expense_items (id) on delete cascade,
  bucket_name text not null default 'expense-receipts',
  object_path text not null unique,
  original_file_name text not null,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes > 0),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists user_companies_logo_path_idx
  on public.user_companies (logo_bucket_name, logo_object_path)
  where logo_object_path is not null;

create index if not exists user_companies_user_created_idx
  on public.user_companies (user_id, created_at desc);

create index if not exists user_accounts_role_idx
  on public.user_accounts (role);

create index if not exists expense_reports_user_date_idx
  on public.expense_reports (user_id, expense_date desc);

create unique index if not exists expense_reports_reference_sequence_idx
  on public.expense_reports (reference_sequence);

create unique index if not exists expense_reports_expense_code_idx
  on public.expense_reports (expense_code);

create index if not exists expense_reports_company_idx
  on public.expense_reports (company_id);

create index if not exists expense_items_report_line_idx
  on public.expense_items (report_id, line_number);

create index if not exists expense_receipts_item_idx
  on public.expense_receipts (expense_item_id);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_user_accounts_updated_at on public.user_accounts;
create trigger set_user_accounts_updated_at
before update on public.user_accounts
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists on_auth_user_account_changed on auth.users;
create trigger on_auth_user_account_changed
after insert or update of email, raw_user_meta_data on auth.users
for each row
execute function public.sync_user_account();

insert into public.user_accounts (
  user_id,
  email,
  display_name
)
select
  users.id,
  users.email,
  public.derive_user_account_display_name(
    users.email,
    coalesce(users.raw_user_meta_data, '{}'::jsonb)
  )
from auth.users as users
on conflict (user_id) do update
set
  email = excluded.email,
  display_name = excluded.display_name,
  updated_at = timezone('utc', now());

drop trigger if exists set_user_companies_updated_at on public.user_companies;
create trigger set_user_companies_updated_at
before update on public.user_companies
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_expense_reports_updated_at on public.expense_reports;
create trigger set_expense_reports_updated_at
before update on public.expense_reports
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_expense_report_code on public.expense_reports;
create trigger set_expense_report_code
before insert or update on public.expense_reports
for each row
execute function public.assign_expense_report_code();

drop trigger if exists set_expense_items_updated_at on public.expense_items;
create trigger set_expense_items_updated_at
before update on public.expense_items
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists sync_expense_report_total_on_change on public.expense_items;
create trigger sync_expense_report_total_on_change
after insert or update or delete on public.expense_items
for each row
execute function public.sync_expense_report_total();

insert into public.expense_types (
  code,
  label,
  description,
  sort_order
)
values
  ('transportation', 'Transportation', 'Taxi, BTS, MRT, bus, parking, ride-hailing', 10),
  ('client_food', 'Client food', 'Meals or refreshments for customer-facing meetings', 20),
  ('gas', 'Gas', 'Fuel reimbursements for business travel', 30),
  ('toll_fee', 'Toll fee', 'Road, expressway, and bridge toll costs', 40),
  ('misc', 'Miscellaneous', 'Temporary fallback for new expense categories', 50)
on conflict (code) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'company-assets',
    'company-assets',
    true,
    5242880,
    array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
  ),
  (
    'expense-receipts',
    'expense-receipts',
    true,
    10485760,
    array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.profiles enable row level security;
alter table public.user_accounts enable row level security;
alter table public.user_companies enable row level security;
alter table public.expense_types enable row level security;
alter table public.expense_reports enable row level security;
alter table public.expense_items enable row level security;
alter table public.expense_receipts enable row level security;

drop policy if exists "Users can view own account" on public.user_accounts;
create policy "Users can view own account"
on public.user_accounts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can manage own companies" on public.user_companies;
create policy "Users can manage own companies"
on public.user_companies
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Authenticated users can read expense types" on public.expense_types;
create policy "Authenticated users can read expense types"
on public.expense_types
for select
to authenticated
using (is_active = true);

drop policy if exists "Users can manage own reports" on public.expense_reports;
create policy "Users can manage own reports"
on public.expense_reports
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own expense items" on public.expense_items;
create policy "Users can manage own expense items"
on public.expense_items
for all
to authenticated
using (
  exists (
    select 1
    from public.expense_reports
    where public.expense_reports.id = report_id
      and public.expense_reports.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.expense_reports
    where public.expense_reports.id = report_id
      and public.expense_reports.user_id = auth.uid()
  )
);

drop policy if exists "Users can manage own receipts" on public.expense_receipts;
create policy "Users can manage own receipts"
on public.expense_receipts
for all
to authenticated
using (
  exists (
    select 1
    from public.expense_items
    join public.expense_reports
      on public.expense_reports.id = public.expense_items.report_id
    where public.expense_items.id = expense_item_id
      and public.expense_reports.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.expense_items
    join public.expense_reports
      on public.expense_reports.id = public.expense_items.report_id
    where public.expense_items.id = expense_item_id
      and public.expense_reports.user_id = auth.uid()
  )
);

drop policy if exists "Users can read own company assets" on storage.objects;
create policy "Users can read own company assets"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'company-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can write own company assets" on storage.objects;
create policy "Users can write own company assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'company-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own company assets" on storage.objects;
create policy "Users can update own company assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'company-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'company-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own company assets" on storage.objects;
create policy "Users can delete own company assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'company-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read own expense receipts" on storage.objects;
create policy "Users can read own expense receipts"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can write own expense receipts" on storage.objects;
create policy "Users can write own expense receipts"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own expense receipts" on storage.objects;
create policy "Users can update own expense receipts"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own expense receipts" on storage.objects;
create policy "Users can delete own expense receipts"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

comment on table public.profiles is
  'Authenticated user profile metadata for reimbursement exports.';

comment on table public.user_accounts is
  'Application-facing account metadata and lightweight role assignments synced from auth.users.';

comment on table public.user_companies is
  'Reusable company identities for export headers. Logos can be stored in Supabase Storage or preserved as legacy data URLs.';

comment on table public.expense_reports is
  'One reimbursement form per user per day, including company snapshots and export settings.';

comment on table public.expense_items is
  'Line items inside a daily reimbursement form. expense_type_label stores a snapshot for history.';

comment on table public.expense_receipts is
  'Receipt file metadata. The file bodies are stored in the expense-receipts Supabase Storage bucket.';

comment on column public.expense_receipts.object_path is
  'Recommended path: <user_id>/expense-receipts/<expense_date>/expense-<line>/<file_name>.';

comment on function public.get_admin_expense_dashboard(text) is
  'Authenticated admin-only dashboard aggregate for cross-user expense reporting.';

revoke all on function public.get_admin_expense_dashboard(text) from public;
grant execute on function public.get_admin_expense_dashboard(text) to authenticated;
