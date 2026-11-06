-- Closing a report never authorizes a machine. Return to service is a separate action.
alter table public.incidents add column resolution_notes text,
 add column resolved_by uuid,
 add constraint incident_resolver_fk foreign key(organization_id,resolved_by) references public.profiles(organization_id,id),
 add constraint incident_resolution_length check(resolution_notes is null or char_length(trim(resolution_notes)) between 10 and 2000);
create index incidents_equipment_open on public.incidents(organization_id,equipment_id) where status <> 'CLOSED';
create index maintenance_equipment_open on public.maintenance_orders(organization_id,equipment_id) where status <> 'CLOSED';

create function public.resolve_incident(p_incident uuid, p_expected_updated_at timestamptz, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare report public.incidents; asset public.equipment;
begin
 if private.org_id() is null or private.role() not in ('MANTENIMIENTO','CORPORATE_ADMIN') then
   raise exception 'Not authorized' using errcode='42501';
 end if;
 if p_notes is null or char_length(trim(p_notes)) not between 10 and 2000 then raise exception 'Invalid resolution'; end if;
 -- Lock the asset first, like fleet mutations. Re-read the incident after the lock.
 select e.* into asset from public.equipment e join public.incidents i on i.equipment_id=e.id and i.organization_id=e.organization_id
 where i.id=p_incident and i.organization_id=private.org_id() for update of e;
 if not found or not private.equipment_allowed(asset.organization_id,asset.id) then raise exception 'Incident unavailable'; end if;
 select * into report from public.incidents where id=p_incident and organization_id=private.org_id() for update;
 if not private.branch_allowed(report.organization_id,report.branch_id) then raise exception 'Not authorized' using errcode='42501'; end if;
 if report.status='CLOSED' or report.updated_at is distinct from p_expected_updated_at then raise exception 'Incident changed'; end if;
 if exists(select 1 from public.inspections where equipment_id=asset.id and completed_at is null) then raise exception 'Inspection in progress'; end if;
 if exists(select 1 from public.maintenance_orders where incident_id=report.id and status <> 'CLOSED') then raise exception 'Maintenance pending'; end if;
 update public.incidents set status='CLOSED',resolution_notes=trim(p_notes),resolved_by=auth.uid(),resolved_at=clock_timestamp(),updated_at=clock_timestamp() where id=report.id;
 return report.id;
end $$;

create function public.return_equipment_to_service(p_equipment uuid, p_expected_updated_at timestamptz, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare asset public.equipment;
begin
 if private.org_id() is null or private.role() <> 'CORPORATE_ADMIN' then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_reason is null or char_length(trim(p_reason)) not between 10 and 2000 then raise exception 'Invalid resolution'; end if;
 select * into asset from public.equipment where id=p_equipment and organization_id=private.org_id() for update;
 if not found or not private.equipment_allowed(asset.organization_id,asset.id) then raise exception 'Equipment unavailable'; end if;
 if asset.status not in ('WARNING','BLOCKED','MAINTENANCE') or asset.retired_at is not null then raise exception 'Equipment unavailable'; end if;
 if asset.updated_at is distinct from p_expected_updated_at then raise exception 'Equipment changed'; end if;
 if exists(select 1 from public.incidents where equipment_id=asset.id and status <> 'CLOSED') then raise exception 'Incidents pending'; end if;
 if exists(select 1 from public.maintenance_orders where equipment_id=asset.id and status <> 'CLOSED') then raise exception 'Maintenance pending'; end if;
 if exists(select 1 from public.inspections where equipment_id=asset.id and completed_at is null) then raise exception 'Inspection in progress'; end if;
 update public.equipment set status='OPERATIVE',updated_at=clock_timestamp() where id=asset.id;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(asset.organization_id,auth.uid(),'RETURN_TO_SERVICE','equipment',asset.id,jsonb_build_object('reason',trim(p_reason),'previous_status',asset.status));
 return asset.id;
end $$;
revoke all on function public.resolve_incident(uuid,timestamptz,text) from public,anon;
revoke all on function public.return_equipment_to_service(uuid,timestamptz,text) from public,anon;
grant execute on function public.resolve_incident(uuid,timestamptz,text) to authenticated;
grant execute on function public.return_equipment_to_service(uuid,timestamptz,text) to authenticated;
