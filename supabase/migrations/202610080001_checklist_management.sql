alter table public.checklist_templates add column archived_at timestamptz;
alter table public.checklist_versions add column edit_revision integer not null default 0 check(edit_revision >= 0);
create unique index checklist_one_draft on public.checklist_versions(template_id) where published_at is null;
create index checklist_catalog on public.checklist_templates(organization_id,name,id);
create index checklist_versions_history on public.checklist_versions(organization_id,template_id,version desc);

create view public.available_checklist_templates with (security_invoker=true) as
select t.* from public.checklist_templates t where t.archived_at is null
and exists(select 1 from public.checklist_versions v where v.template_id=t.id and v.published_at is not null);
grant select on public.available_checklist_templates to authenticated;

-- Only authorized RPCs below can invoke this helper; IDs are never accepted without scope checks.
create function private.copy_checklist(p_source uuid,p_target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.checklist_sections; section_id uuid; org uuid;
begin
 select organization_id into org from public.checklist_versions where id=p_target and published_at is null;
 if org is null or org is distinct from private.org_id() or private.role() is distinct from 'CORPORATE_ADMIN'
 or not exists(select 1 from public.checklist_versions where id=p_source and organization_id=org) then raise exception 'Not authorized'; end if;
 if (select count(*) from public.checklist_sections where version_id=p_source)>30 or (select count(*) from public.checklist_items where version_id=p_source)>200 then raise exception 'Checklist exceeds editor limits'; end if;
 for s in select * from public.checklist_sections where version_id=p_source order by sort_order loop
   insert into public.checklist_sections(organization_id,version_id,title,sort_order)
   values(org,p_target,s.title,s.sort_order) returning id into section_id;
   insert into public.checklist_items(organization_id,version_id,section_id,label,description,sort_order,required,severity_when_failed,requires_photo_on_failure,blocks_equipment_on_failure,allowed_answers)
   select org,p_target,section_id,label,description,sort_order,required,severity_when_failed,requires_photo_on_failure,blocks_equipment_on_failure,allowed_answers
   from public.checklist_items where version_id=p_source and checklist_items.section_id=s.id;
 end loop;
end $$;
revoke all on function private.copy_checklist(uuid,uuid) from public,anon,authenticated;

create function public.create_checklist_template(p_input jsonb,p_source uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.org_id(); template uuid; version_id uuid; kind uuid; freq public.frequency; days integer;
begin
 if org is null or private.role() is distinct from 'CORPORATE_ADMIN' then raise exception 'Not authorized'; end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'name') is distinct from 'string' or length(trim(coalesce(p_input->>'name',''))) not between 1 and 120 then raise exception 'Invalid template'; end if;
 kind:=(p_input->>'equipment_type_id')::uuid; freq:=(p_input->>'frequency')::public.frequency;
 days:=nullif(p_input->>'custom_days','')::integer;
 if freq is null or (freq='CUSTOM' and (days is null or days not between 1 and 3650)) then raise exception 'Invalid frequency'; end if;
 if not exists(select 1 from public.equipment_types where id=kind and organization_id=org) then raise exception 'Invalid equipment type'; end if;
 if p_source is not null then
   perform 1 from public.checklist_versions where id=p_source and organization_id=org for update;
   if not found then raise exception 'Version unavailable'; end if;
 end if;
 insert into public.checklist_templates(organization_id,equipment_type_id,name,frequency,custom_days)
 values(org,kind,trim(p_input->>'name'),freq,case when freq='CUSTOM' then days end) returning id into template;
 insert into public.checklist_versions(organization_id,template_id,version) values(org,template,1) returning id into version_id;
 if p_source is not null then perform private.copy_checklist(p_source,version_id); end if;
 return template;
end $$;

create function public.create_checklist_draft(p_template uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.org_id(); result uuid; source uuid; next_version integer;
begin
 if org is null or private.role() is distinct from 'CORPORATE_ADMIN' then raise exception 'Not authorized'; end if;
 perform 1 from public.checklist_templates where id=p_template and organization_id=org and archived_at is null for update;
 if not found then raise exception 'Template unavailable'; end if;
 select id into result from public.checklist_versions where template_id=p_template and published_at is null;
 if found then return result; end if;
 select id into source from public.checklist_versions where template_id=p_template and published_at is not null order by version desc limit 1;
 select coalesce(max(version),0)+1 into next_version from public.checklist_versions where template_id=p_template;
 insert into public.checklist_versions(organization_id,template_id,version) values(org,p_template,next_version) returning id into result;
 if source is not null then perform private.copy_checklist(source,result); end if;
 return result;
end $$;

create function public.save_checklist_draft(p_version uuid,p_revision integer,p_sections jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.org_id(); v public.checklist_versions; section jsonb; item jsonb; sid uuid; section_order integer:=0; item_order integer; total integer:=0; answers public.answer_kind[];
begin
 if org is null or private.role() is distinct from 'CORPORATE_ADMIN' then raise exception 'Not authorized'; end if;
 -- Lock parent first, consistently with publishing/retirement and draft creation.
 perform 1 from public.checklist_templates t join public.checklist_versions c on c.template_id=t.id
 where c.id=p_version and t.organization_id=org and t.archived_at is null for update of t;
 if not found then raise exception 'Template unavailable'; end if;
 select * into v from public.checklist_versions where id=p_version and organization_id=org for update;
 if v.published_at is not null then raise exception 'Published versions are immutable'; end if;
 if p_revision is distinct from v.edit_revision then raise exception 'Draft changed. Reload before saving.'; end if;
 if jsonb_typeof(p_sections) is distinct from 'array' then raise exception 'Invalid sections'; end if;
 if jsonb_array_length(p_sections) not between 1 and 30 then raise exception 'Invalid sections'; end if;
 delete from public.checklist_items where version_id=v.id;
 delete from public.checklist_sections where version_id=v.id;
 for section in select value from jsonb_array_elements(p_sections) loop
   if jsonb_typeof(section) is distinct from 'object' or jsonb_typeof(section->'title') is distinct from 'string' or length(trim(coalesce(section->>'title',''))) not between 1 and 120
   or jsonb_typeof(section->'items') is distinct from 'array' then raise exception 'Invalid section'; end if;
   if jsonb_array_length(section->'items') not between 1 and 200 then raise exception 'Invalid questions'; end if;
   total:=total+jsonb_array_length(section->'items');
   if total>200 then raise exception 'Too many questions'; end if;
   section_order:=section_order+1; item_order:=0;
   insert into public.checklist_sections(organization_id,version_id,title,sort_order)
   values(org,v.id,trim(section->>'title'),section_order) returning id into sid;
   for item in select value from jsonb_array_elements(section->'items') loop
     if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'label') is distinct from 'string' or length(trim(coalesce(item->>'label',''))) not between 1 and 300
     or jsonb_typeof(item->'description') is distinct from 'string' or length(item->>'description')>2000
     or jsonb_typeof(item->'required') is distinct from 'boolean'
     or jsonb_typeof(item->'requires_photo_on_failure') is distinct from 'boolean'
     or jsonb_typeof(item->'blocks_equipment_on_failure') is distinct from 'boolean'
     or item->>'severity_when_failed' is null
     or jsonb_typeof(item->'allowed_answers') is distinct from 'array' then raise exception 'Invalid question'; end if;
     if jsonb_array_length(item->'allowed_answers') not between 1 and 4 then raise exception 'Invalid answers'; end if;
     select array_agg(value::public.answer_kind) into answers from jsonb_array_elements_text(item->'allowed_answers');
     if array_position(answers,null) is not null or cardinality(answers)<>(select count(distinct a) from unnest(answers) a) then raise exception 'Invalid answers'; end if;
     item_order:=item_order+1;
     insert into public.checklist_items(organization_id,version_id,section_id,label,description,sort_order,required,severity_when_failed,requires_photo_on_failure,blocks_equipment_on_failure,allowed_answers)
     values(org,v.id,sid,trim(item->>'label'),item->>'description',item_order,(item->>'required')::boolean,(item->>'severity_when_failed')::public.severity,(item->>'requires_photo_on_failure')::boolean,(item->>'blocks_equipment_on_failure')::boolean,answers);
   end loop;
 end loop;
 update public.checklist_versions set edit_revision=edit_revision+1 where id=v.id returning edit_revision into p_revision;
 return p_revision;
end $$;

create function public.publish_checklist_version(p_version uuid,p_revision integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.org_id(); v public.checklist_versions;
begin
 if org is null or private.role() is distinct from 'CORPORATE_ADMIN' then raise exception 'Not authorized'; end if;
 perform 1 from public.checklist_templates t join public.checklist_versions c on c.template_id=t.id
 where c.id=p_version and t.organization_id=org and t.archived_at is null for update of t;
 if not found then raise exception 'Template unavailable'; end if;
 select * into v from public.checklist_versions where id=p_version and organization_id=org for update;
 if p_revision is distinct from v.edit_revision then raise exception 'Draft changed. Reload before publishing.'; end if;
 if v.published_at is not null then return v.id; end if;
 if (select count(*) from public.checklist_sections where version_id=v.id) not between 1 and 30
 or (select count(*) from public.checklist_items where version_id=v.id) not between 1 and 200
 or exists(select 1 from public.checklist_sections s where s.version_id=v.id and not exists(select 1 from public.checklist_items where section_id=s.id)) then raise exception 'Complete the draft before publishing'; end if;
 update public.checklist_versions set published_at=now() where id=v.id;
 return v.id;
end $$;

create function public.retire_checklist_template(p_template uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.org_id();
begin
 if org is null or private.role() is distinct from 'CORPORATE_ADMIN' then raise exception 'Not authorized'; end if;
 perform 1 from public.checklist_templates where id=p_template and organization_id=org for update;
 if not found then raise exception 'Template unavailable'; end if;
 update public.checklist_templates set archived_at=now() where id=p_template and archived_at is null;
 return p_template;
end $$;

revoke all on function public.create_checklist_template(jsonb,uuid),public.create_checklist_draft(uuid),public.save_checklist_draft(uuid,integer,jsonb),public.publish_checklist_version(uuid,integer),public.retire_checklist_template(uuid) from public,anon;
grant execute on function public.create_checklist_template(jsonb,uuid),public.create_checklist_draft(uuid),public.save_checklist_draft(uuid,integer,jsonb),public.publish_checklist_version(uuid,integer),public.retire_checklist_template(uuid) to authenticated;

-- Retired templates cannot be assigned to new equipment. Existing plans remain valid.
create or replace function public.create_equipment(p_input jsonb) returns text language plpgsql security definer set search_path='' as $$
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
