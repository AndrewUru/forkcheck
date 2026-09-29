create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create function private.org_id() returns uuid language sql stable security definer set search_path = '' as $$
 select organization_id from public.profiles where id = auth.uid() and active
$$;
create function private.role() returns public.app_role language sql stable security definer set search_path = '' as $$
 select role from public.profiles where id = auth.uid() and active
$$;
create function private.branch_allowed(org uuid, branch uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(org = private.org_id() and (private.role() = 'CORPORATE_ADMIN' or exists (
 select 1 from public.user_branches where organization_id = org and branch_id = branch and user_id = auth.uid())), false)
$$;
create function private.equipment_allowed(org uuid, equipment uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(org = private.org_id() and (private.role() = 'CORPORATE_ADMIN' or exists(
 select 1 from public.equipment_assignments a where a.equipment_id = equipment and a.end_date is null and private.branch_allowed(org,a.branch_id))),false)
$$;
create function private.inspection_allowed(org uuid, inspection uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.inspections i where i.id = inspection and i.organization_id = org and private.branch_allowed(org,i.branch_id))
$$;
create function private.incident_allowed(org uuid, incident uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.incidents i where i.id = incident and i.organization_id = org and private.branch_allowed(org,i.branch_id))
$$;

do $$ declare t text; begin
 foreach t in array array['organizations','regions','branches','zones','profiles','user_branches','equipment_types','equipment','equipment_assignments','checklist_templates','checklist_versions','checklist_sections','checklist_items','equipment_schedules','inspections','inspection_answers','incidents','incident_attachments','signatures','maintenance_orders','maintenance_actions','audit_logs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy organizations_read on public.organizations for select to authenticated using(id = private.org_id());
create policy profiles_read on public.profiles for select to authenticated using(organization_id = private.org_id() and (id = auth.uid() or private.role() = 'CORPORATE_ADMIN'));
create policy assignments_read on public.user_branches for select to authenticated using(organization_id = private.org_id() and (user_id = auth.uid() or private.role() = 'CORPORATE_ADMIN'));
create policy regions_read on public.regions for select to authenticated using(organization_id = private.org_id());
create policy branches_read on public.branches for select to authenticated using(private.branch_allowed(organization_id,id));
create policy zones_read on public.zones for select to authenticated using(private.branch_allowed(organization_id,branch_id));
create policy equipment_read on public.equipment for select to authenticated using(private.equipment_allowed(organization_id,id));
create policy equipment_assignments_read on public.equipment_assignments for select to authenticated using(private.branch_allowed(organization_id,branch_id));
create policy schedules_read on public.equipment_schedules for select to authenticated using(private.equipment_allowed(organization_id,equipment_id));
do $$ declare t text; begin
 foreach t in array array['equipment_types','checklist_templates','checklist_versions','checklist_sections','checklist_items'] loop
 execute format('create policy tenant_read on public.%I for select to authenticated using(organization_id = private.org_id())',t);
 end loop;
end $$;
create policy inspections_read on public.inspections for select to authenticated using(private.branch_allowed(organization_id,branch_id));
create policy answers_read on public.inspection_answers for select to authenticated using(private.inspection_allowed(organization_id,inspection_id));
create policy incidents_read on public.incidents for select to authenticated using(private.branch_allowed(organization_id,branch_id));
create policy attachments_read on public.incident_attachments for select to authenticated using(private.incident_allowed(organization_id,incident_id));
create policy signatures_read on public.signatures for select to authenticated using(private.inspection_allowed(organization_id,inspection_id));
create policy maintenance_read on public.maintenance_orders for select to authenticated using(private.branch_allowed(organization_id,branch_id));
create policy actions_read on public.maintenance_actions for select to authenticated using(exists(select 1 from public.maintenance_orders m where m.id = order_id));
create policy audit_read on public.audit_logs for select to authenticated using(organization_id = private.org_id() and private.role() = 'CORPORATE_ADMIN');

-- Even trusted administrative tooling cannot accidentally rewrite published history.
create function private.freeze_checklist() returns trigger language plpgsql set search_path = '' as $$
 declare v uuid; begin
 if TG_TABLE_NAME = 'checklist_versions' then
   if old.published_at is not null then raise exception 'Published versions are immutable'; end if;
 else
   if TG_OP <> 'INSERT' then
     v := old.version_id;
     perform 1 from public.checklist_versions where id=v for update;
     if exists(select 1 from public.checklist_versions where id=v and published_at is not null) then raise exception 'Published checklist is immutable'; end if;
   end if;
   if TG_OP <> 'DELETE' then
     v := new.version_id;
     perform 1 from public.checklist_versions where id=v for update;
     if exists(select 1 from public.checklist_versions where id=v and published_at is not null) then raise exception 'Published checklist is immutable'; end if;
   end if;
 end if;
 if TG_OP = 'DELETE' then return old; else return new; end if;
 end $$;
create trigger freeze_version before update or delete on public.checklist_versions for each row execute function private.freeze_checklist();
create trigger freeze_sections before insert or update or delete on public.checklist_sections for each row execute function private.freeze_checklist();
create trigger freeze_items before insert or update or delete on public.checklist_items for each row execute function private.freeze_checklist();

create function private.audit_change() returns trigger language plpgsql security definer set search_path = '' as $$
 declare row_data jsonb; begin
 row_data := case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
 values((row_data->>'organization_id')::uuid,auth.uid(),TG_OP,TG_TABLE_NAME,(row_data->>'id')::uuid,
 jsonb_build_object('before',case when TG_OP <> 'INSERT' then to_jsonb(old) end,'after',case when TG_OP <> 'DELETE' then to_jsonb(new) end));
 if TG_OP = 'DELETE' then return old; else return new; end if;
 end $$;
do $$ declare t text; begin
 foreach t in array array['equipment','equipment_assignments','inspections','incidents','maintenance_orders','maintenance_actions','checklist_templates','checklist_versions','checklist_sections','checklist_items','profiles','regions','branches','zones','equipment_schedules'] loop
 execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_change()',t);
 end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('inspection-evidence','inspection-evidence',false,5242880,array['image/png','image/jpeg','image/webp']);
-- Paths: org/inspection/signature.png or org/inspection/item/filename.ext.
create function private.can_upload(path text) returns boolean language plpgsql stable security definer set search_path = '' as $$
 declare parts text[] := string_to_array(path,'/'); begin
 return exists(select 1 from public.inspections i where i.id = parts[2]::uuid and i.organization_id = parts[1]::uuid
 and i.organization_id = private.org_id() and i.user_id = auth.uid() and i.completed_at is null
 and private.branch_allowed(i.organization_id,i.branch_id) and private.role() in ('OPERARIO','SUPERVISOR','CORPORATE_ADMIN')
 and ((cardinality(parts)=3 and parts[3]='signature.png') or (cardinality(parts)=4 and exists(
 select 1 from public.checklist_items ci where ci.version_id=i.checklist_version_id and ci.id=parts[3]::uuid))));
 exception when invalid_text_representation then return false;
 end $$;
create function private.can_read_evidence(path text) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.signatures s where s.storage_path=path and private.inspection_allowed(s.organization_id,s.inspection_id))
 or exists(select 1 from public.incident_attachments a where a.storage_path=path and private.incident_allowed(a.organization_id,a.incident_id)) or private.can_upload(path)
$$;
create policy evidence_insert on storage.objects for insert to authenticated with check(bucket_id='inspection-evidence' and private.can_upload(name));
create policy evidence_read on storage.objects for select to authenticated using(bucket_id='inspection-evidence' and private.can_read_evidence(name));
-- No UPDATE/DELETE policies: evidence cannot be replaced after confirmation.
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;
