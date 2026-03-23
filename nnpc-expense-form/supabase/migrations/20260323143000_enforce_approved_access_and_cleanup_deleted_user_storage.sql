create or replace function public.has_approved_app_access()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_accounts
    where user_id = auth.uid()
      and access_status = 'approved'
  );
$$;

create or replace function public.has_approved_central_admin_access()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_accounts
    where user_id = auth.uid()
      and access_status = 'approved'
      and role = 'central_admin'
  );
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

  if not public.has_approved_app_access() then
    raise exception 'Approved access required.';
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

create or replace function public.get_admin_user_storage_cleanup(
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_user_account(true);

  if p_target_user_id is null then
    raise exception 'Target user is required.';
  end if;

  if not exists (
    select 1
    from public.user_accounts
    where user_id = p_target_user_id
  ) then
    raise exception 'Target user account not found.';
  end if;

  return jsonb_build_object(
    'companyAssetPaths',
      coalesce(
        (
          select jsonb_agg(paths.path order by paths.path)
          from (
            select distinct user_companies.logo_object_path as path
            from public.user_companies
            where user_companies.user_id = p_target_user_id
              and user_companies.logo_bucket_name = 'company-assets'
              and nullif(trim(user_companies.logo_object_path), '') is not null
            union
            select distinct expense_reports.company_logo_object_path as path
            from public.expense_reports
            where expense_reports.user_id = p_target_user_id
              and expense_reports.company_logo_bucket_name = 'company-assets'
              and nullif(trim(expense_reports.company_logo_object_path), '') is not null
          ) as paths
        ),
        '[]'::jsonb
      ),
    'expenseReceiptPaths',
      coalesce(
        (
          select jsonb_agg(paths.path order by paths.path)
          from (
            select distinct expense_receipts.object_path as path
            from public.expense_receipts
            join public.expense_items
              on public.expense_items.id = public.expense_receipts.expense_item_id
            join public.expense_reports
              on public.expense_reports.id = public.expense_items.report_id
            where public.expense_reports.user_id = p_target_user_id
              and public.expense_receipts.bucket_name = 'expense-receipts'
              and nullif(trim(public.expense_receipts.object_path), '') is not null
          ) as paths
        ),
        '[]'::jsonb
      )
  );
end;
$$;

drop policy if exists "Users can manage own companies" on public.user_companies;
create policy "Users can manage own companies"
on public.user_companies
for all
to authenticated
using (
  auth.uid() = user_id
  and public.has_approved_app_access()
)
with check (
  auth.uid() = user_id
  and public.has_approved_app_access()
);

drop policy if exists "Users can manage own reports" on public.expense_reports;
create policy "Users can manage own reports"
on public.expense_reports
for all
to authenticated
using (
  auth.uid() = user_id
  and public.has_approved_app_access()
)
with check (
  auth.uid() = user_id
  and public.has_approved_app_access()
);

drop policy if exists "Users can manage own expense items" on public.expense_items;
create policy "Users can manage own expense items"
on public.expense_items
for all
to authenticated
using (
  public.has_approved_app_access()
  and exists (
    select 1
    from public.expense_reports
    where public.expense_reports.id = report_id
      and public.expense_reports.user_id = auth.uid()
  )
)
with check (
  public.has_approved_app_access()
  and exists (
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
  public.has_approved_app_access()
  and exists (
    select 1
    from public.expense_items
    join public.expense_reports
      on public.expense_reports.id = public.expense_items.report_id
    where public.expense_items.id = expense_item_id
      and public.expense_reports.user_id = auth.uid()
  )
)
with check (
  public.has_approved_app_access()
  and exists (
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
  and public.has_approved_app_access()
);

drop policy if exists "Users can write own company assets" on storage.objects;
create policy "Users can write own company assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'company-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_approved_app_access()
);

drop policy if exists "Users can update own company assets" on storage.objects;
create policy "Users can update own company assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'company-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_approved_app_access()
)
with check (
  bucket_id = 'company-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_approved_app_access()
);

drop policy if exists "Users can delete own company assets" on storage.objects;
create policy "Users can delete own company assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'company-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_approved_app_access()
);

drop policy if exists "Users can read own expense receipts" on storage.objects;
create policy "Users can read own expense receipts"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_approved_app_access()
);

drop policy if exists "Users can write own expense receipts" on storage.objects;
create policy "Users can write own expense receipts"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_approved_app_access()
);

drop policy if exists "Users can update own expense receipts" on storage.objects;
create policy "Users can update own expense receipts"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_approved_app_access()
)
with check (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_approved_app_access()
);

drop policy if exists "Users can delete own expense receipts" on storage.objects;
create policy "Users can delete own expense receipts"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_approved_app_access()
);

drop policy if exists "Central admins can read managed company assets" on storage.objects;
create policy "Central admins can read managed company assets"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'company-assets'
  and public.has_approved_central_admin_access()
);

drop policy if exists "Central admins can delete managed company assets" on storage.objects;
create policy "Central admins can delete managed company assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'company-assets'
  and public.has_approved_central_admin_access()
);

drop policy if exists "Central admins can read managed expense receipts" on storage.objects;
create policy "Central admins can read managed expense receipts"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'expense-receipts'
  and public.has_approved_central_admin_access()
);

drop policy if exists "Central admins can delete managed expense receipts" on storage.objects;
create policy "Central admins can delete managed expense receipts"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'expense-receipts'
  and public.has_approved_central_admin_access()
);

comment on function public.has_approved_app_access() is
  'Returns true when the current authenticated user exists in user_accounts with approved app access.';

comment on function public.has_approved_central_admin_access() is
  'Returns true when the current authenticated user is an approved central admin.';

comment on function public.get_admin_user_storage_cleanup(uuid) is
  'Central-admin helper that returns company logo and receipt object paths for a managed user before account deletion.';

revoke all on function public.has_approved_app_access() from public;
revoke all on function public.has_approved_central_admin_access() from public;
revoke all on function public.get_admin_user_storage_cleanup(uuid) from public;

grant execute on function public.has_approved_app_access() to authenticated;
grant execute on function public.has_approved_central_admin_access() to authenticated;
grant execute on function public.get_admin_user_storage_cleanup(uuid) to authenticated;
