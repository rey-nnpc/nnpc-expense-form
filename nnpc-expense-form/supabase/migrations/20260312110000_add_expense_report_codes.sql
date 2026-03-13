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

alter table public.expense_reports
  add column if not exists reference_sequence bigint;

alter table public.expense_reports
  add column if not exists expense_code text;

alter table public.expense_reports
  alter column reference_sequence set default nextval('public.expense_report_reference_sequence');

drop trigger if exists set_expense_report_code on public.expense_reports;
create trigger set_expense_report_code
before insert or update on public.expense_reports
for each row
execute function public.assign_expense_report_code();

update public.expense_reports
set reference_sequence = nextval('public.expense_report_reference_sequence')
where reference_sequence is null;

update public.expense_reports
set expense_code = public.build_expense_report_code(reference_sequence, expense_date)
where expense_code is null
  and reference_sequence is not null
  and expense_date is not null;

do $$
declare
  v_max_reference_sequence bigint;
begin
  select max(reference_sequence)
  into v_max_reference_sequence
  from public.expense_reports;

  if v_max_reference_sequence is null then
    perform setval('public.expense_report_reference_sequence', 1, false);
  else
    perform setval('public.expense_report_reference_sequence', v_max_reference_sequence, true);
  end if;
end;
$$;

alter table public.expense_reports
  alter column reference_sequence set not null;

alter table public.expense_reports
  alter column expense_code set not null;

create unique index if not exists expense_reports_reference_sequence_idx
  on public.expense_reports (reference_sequence);

create unique index if not exists expense_reports_expense_code_idx
  on public.expense_reports (expense_code);

drop function if exists public.upsert_expense_day(
  date,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
);

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
