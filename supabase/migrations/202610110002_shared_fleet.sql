-- Shared scoped fleet management and operator self-assignment.
create or replace function private.operator_in_scope(employee uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(private.role()::text in ('JEFE_ALMACEN','EHS') and exists (
   select 1 from public.profiles p join public.user_branches b
     on b.organization_id=p.organization_id and b.user_id=p.id
   where p.id=employee and p.organization_id=private.org_id() and p.role='OPERARIO'
     and private.branch_allowed(p.organization_id,b.branch_id)
 ),false)
$$;
create function private.staff_in_scope(employee uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.operator_in_scope(employee) or coalesce(private.role()::text='EHS' and exists (
   select 1 from public.profiles p join public.user_branches b
     on b.organization_id=p.organization_id and b.user_id=p.id
   where p.id=employee and p.organization_id=private.org_id() and p.role::text='JEFE_ALMACEN'
     and private.branch_allowed(p.organization_id,b.branch_id)
 ),false)
$$;
revoke all on function private.operator_in_scope(uuid),private.staff_in_scope(uuid) from public,anon;
grant execute on function private.operator_in_scope(uuid),private.staff_in_scope(uuid) to authenticated;
drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (
 (id=auth.uid() and active) or (organization_id=private.org_id() and (
   private.role()='CORPORATE_ADMIN' or private.staff_in_scope(id)
 ))
);
drop policy assignments_read on public.user_branches;
create policy assignments_read on public.user_branches for select to authenticated using (
 organization_id=private.org_id() and (user_id=auth.uid() or private.role()='CORPORATE_ADMIN'
   or (private.staff_in_scope(user_id) and private.branch_allowed(organization_id,branch_id)))
);

create or replace function public.assign_equipment(p_employee_id text,p_equipment_code text,p_expected_assignment uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if private.org_id() is null or private.role()::text not in ('CORPORATE_ADMIN','JEFE_ALMACEN','EHS') then
   raise exception 'Not authorized' using errcode='42501';
 end if;
 return private.assign_equipment_for(p_employee_id,p_equipment_code,p_expected_assignment);
end $$;

create function public.assign_my_equipment(p_equipment_code text,p_expected_assignment uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare employee text;
begin
 if private.org_id() is null or private.role() is distinct from 'OPERARIO' then
   raise exception 'Not authorized' using errcode='42501';
 end if;
 select employee_id into employee from public.profiles where id=auth.uid() and organization_id=private.org_id() and active and not must_change_password;
 if employee is null then raise exception 'Not authorized' using errcode='42501'; end if;
 return private.assign_equipment_for(employee,p_equipment_code,p_expected_assignment);
end $$;

create function public.update_equipment(p_public_code text,p_expected_updated_at timestamptz,p_input jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare org uuid:=private.org_id(); asset public.equipment; location public.equipment_assignments;
 branch uuid:=(p_input->>'branch_id')::uuid; zone uuid:=nullif(p_input->>'zone_id','')::uuid;
begin
 if org is null or private.role()::text not in ('CORPORATE_ADMIN','JEFE_ALMACEN','EHS') then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into asset from public.equipment where organization_id=org and public_code=p_public_code for update;
 if not found or asset.status='INACTIVE' then raise exception 'Equipment unavailable'; end if;
 select * into location from public.equipment_assignments where organization_id=org and equipment_id=asset.id and end_date is null for update;
 if not found or not private.branch_allowed(org,location.branch_id) or not private.branch_allowed(org,branch) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_expected_updated_at is null or asset.updated_at is distinct from p_expected_updated_at then raise exception 'Equipment changed. Reload before saving.'; end if;
 if jsonb_typeof(p_input) is distinct from 'object'
 or coalesce(length(trim(p_input->>'internal_code')),0) not between 1 and 60
 or coalesce(length(trim(p_input->>'brand')),0) not between 1 and 80
 or coalesce(length(trim(p_input->>'model')),0) not between 1 and 80
 or coalesce(length(p_input->>'serial_number'),0)>100 then raise exception 'Invalid equipment details'; end if;
 if not exists(select 1 from public.branches where id=branch and organization_id=org)
 or (zone is not null and not exists(select 1 from public.zones where id=zone and organization_id=org and branch_id=branch)) then raise exception 'Invalid equipment location or type'; end if;
 if location.branch_id is distinct from branch or location.zone_id is distinct from zone then
   if exists(select 1 from public.inspections where equipment_id=asset.id and completed_at is null) then raise exception 'Inspection still in progress'; end if;
   if exists(select 1 from public.equipment_operators o join public.profiles p on p.id=o.user_id and p.organization_id=o.organization_id
     where o.organization_id=org and o.equipment_id=asset.id and o.ended_at is null
     and p.role<>'CORPORATE_ADMIN' and not exists(select 1 from public.user_branches b where b.organization_id=org and b.user_id=p.id and b.branch_id=branch)
   ) then raise exception 'Assigned operators lack destination access'; end if;
   update public.equipment_assignments set end_date=clock_timestamp() where id=location.id;
   insert into public.equipment_assignments(organization_id,equipment_id,branch_id,zone_id,start_date)
   values(org,asset.id,branch,zone,clock_timestamp());
 end if;
 update public.equipment set internal_code=trim(p_input->>'internal_code'),brand=trim(p_input->>'brand'),model=trim(p_input->>'model'),
   serial_number=nullif(trim(p_input->>'serial_number'),''),year=nullif(p_input->>'year','')::integer,updated_at=clock_timestamp()
 where id=asset.id;
 return asset.public_code;
end $$;

create function public.designate_warehouse_chief(p_user_id uuid,p_branches uuid[],p_expected_role text,p_expected_branches uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=private.org_id(); employee public.profiles; current_branches uuid[]; desired uuid[]; expected uuid[]; b uuid;
begin
 if org is null or private.role()::text not in ('CORPORATE_ADMIN','EHS') then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into employee from public.profiles where id=p_user_id and organization_id=org and active for update;
 if not found or employee.id=auth.uid() or employee.role::text not in ('OPERARIO','JEFE_ALMACEN') then raise exception 'User unavailable'; end if;
 if private.role()::text='EHS' and not private.staff_in_scope(employee.id) then raise exception 'Not authorized' using errcode='42501'; end if;
 if coalesce(cardinality(p_branches),0) not between 1 and 100 or p_expected_branches is null then raise exception 'Invalid branches'; end if;
 select coalesce(array_agg(branch_id order by branch_id),'{}'::uuid[]) into current_branches from public.user_branches where organization_id=org and user_id=employee.id;
 select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into expected from unnest(p_expected_branches) x;
 select array_agg(distinct x order by x) into desired from unnest(p_branches) x;
 foreach b in array (current_branches || desired) loop
   if not exists(select 1 from public.branches where id=b and organization_id=org) or not private.branch_allowed(org,b) then raise exception 'Invalid branch'; end if;
 end loop;
 if employee.role::text is distinct from p_expected_role or current_branches is distinct from expected then raise exception 'User changed. Reload before saving.'; end if;
 if exists(select 1 from public.inspections where user_id=employee.id and completed_at is null) then raise exception 'Inspection still in progress'; end if;
 if exists(select 1 from public.equipment_operators where organization_id=org and user_id=employee.id and ended_at is null
   and not private.equipment_allowed(org,equipment_id)) then raise exception 'Not authorized' using errcode='42501'; end if;
 if employee.role::text='JEFE_ALMACEN' and exists (
   select 1 from public.equipment_operators o join public.equipment_assignments a on a.equipment_id=o.equipment_id and a.organization_id=o.organization_id and a.end_date is null
   where o.organization_id=org and o.user_id=employee.id and o.ended_at is null and not(a.branch_id=any(desired))
 ) then raise exception 'Remove assignment before changing scope'; end if;
 if employee.role='OPERARIO' then
   update public.equipment_operators set ended_at=clock_timestamp() where organization_id=org and user_id=employee.id and ended_at is null;
 end if;
 update public.profiles set role='JEFE_ALMACEN' where id=employee.id;
 delete from public.user_branches where organization_id=org and user_id=employee.id;
 insert into public.user_branches(organization_id,user_id,branch_id) select org,employee.id,unnest(desired);
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(org,auth.uid(),'DESIGNATE_CHIEF','profile',employee.id,jsonb_build_object('previous_role',employee.role,'previous_branches',current_branches,'branches',desired));
 return employee.id;
end $$;
create or replace function public.register_employee(p_auth_id uuid, p_input jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; employee text; selected_role public.app_role; branches uuid[]; b uuid; org_slug text;
begin
 select * into actor from public.profiles where id=auth.uid() and active and not must_change_password for update;
 if actor.id is null or actor.role::text not in ('CORPORATE_ADMIN','JEFE_ALMACEN','EHS') then raise exception 'Not authorized'; end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid employee'; end if;
 employee := p_input->>'employee_id';
 selected_role := (p_input->>'role')::public.app_role;
 if selected_role is null or selected_role::text not in ('OPERARIO','JEFE_ALMACEN','DELEGADO_CENTRO','EHS','DIRECTOR_REGIONAL','DIRECTOR_GENERAL')
 or employee is null or employee !~ '^[a-z0-9_-]{1,40}$'
 or length(trim(coalesce(p_input->>'first_name',''))) not between 1 and 100
 or length(trim(coalesce(p_input->>'last_name',''))) not between 1 and 100 then raise exception 'Invalid employee'; end if;
 if (actor.role::text='JEFE_ALMACEN' and selected_role<>'OPERARIO') or (actor.role::text='EHS' and selected_role::text not in ('OPERARIO','JEFE_ALMACEN')) then raise exception 'Not authorized'; end if;
 select slug into org_slug from public.organizations where id=actor.organization_id;
 if not exists(select 1 from auth.users where id=p_auth_id and email=employee||'@'||org_slug||'.employees.forkcheck.invalid') then raise exception 'Invalid identity'; end if;
 if jsonb_typeof(p_input->'branches') is distinct from 'array' then raise exception 'Invalid branches'; end if;
 if jsonb_array_length(p_input->'branches')>100 then raise exception 'Invalid branches'; end if;
 select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into branches from jsonb_array_elements_text(p_input->'branches');
 if selected_role::text<>'DIRECTOR_GENERAL' and cardinality(branches)=0 then raise exception 'Branches required'; end if;
 foreach b in array branches loop
   if not exists(select 1 from public.branches where id=b and organization_id=actor.organization_id)
      or not private.branch_allowed(actor.organization_id,b) then raise exception 'Invalid branch'; end if;
 end loop;
 insert into public.profiles(id,organization_id,employee_id,first_name,last_name,role)
 values(p_auth_id,actor.organization_id,employee,trim(p_input->>'first_name'),trim(p_input->>'last_name'),selected_role);
 insert into public.user_branches(organization_id,user_id,branch_id) select actor.organization_id,p_auth_id,unnest(branches);
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id)
 values(actor.organization_id,actor.id,'CREATE_USER','profile',p_auth_id);
 return p_auth_id;
end $$;

create function private.assign_equipment_for(p_employee_id text,p_equipment_code text,p_expected_assignment uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid := private.org_id(); employee public.profiles; asset public.equipment; branch uuid;
 current_id uuid; current_equipment uuid; result uuid; chief boolean := private.role()::text in ('JEFE_ALMACEN','EHS');
begin
 if org is null or private.role()::text not in ('CORPORATE_ADMIN','JEFE_ALMACEN','EHS','OPERARIO') then raise exception 'Not authorized' using errcode='42501'; end if;
 if coalesce(length(p_employee_id),0) not between 1 and 40 or coalesce(length(p_equipment_code),0)>60 then raise exception 'Invalid assignment'; end if;
 if nullif(trim(p_equipment_code),'') is not null then
   select * into asset from public.equipment where organization_id=org and internal_code=trim(p_equipment_code) for update;
   if not found or asset.status='INACTIVE' then raise exception 'Equipment unavailable'; end if;
   select branch_id into branch from public.equipment_assignments where equipment_id=asset.id and organization_id=org and end_date is null;
   if branch is null then raise exception 'Equipment has no current location'; end if;
   if not private.branch_allowed(org,branch) then raise exception 'Not authorized' using errcode='42501'; end if;
 end if;
 select * into employee from public.profiles where organization_id=org and employee_id=trim(p_employee_id) and active for update;
 if not found then raise exception 'Employee unavailable'; end if;
 if private.role()='OPERARIO' and employee.id<>auth.uid() then raise exception 'Not authorized' using errcode='42501'; end if;
 if chief and not private.operator_in_scope(employee.id) then raise exception 'Not authorized' using errcode='42501'; end if;
 if asset.id is not null and employee.role<>'CORPORATE_ADMIN' and not exists (
   select 1 from public.user_branches where organization_id=org and user_id=employee.id and branch_id=branch
 ) then raise exception 'Employee is not authorized for this branch'; end if;
 select id,equipment_id into current_id,current_equipment from public.equipment_operators
 where organization_id=org and user_id=employee.id and ended_at is null;
 -- A shared operator may currently work elsewhere. Do not end an out-of-scope assignment.
 if chief and current_equipment is not null and not private.equipment_allowed(org,current_equipment) then
   raise exception 'Not authorized' using errcode='42501';
 end if;
 if current_id is distinct from p_expected_assignment then raise exception 'Assignment changed. Reload before saving.'; end if;
 if asset.id is not null and current_equipment=asset.id then return current_id; end if;
 update public.equipment_operators set ended_at=now() where id=current_id;
 if asset.id is not null then
   insert into public.equipment_operators(organization_id,equipment_id,user_id,assigned_by)
   values(org,asset.id,employee.id,auth.uid()) returning id into result;
 end if;
 return result;
end $$;
create or replace function public.create_equipment(p_input jsonb) returns text language plpgsql security definer set search_path='' as $$
declare org uuid := private.org_id(); equipment_id uuid; code text;
 type_id uuid := (p_input->>'equipment_type_id')::uuid;
 branch uuid := (p_input->>'branch_id')::uuid;
 zone uuid := nullif(p_input->>'zone_id','')::uuid;
 template uuid := (p_input->>'template_id')::uuid;
begin
 if org is null or private.role()::text not in ('CORPORATE_ADMIN','JEFE_ALMACEN','EHS') then raise exception 'Not authorized' using errcode='42501'; end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid input'; end if;
 if coalesce(length(trim(p_input->>'internal_code')),0) not between 1 and 60
 or coalesce(length(trim(p_input->>'brand')),0) not between 1 and 80
 or coalesce(length(trim(p_input->>'model')),0) not between 1 and 80
 or coalesce(length(p_input->>'serial_number'),0)>100 then raise exception 'Invalid equipment details'; end if;
 if not private.branch_allowed(org,branch) or not exists(select 1 from public.branches where id=branch and organization_id=org)
 or not exists(select 1 from public.equipment_types where id=type_id and organization_id=org)
 or (zone is not null and not exists(select 1 from public.zones where id=zone and branch_id=branch and organization_id=org)) then
 raise exception 'Invalid equipment location or type'; end if;
 perform 1 from public.checklist_templates where id=template and organization_id=org and archived_at is null for share;
 if not found then raise exception 'Template unavailable'; end if;
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

revoke all on function private.assign_equipment_for(text,text,uuid) from public,anon,authenticated;
revoke all on function public.assign_equipment(text,text,uuid),public.assign_my_equipment(text,uuid),public.create_equipment(jsonb),
 public.update_equipment(text,timestamptz,jsonb),public.register_employee(uuid,jsonb),public.designate_warehouse_chief(uuid,uuid[],text,uuid[]) from public,anon;
grant execute on function public.assign_equipment(text,text,uuid),public.assign_my_equipment(text,uuid),public.create_equipment(jsonb),
 public.update_equipment(text,timestamptz,jsonb),public.register_employee(uuid,jsonb),public.designate_warehouse_chief(uuid,uuid[],text,uuid[]) to authenticated;
notify pgrst, 'reload schema';