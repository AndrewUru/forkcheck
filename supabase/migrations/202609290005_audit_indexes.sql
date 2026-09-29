-- Administrative scope changes also belong in the immutable client-visible audit trail.
create or replace function private.audit_change() returns trigger language plpgsql security definer set search_path = '' as $$
 declare row_data jsonb; org uuid; entity uuid; begin
 row_data := case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
 org := case when TG_TABLE_NAME = 'organizations' then (row_data->>'id')::uuid else (row_data->>'organization_id')::uuid end;
 entity := coalesce(row_data->>'id',row_data->>'user_id')::uuid;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(org,auth.uid(),TG_OP,TG_TABLE_NAME,entity,
 jsonb_build_object('before',case when TG_OP <> 'INSERT' then to_jsonb(old) end,'after',case when TG_OP <> 'DELETE' then to_jsonb(new) end));
 if TG_OP = 'DELETE' then return old; else return new; end if;
 end $$;
create trigger audit_scope after insert or update or delete on public.user_branches for each row execute function private.audit_change();
create trigger audit_organization after insert or update on public.organizations for each row execute function private.audit_change();
create trigger audit_equipment_type after insert or update or delete on public.equipment_types for each row execute function private.audit_change();
create index inspection_equipment_history on public.inspections(organization_id,equipment_id,started_at desc);
create index inspection_schedule_date on public.inspections(schedule_id,due_date,completed_at);
create index incident_equipment_history on public.incidents(organization_id,equipment_id,created_at desc);
create index schedule_equipment_due on public.equipment_schedules(equipment_id,next_due) where active;
create index checklist_items_version on public.checklist_items(version_id,sort_order);
create index checklist_sections_version on public.checklist_sections(version_id,sort_order);
create index attachment_incident on public.incident_attachments(incident_id);
create index maintenance_equipment on public.maintenance_orders(organization_id,equipment_id,created_at desc);
create index branch_region on public.branches(organization_id,region_id,name);
create index equipment_type on public.equipment(organization_id,equipment_type_id);
