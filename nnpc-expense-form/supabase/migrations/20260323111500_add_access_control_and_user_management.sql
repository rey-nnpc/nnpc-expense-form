alter table public.user_accounts
  drop constraint if exists user_accounts_role_check;

alter table public.user_accounts
  add column if not exists access_status text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users (id) on delete set null,
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by uuid references auth.users (id) on delete set null;

update public.user_accounts
set
  access_status = 'approved',
  approved_at = coalesce(approved_at, created_at, timezone('utc', now())),
  disabled_at = null,
  disabled_by = null
where true;

alter table public.user_accounts
  alter column role set default 'user',
  alter column access_status set default 'pending',
  alter column access_status set not null;

alter table public.user_accounts
  add constraint user_accounts_role_check
    check (role in ('user', 'admin', 'central_admin')),
  add constraint user_accounts_access_status_check
    check (access_status in ('pending', 'approved', 'disabled'));

create index if not exists user_accounts_access_status_idx
  on public.user_accounts (access_status);

create index if not exists user_accounts_access_status_role_idx
  on public.user_accounts (access_status, role);

create or replace function public.require_admin_user_account(
  p_require_central boolean default false
)
returns public.user_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.user_accounts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_actor
  from public.user_accounts
  where user_id = auth.uid();

  if not found then
    raise exception 'User account not found.';
  end if;

  if v_actor.access_status <> 'approved' then
    raise exception 'Approved access required.';
  end if;

  if p_require_central then
    if v_actor.role <> 'central_admin' then
      raise exception 'Central admin access required.';
    end if;
  elsif v_actor.role not in ('admin', 'central_admin') then
    raise exception 'Admin access required.';
  end if;

  return v_actor;
end;
$$;

create or replace function public.get_admin_user_management()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.user_accounts%rowtype;
  v_result jsonb;
