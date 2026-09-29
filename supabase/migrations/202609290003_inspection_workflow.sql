create function public.start_inspection(p_schedule uuid) returns uuid language plpgsql security definer set search_path = '' as $$
 declare s public.equipment_schedules; e public.equipment; a public.equipment_assignments; v uuid; draft public.inspections; result uuid;
 begin
 if private.role() not in ('OPERARIO','SUPERVISOR','CORPORATE_ADMIN') or private.org_id() is null then raise exception 'Not authorized' using errcode='42501'; end if;
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

create function public.finish_inspection(p_inspection uuid, p_answers jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
 declare i public.inspections; item public.checklist_items; entry jsonb; kind public.answer_kind; sev public.severity;
 ans_id uuid; incident_id uuid; sig_id uuid; photo text; prefix text; sig_path text; obj storage.objects;
 result public.answer_kind := 'OK'; must_block boolean := false; has_warning boolean := false; t public.checklist_templates; completed_date date;
 begin
 select * into i from public.inspections where id=p_inspection for update;
 if not found or i.organization_id is distinct from private.org_id() or i.user_id is distinct from auth.uid()
 or not private.branch_allowed(i.organization_id,i.branch_id) or private.role() not in ('OPERARIO','SUPERVISOR','CORPORATE_ADMIN') then
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

-- security_invoker keeps underlying table RLS active for all API reads.
create view public.equipment_overview with (security_invoker=true) as
 select e.*, t.name as type_name, a.branch_id, a.zone_id, b.name as branch_name, b.region_id, r.name as region_name, z.name as zone_name,
 (select max(i.completed_at) from public.inspections i where i.equipment_id=e.id) as last_inspection,
 (select min(s.next_due) from public.equipment_schedules s where s.equipment_id=e.id and s.active) as next_inspection,
 (select count(*)::integer from public.incidents i where i.equipment_id=e.id and i.status <> 'CLOSED') as open_incidents
 from public.equipment e join public.equipment_types t on t.id=e.equipment_type_id
 left join public.equipment_assignments a on a.equipment_id=e.id and a.end_date is null
 left join public.branches b on b.id=a.branch_id left join public.regions r on r.id=b.region_id left join public.zones z on z.id=a.zone_id;
grant select on public.equipment_overview to authenticated;
