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

create index if not exists user_accounts_role_idx
  on public.user_accounts (role);

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

drop trigger if exists on_auth_user_account_changed on auth.users;
create trigger on_auth_user_account_changed
after insert or update of email, raw_user_meta_data on auth.users
for each row
execute function public.sync_user_account();

drop trigger if exists set_user_accounts_updated_at on public.user_accounts;
create trigger set_user_accounts_updated_at
before update on public.user_accounts
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.user_accounts enable row level security;

drop policy if exists "Users can view own account" on public.user_accounts;
create policy "Users can view own account"
on public.user_accounts
for select
to authenticated
using (auth.uid() = user_id);

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

revoke all on function public.get_admin_expense_dashboard(text) from public;
grant execute on function public.get_admin_expense_dashboard(text) to authenticated;