begin
  v_actor := public.require_admin_user_account(false);

  select jsonb_build_object(
    'totals', jsonb_build_object(
      'pendingUsers', count(*) filter (where user_accounts.access_status = 'pending'),
      'approvedUsers', count(*) filter (where user_accounts.access_status = 'approved'),
      'disabledUsers', count(*) filter (where user_accounts.access_status = 'disabled'),
      'elevatedUsers',
        count(*) filter (
          where user_accounts.access_status = 'approved'
            and user_accounts.role in ('admin', 'central_admin')
        )
    ),
    'users',
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'userId', user_accounts.user_id,
            'displayName', user_accounts.display_name,
            'email', coalesce(nullif(trim(user_accounts.email), ''), 'No email'),
            'role', user_accounts.role,
            'accessStatus', user_accounts.access_status,
            'createdAt', user_accounts.created_at,
            'updatedAt', user_accounts.updated_at,
            'approvedAt', user_accounts.approved_at,
            'approvedBy', user_accounts.approved_by,
            'disabledAt', user_accounts.disabled_at,
            'disabledBy', user_accounts.disabled_by
          )
          order by
            case user_accounts.access_status
              when 'pending' then 1
              when 'approved' then 2
              else 3
            end,
            case
              when user_accounts.access_status = 'pending' then user_accounts.created_at
              when user_accounts.access_status = 'disabled' then coalesce(user_accounts.disabled_at, user_accounts.updated_at)
              else coalesce(user_accounts.approved_at, user_accounts.updated_at)
            end desc,
            user_accounts.display_name asc
        ),
        '[]'::jsonb
      )
  )
  into v_result
  from public.user_accounts;

  return coalesce(
    v_result,
    jsonb_build_object(
      'totals', jsonb_build_object(
        'pendingUsers', 0,
        'approvedUsers', 0,
        'disabledUsers', 0,
        'elevatedUsers', 0
      ),
      'users', '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.admin_manage_user_account(
  p_target_user_id uuid,
  p_action text,
  p_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor public.user_accounts%rowtype;
  v_target public.user_accounts%rowtype;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_requested_role text := nullif(lower(trim(coalesce(p_role, ''))), '');
  v_now timestamptz := timezone('utc', now());
begin
  v_actor := public.require_admin_user_account(false);

  if p_target_user_id is null then
    raise exception 'Target user is required.';
  end if;

  if v_action not in ('approve', 'delete', 'disable', 'set_role') then
    raise exception 'Unsupported action.';
  end if;

  select *
  into v_target
  from public.user_accounts
  where user_id = p_target_user_id;

  if not found then
    raise exception 'Target user account not found.';
  end if;

  if v_action in ('delete', 'disable', 'set_role') and v_target.user_id = v_actor.user_id then
    raise exception 'You cannot modify your own access here.';
  end if;

  if v_target.role = 'central_admin' then
    if v_actor.role <> 'central_admin' then
      raise exception 'Central admin access required.';
    end if;

    if v_action = 'approve' then
      update public.user_accounts
      set
        access_status = 'approved',
        approved_at = v_now,
        approved_by = auth.uid(),
        disabled_at = null,
        disabled_by = null
      where user_id = p_target_user_id
      returning *
      into v_target;

      return jsonb_build_object(
        'action', v_action,
        'userId', v_target.user_id
      );
    end if;

    raise exception 'Central admin accounts must be changed directly in the database.';
  end if;

  if v_actor.role = 'admin' then
    if v_action not in ('approve', 'disable') then
      raise exception 'Only central admins can change roles or remove users.';
    end if;

    if v_target.role <> 'user' then
      raise exception 'Only central admins can manage admin roles.';
    end if;
  end if;

  case v_action
    when 'approve' then
      if v_actor.role = 'admin' then
        v_requested_role := 'user';
      else
        v_requested_role := coalesce(v_requested_role, case when v_target.role = 'admin' then 'admin' else 'user' end);
      end if;

      if v_requested_role not in ('user', 'admin') then
        raise exception 'Approved role must be user or admin.';
      end if;

      update public.user_accounts
      set
        role = v_requested_role,
        access_status = 'approved',
        approved_at = v_now,
        approved_by = auth.uid(),
        disabled_at = null,
        disabled_by = null
      where user_id = p_target_user_id
      returning *
      into v_target;

    when 'disable' then
      update public.user_accounts
      set
        access_status = 'disabled',
        disabled_at = v_now,
        disabled_by = auth.uid()
      where user_id = p_target_user_id
      returning *
      into v_target;

    when 'set_role' then
      if v_actor.role <> 'central_admin' then
        raise exception 'Central admin access required.';
      end if;

      if v_target.access_status <> 'approved' then
        raise exception 'Only approved users can have roles changed.';
      end if;

      if v_requested_role not in ('user', 'admin') then
        raise exception 'Role must be user or admin.';
      end if;

      update public.user_accounts
      set role = v_requested_role
      where user_id = p_target_user_id
      returning *
      into v_target;

    when 'delete' then
      if v_actor.role <> 'central_admin' then
        raise exception 'Central admin access required.';
      end if;

      delete from auth.users
      where id = p_target_user_id;

      if not found then
        raise exception 'Target auth user could not be removed.';
      end if;

      return jsonb_build_object(
        'action', v_action,
        'userId', p_target_user_id
      );
  end case;

  return jsonb_build_object(
    'action', v_action,
    'userId', v_target.user_id
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
  v_actor public.user_accounts%rowtype;
  v_selected_period text := coalesce(
    nullif(trim(p_period), ''),
    to_char(timezone('Asia/Bangkok', now()), 'YYYY-MM')
  );
  v_selected_year integer;
  v_selected_month integer;
  v_result jsonb;
begin
  v_actor := public.require_admin_user_account(false);

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

comment on function public.require_admin_user_account(boolean) is
  'Internal helper that enforces approved admin or central-admin access before protected admin RPCs run.';

comment on function public.get_admin_user_management() is
  'Approved admin-only account management payload for management and allowlist workflows.';

comment on function public.admin_manage_user_account(uuid, text, text) is
  'Approved admin mutation RPC for approving, disabling, deleting, and changing user roles.';

comment on function public.get_admin_expense_dashboard(text) is
  'Authenticated admin or central-admin dashboard aggregate for cross-user expense reporting.';

revoke all on function public.require_admin_user_account(boolean) from public;
revoke all on function public.get_admin_user_management() from public;
revoke all on function public.admin_manage_user_account(uuid, text, text) from public;
revoke all on function public.get_admin_expense_dashboard(text) from public;

grant execute on function public.get_admin_user_management() to authenticated;
grant execute on function public.admin_manage_user_account(uuid, text, text) to authenticated;
grant execute on function public.get_admin_expense_dashboard(text) to authenticated;
