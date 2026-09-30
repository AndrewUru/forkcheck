create table public.equipment_operators (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations,
 equipment_id uuid not null,
 user_id uuid not null,
 assigned_by uuid not null,
 started_at timestamptz not null default now(),
 ended_at timestamptz,
 check(ended_at is null or ended_at >= started_at),
 unique(organization_id,id),
 foreign key(organization_id,equipment_id) references public.equipment(organization_id,id),
 foreign key(organization_id,user_id) references public.profiles(organization_id,id),
 foreign key(organization_id,assigned_by) references public.profiles(organization_id,id)
);
create unique index operator_one_current_equipment on public.equipment_operators(user_id) where ended_at is null;
create index equipment_operators_current_equipment on public.equipment_operators(equipment_id,user_id) where ended_at is null;
create index equipment_operators_history on public.equipment_operators(organization_id,user_id,started_at desc);
alter table public.equipment_operators enable row level security;
revoke all on public.equipment_operators from anon,authenticated;
grant select on public.equipment_operators to authenticated;
grant all on public.equipment_operators to service_role;
create policy operators_read on public.equipment_operators for select to authenticated using(
 organization_id=private.org_id() and (user_id=auth.uid() or private.role()='CORPORATE_ADMIN')
);
create trigger audit_operators after insert or update or delete on public.equipment_operators for each row execute function private.audit_change();

create function public.create_equipment(p_input jsonb) returns text language plpgsql security definer set search_path='' as $$
declare org uuid := private.org_id(); equipment_id uuid; code text;
 type_id uuid := (p_input->>'equipment_type_id')::uuid;
 branch uuid := (p_input->>'branch_id')::uuid;
 zone uuid := nullif(p_input->>'zone_id','')::uuid;
 template uuid := (p_input->>'template_id')::uuid;
begin
 if org is null or private.role() <> 'CORPORATE_ADMIN' then raise exception 'Not authorized' using errcode='42501'; end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid input'; end if;
 if coalesce(length(trim(p_input->>'internal_code')),0) not between 1 and 60
 or coalesce(length(trim(p_input->>'brand')),0) not between 1 and 80
 or coalesce(length(trim(p_input->>'model')),0) not between 1 and 80
 or coalesce(length(p_input->>'serial_number'),0)>100 then raise exception 'Invalid equipment details'; end if;
 if not exists(select 1 from public.branches where id=branch and organization_id=org)
 or not exists(select 1 from public.equipment_types where id=type_id and organization_id=org)
 or (zone is not null and not exists(select 1 from public.zones where id=zone and branch_id=branch and organization_id=org)) then
 raise exception 'Invalid equipment location or type'; end if;
 if not exists(select 1 from public.checklist_templates t join public.checklist_versions v on v.template_id=t.id
 where t.id=template and t.organization_id=org and t.equipment_type_id=type_id and v.published_at is not null
 and exists(select 1 from public.checklist_items ci where ci.version_id=v.id)) then raise exception 'A compatible published template is required'; end if;
 insert into public.equipment(organization_id,equipment_type_id,internal_code,brand,model,serial_number,year)
 values(org,type_id,trim(p_input->>'internal_code'),trim(p_input->>'brand'),trim(p_input->>'model'),nullif(trim(p_input->>'serial_number'),''),nullif(p_input->>'year','')::integer)
 returning id,public_code into equipment_id,code;
 insert into public.equipment_assignments(organization_id,equipment_id,branch_id,zone_id) values(org,equipment_id,branch,zone);
 insert into public.equipment_schedules(organization_id,equipment_id,template_id,next_due)
 values(org,equipment_id,template,(now() at time zone (select timezone from public.organizations where id=org))::date);
 return code;
end $$;

-- Optimistic concurrency avoids silently replacing an assignment edited in another tab.
create function public.assign_equipment(p_employee_id text,p_equipment_code text,p_expected_assignment uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid := private.org_id(); employee public.profiles; asset public.equipment; branch uuid; current_id uuid; result uuid;
begin
 if org is null or private.role() <> 'CORPORATE_ADMIN' then raise exception 'Not authorized' using errcode='42501'; end if;
 if coalesce(length(p_employee_id),0) not between 1 and 40 or coalesce(length(p_equipment_code),0)>60 then raise exception 'Invalid assignment'; end if;
 if nullif(trim(p_equipment_code),'') is not null then
   select * into asset from public.equipment where organization_id=org and internal_code=trim(p_equipment_code) for update;
   if not found or asset.status='INACTIVE' then raise exception 'Equipment unavailable'; end if;
   select branch_id into branch from public.equipment_assignments where equipment_id=asset.id and end_date is null;
   if branch is null then raise exception 'Equipment has no current location'; end if;
 end if;
 select * into employee from public.profiles where organization_id=org and employee_id=trim(p_employee_id) and active for update;
 if not found then raise exception 'Employee unavailable'; end if;
 if asset.id is not null and employee.role <> 'CORPORATE_ADMIN' and not exists(
   select 1 from public.user_branches where organization_id=org and user_id=employee.id and branch_id=branch
 ) then raise exception 'Employee is not authorized for this branch'; end if;
 select id into current_id from public.equipment_operators where user_id=employee.id and ended_at is null;
 if current_id is distinct from p_expected_assignment then raise exception 'Assignment changed. Reload before saving.'; end if;
 if asset.id is not null and exists(select 1 from public.equipment_operators where id=current_id and equipment_id=asset.id) then return current_id; end if;
 update public.equipment_operators set ended_at=now() where id=current_id;
 if asset.id is not null then
   insert into public.equipment_operators(organization_id,equipment_id,user_id,assigned_by) values(org,asset.id,employee.id,auth.uid()) returning id into result;
 end if;
 return result;
end $$;
revoke all on function public.create_equipment(jsonb),public.assign_equipment(text,text,uuid) from public,anon;
grant execute on function public.create_equipment(jsonb),public.assign_equipment(text,text,uuid) to authenticated;
