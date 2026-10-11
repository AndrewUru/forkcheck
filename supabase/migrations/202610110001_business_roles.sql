-- Rename enum values in place: identities, branch grants and historical FKs stay intact.
alter type public.app_role rename value 'SUPERVISOR' to 'JEFE_ALMACEN';
alter type public.app_role rename value 'REGIONAL_MANAGER' to 'DIRECTOR_REGIONAL';
alter type public.app_role add value 'DELEGADO_CENTRO';
alter type public.app_role add value 'EHS';
alter type public.app_role add value 'DIRECTOR_GENERAL';

-- Compare text here so the migration can also run inside the fresh-install transaction.
-- Newly added enum values cannot be used as enum literals until that transaction commits.
create or replace function private.branch_allowed(org uuid, branch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select coalesce(org = private.org_id() and (
   private.role()::text in ('CORPORATE_ADMIN','DIRECTOR_GENERAL') or exists (
     select 1 from public.user_branches
     where organization_id=org and branch_id=branch and user_id=auth.uid()
   )
 ), false)
$$;
create or replace function private.equipment_allowed(org uuid, equipment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select coalesce(org = private.org_id() and (
   private.role()::text in ('CORPORATE_ADMIN','DIRECTOR_GENERAL') or exists (
     select 1 from public.equipment_assignments a
     where a.organization_id=org and a.equipment_id=equipment and a.end_date is null
       and private.branch_allowed(org,a.branch_id)
   )
 ), false)
$$;

-- Security definer avoids recursive profiles/user_branches RLS. No caller-supplied actor.
create function private.operator_in_scope(employee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select coalesce(private.role()::text='JEFE_ALMACEN' and exists (
   select 1 from public.profiles p join public.user_branches b
     on b.organization_id=p.organization_id and b.user_id=p.id
   where p.id=employee and p.organization_id=private.org_id() and p.role='OPERARIO'
     and private.branch_allowed(p.organization_id,b.branch_id)
 ),false)
$$;
revoke all on function private.branch_allowed(uuid,uuid), private.equipment_allowed(uuid,uuid),
 private.operator_in_scope(uuid) from public,anon;
grant execute on function private.branch_allowed(uuid,uuid), private.equipment_allowed(uuid,uuid),
 private.operator_in_scope(uuid) to authenticated;

drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (
 (id=auth.uid() and active) or (organization_id=private.org_id() and (
   private.role()='CORPORATE_ADMIN' or private.operator_in_scope(id)
 ))
);
drop policy assignments_read on public.user_branches;
create policy assignments_read on public.user_branches for select to authenticated using (
 organization_id=private.org_id() and (
   user_id=auth.uid() or private.role()='CORPORATE_ADMIN'
   or (private.operator_in_scope(user_id) and private.branch_allowed(organization_id,branch_id))
 )
);
drop policy operators_read on public.equipment_operators;
create policy operators_read on public.equipment_operators for select to authenticated using (
 organization_id=private.org_id() and (
   user_id=auth.uid() or private.role()='CORPORATE_ADMIN'
   or (private.operator_in_scope(user_id) and private.equipment_allowed(organization_id,equipment_id))
 )
);

create or replace function public.register_employee(p_auth_id uuid, p_input jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; employee text; selected_role public.app_role; branches uuid[]; b uuid; org_slug text;
begin
 select * into actor from public.profiles where id=auth.uid() and active and not must_change_password for update;
 if actor.id is null or actor.role::text not in ('CORPORATE_ADMIN','JEFE_ALMACEN') then raise exception 'Not authorized'; end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid employee'; end if;
 employee := p_input->>'employee_id';
 selected_role := (p_input->>'role')::public.app_role;
 if selected_role is null or selected_role::text not in ('OPERARIO','JEFE_ALMACEN','DELEGADO_CENTRO','EHS','DIRECTOR_REGIONAL','DIRECTOR_GENERAL')
 or employee is null or employee !~ '^[a-z0-9_-]{1,40}$'
 or length(trim(coalesce(p_input->>'first_name',''))) not between 1 and 100
 or length(trim(coalesce(p_input->>'last_name',''))) not between 1 and 100 then raise exception 'Invalid employee'; end if;
 if actor.role::text='JEFE_ALMACEN' and selected_role<>'OPERARIO' then raise exception 'Not authorized'; end if;
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

create or replace function public.assign_equipment(p_employee_id text,p_equipment_code text,p_expected_assignment uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid := private.org_id(); employee public.profiles; asset public.equipment; branch uuid;
 current_id uuid; current_equipment uuid; result uuid; chief boolean := private.role()::text='JEFE_ALMACEN';
begin
 if org is null or private.role()::text not in ('CORPORATE_ADMIN','JEFE_ALMACEN') then raise exception 'Not authorized' using errcode='42501'; end if;
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
revoke all on function public.register_employee(uuid,jsonb),public.assign_equipment(text,text,uuid) from public,anon;
grant execute on function public.register_employee(uuid,jsonb),public.assign_equipment(text,text,uuid) to authenticated;

-- Rebind the existing workflow to the renamed roles; transactional behavior is unchanged.
create or replace function public.start_inspection(p_schedule uuid) returns uuid language plpgsql security definer set search_path = '' as $$
 declare s public.equipment_schedules; e public.equipment; a public.equipment_assignments; v uuid; draft public.inspections; result uuid;
 begin
 if private.role() not in ('OPERARIO','JEFE_ALMACEN','CORPORATE_ADMIN') or private.org_id() is null then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into s from public.equipment_schedules where id=p_schedule and organization_id=private.org_id() and active for update;
 if not found then raise exception 'Schedule unavailable'; end if;
 select * into e from public.equipment where id=s.equipment_id for update;
 select * into a from public.equipment_assignments where equipment_id=e.id and end_date is null;
 if not found or not private.branch_allowed(e.organization_id,a.branch_id) then raise exception 'Not authorized' using errcode='42501'; end if;
 if e.status in ('INACTIVE','MAINTENANCE') then raise exception 'Equipment unavailable for inspection'; end if;
 select * into draft from public.inspections where equipment_id=e.id and checklist_template_id=s.template_id and completed_at is null;
 if found then
   if draft.user_id=auth.uid() then return draft.id; end if;
   raise exception 'Another operator is inspecting this equipment';
 end if;
 select id into v from public.checklist_versions where template_id=s.template_id and published_at is not null order by version desc limit 1;
 if v is null or not exists(select 1 from public.checklist_items where version_id=v) then raise exception 'No published checklist'; end if;
 insert into public.inspections(organization_id,branch_id,equipment_id,user_id,checklist_template_id,checklist_version_id,schedule_id,due_date)
 values(e.organization_id,a.branch_id,e.id,auth.uid(),s.template_id,v,s.id,s.next_due) returning id into result;
 return result;
 end $$;

create or replace function public.finish_inspection(p_inspection uuid, p_answers jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
 declare i public.inspections; item public.checklist_items; entry jsonb; kind public.answer_kind; sev public.severity;
 ans_id uuid; incident_id uuid; sig_id uuid; photo text; prefix text; sig_path text; obj storage.objects;
 result public.answer_kind := 'OK'; must_block boolean := false; has_warning boolean := false; t public.checklist_templates; completed_date date;
 begin
 select * into i from public.inspections where id=p_inspection for update;
 if not found or i.organization_id is distinct from private.org_id() or i.user_id is distinct from auth.uid()
 or not private.branch_allowed(i.organization_id,i.branch_id) or private.role() not in ('OPERARIO','JEFE_ALMACEN','CORPORATE_ADMIN') then
 raise exception 'Not authorized' using errcode='42501'; end if;
 if i.completed_at is not null then return i.id; end if;
 -- Serialize finalization with equipment changes. Never silently inspect a relocated machine.
 perform 1 from public.equipment where id=i.equipment_id for update;
 if not exists(select 1 from public.equipment_assignments where equipment_id=i.equipment_id and branch_id=i.branch_id and end_date is null) then raise exception 'Equipment location changed'; end if;
 if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers)>500 then raise exception 'Invalid answers'; end if;
 if exists(select 1 from jsonb_array_elements(p_answers) x group by x->>'item_id' having count(*)>1) then raise exception 'Duplicate answers'; end if;
 if exists(select 1 from jsonb_array_elements(p_answers) x where not exists(select 1 from public.checklist_items c where c.id=(x->>'item_id')::uuid and c.version_id=i.checklist_version_id)) then raise exception 'Item does not belong to inspection version'; end if;
 prefix := i.organization_id::text || '/' || i.id::text || '/';
 sig_path := prefix || 'signature.png';
 if not exists(select 1 from storage.objects where bucket_id='inspection-evidence' and name=sig_path and metadata->>'mimetype'='image/png' and (metadata->>'size')::bigint between 1 and 5242880) then raise exception 'Signature required'; end if;
 for item in select * from public.checklist_items where version_id=i.checklist_version_id order by sort_order loop
   select value into entry from jsonb_array_elements(p_answers) where value->>'item_id'=item.id::text;
   if entry is null then
     if item.required then raise exception 'Required item unanswered: %',item.label; else continue; end if;
   end if;
   kind := (entry->>'answer')::public.answer_kind;
   if kind is null or not(kind=any(item.allowed_answers)) then raise exception 'Answer not permitted'; end if;
   if length(coalesce(entry->>'notes',''))>4000 then raise exception 'Notes too long'; end if;
   sev := null;
   if kind in ('WARNING','CRITICAL') then
     if length(trim(coalesce(entry->>'notes','')))=0 then raise exception 'Failure description required'; end if;
     sev := case when item.blocks_equipment_on_failure or kind='CRITICAL' then 'CRITICAL'::public.severity else item.severity_when_failed end;
     must_block := must_block or item.blocks_equipment_on_failure or kind='CRITICAL' or sev='CRITICAL';
     has_warning := true;
     if sev='CRITICAL' then result := 'CRITICAL'; elsif result <> 'CRITICAL' then result := 'WARNING'; end if;
     if item.requires_photo_on_failure and coalesce(jsonb_array_length(entry->'photos'),0)=0 then raise exception 'Photo required'; end if;
   end if;
   insert into public.inspection_answers(organization_id,inspection_id,checklist_version_id,checklist_item_id,answer,notes,severity)
   values(i.organization_id,i.id,i.checklist_version_id,item.id,kind,coalesce(entry->>'notes',''),sev) returning id into ans_id;
   if sev is not null then
     insert into public.incidents(organization_id,branch_id,equipment_id,inspection_id,inspection_answer_id,reported_by,severity,title,description)
     values(i.organization_id,i.branch_id,i.equipment_id,i.id,ans_id,auth.uid(),sev,item.label,entry->>'notes') returning id into incident_id;
     if coalesce(jsonb_array_length(entry->'photos'),0)>5 then raise exception 'Too many photos'; end if;
     for photo in select jsonb_array_elements_text(coalesce(entry->'photos','[]')) loop
       if photo not like prefix || item.id::text || '/%' then raise exception 'Invalid photo path'; end if;
       select * into obj from storage.objects where bucket_id='inspection-evidence' and name=photo;
       if not found or obj.metadata->>'mimetype' not in ('image/jpeg','image/png','image/webp') or coalesce((obj.metadata->>'size')::bigint,0) not between 1 and 5242880 then raise exception 'Invalid photo'; end if;
       insert into public.incident_attachments(organization_id,incident_id,storage_path,mime_type,uploaded_by)
       values(i.organization_id,incident_id,photo,obj.metadata->>'mimetype',auth.uid());
     end loop;
   end if;
 end loop;
 insert into public.signatures(organization_id,user_id,inspection_id,storage_path) values(i.organization_id,auth.uid(),i.id,sig_path) returning id into sig_id;
 update public.inspections set completed_at=now(),overall_status=result,signature_id=sig_id where id=i.id;
 update public.equipment set status=case when must_block then 'BLOCKED'::public.equipment_status
 when has_warning and status='OPERATIVE' then 'WARNING'::public.equipment_status else status end,updated_at=now() where id=i.equipment_id;
 select * into t from public.checklist_templates where id=i.checklist_template_id;
 select (now() at time zone timezone)::date into completed_date from public.organizations where id=i.organization_id;
 update public.equipment_schedules set next_due=case t.frequency
 when 'DAILY' then completed_date+1 when 'WEEKLY' then completed_date+7 when 'MONTHLY' then (completed_date+interval '1 month')::date
 when 'QUARTERLY' then (completed_date+interval '3 months')::date when 'SEMIANNUAL' then (completed_date+interval '6 months')::date
 when 'ANNUAL' then (completed_date+interval '1 year')::date else completed_date+t.custom_days end where id=i.schedule_id;
 return i.id;
 end $$;
revoke all on function public.start_inspection(uuid) from public,anon;
revoke all on function public.finish_inspection(uuid,jsonb) from public,anon;
grant execute on function public.start_inspection(uuid),public.finish_inspection(uuid,jsonb) to authenticated;


create or replace function private.can_upload(path text) returns boolean language plpgsql stable security definer set search_path = '' as $$
 declare parts text[] := string_to_array(path,'/'); begin
 return exists(select 1 from public.inspections i where i.id = parts[2]::uuid and i.organization_id = parts[1]::uuid
 and i.organization_id = private.org_id() and i.user_id = auth.uid() and i.completed_at is null
 and private.branch_allowed(i.organization_id,i.branch_id) and private.role() in ('OPERARIO','JEFE_ALMACEN','CORPORATE_ADMIN')
 and ((cardinality(parts)=3 and parts[3]='signature.png') or (cardinality(parts)=4 and exists(
 select 1 from public.checklist_items ci where ci.version_id=i.checklist_version_id and ci.id=parts[3]::uuid))));
 exception when invalid_text_representation then return false;
 end $$;

revoke all on function private.can_upload(text) from public,anon;
grant execute on function private.can_upload(text) to authenticated;
-- KPIs de flota activa; las bajas siguen consultables en el historico.
create or replace function public.dashboard_metrics(p_date date, p_region uuid default null, p_branch uuid default null, p_zone uuid default null, p_type uuid default null, p_brand text default null, p_model text default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
 begin
 if private.role() is null or private.role() not in ('JEFE_ALMACEN','DELEGADO_CENTRO','EHS','DIRECTOR_REGIONAL','DIRECTOR_GENERAL','CORPORATE_ADMIN') then raise exception 'Not authorized' using errcode='42501'; end if;
 return (
 with assets as (
 select * from public.equipment_overview e where e.status <> 'INACTIVE' and (p_region is null or region_id=p_region) and (p_branch is null or branch_id=p_branch)
 and (p_zone is null or zone_id=p_zone) and (p_type is null or equipment_type_id=p_type) and (p_brand is null or brand=p_brand) and (p_model is null or model=p_model)
 ), due as (
 select s.id from public.equipment_schedules s join assets e on e.id=s.equipment_id where s.active and e.status <> 'INACTIVE'
 and (s.next_due<=p_date or exists(select 1 from public.inspections i where i.schedule_id=s.id and i.due_date<=p_date and i.completed_at is not null
 and (i.completed_at at time zone (select timezone from public.organizations where id=i.organization_id))::date>=p_date))
 ), done as (
 select distinct i.schedule_id from public.inspections i join assets e on e.id=i.equipment_id join due d on d.id=i.schedule_id
 where (i.completed_at at time zone (select timezone from public.organizations where id=i.organization_id))::date=p_date
 ), issues as (select i.* from public.incidents i join assets e on e.id=i.equipment_id where i.status <> 'CLOSED')
 select jsonb_build_object('branches',(select count(*) from public.branches where (p_region is null or region_id=p_region) and (p_branch is null or id=p_branch)),
 'equipment',(select count(*) from assets),'operative',(select count(*) from assets where status='OPERATIVE'),
 'warning',(select count(*) from assets where status='WARNING'),'blocked',(select count(*) from assets where status='BLOCKED'),
 'due',(select count(*) from due),'completed',(select count(*) from done),'pending',(select count(*) from due where id not in(select schedule_id from done)),
 'incidents',(select count(*) from issues),'critical',(select count(*) from issues where severity='CRITICAL'))
 );
 end $$;
revoke all on function public.dashboard_metrics(date,uuid,uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.dashboard_metrics(date,uuid,uuid,uuid,uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
