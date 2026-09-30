alter table public.profiles add column nickname text check(nickname is null or (length(nickname) between 1 and 40 and nickname !~ '[[:cntrl:]]'));
alter table public.equipment add column retired_at timestamptz;
alter table public.equipment add column retirement_reason text check(retirement_reason is null or length(retirement_reason) between 3 and 500);
alter table public.equipment add constraint retirement_consistent check((retired_at is null and retirement_reason is null) or (retired_at is not null and retirement_reason is not null and status='INACTIVE'));

create function public.update_my_nickname(p_nickname text) returns text language plpgsql security definer set search_path='' as $$
declare value text := nullif(trim(p_nickname),'');
begin
 if private.org_id() is null then raise exception 'Not authorized' using errcode='42501'; end if;
 if length(value)>40 or value ~ '[[:cntrl:]]' then raise exception 'Invalid nickname'; end if;
 update public.profiles set nickname=value where id=auth.uid() and organization_id=private.org_id() and active;
 return value;
end $$;

create function public.retire_equipment(p_public_code text,p_confirm_code text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid := private.org_id(); asset public.equipment;
begin
 if org is null or private.role()<>'CORPORATE_ADMIN' then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into asset from public.equipment where organization_id=org and public_code=p_public_code for update;
 if not found then raise exception 'Equipment unavailable'; end if;
 if asset.internal_code is distinct from trim(p_confirm_code) then raise exception 'Confirmation code does not match'; end if;
 if coalesce(length(trim(p_reason)),0) not between 3 and 500 then raise exception 'Retirement reason required'; end if;
 if asset.retired_at is not null then return asset.id; end if;
 if exists(select 1 from public.inspections where equipment_id=asset.id and completed_at is null) then raise exception 'An inspection is still in progress'; end if;
 update public.equipment set status='INACTIVE',retired_at=now(),retirement_reason=trim(p_reason),updated_at=now() where id=asset.id;
 update public.equipment_operators set ended_at=now() where equipment_id=asset.id and ended_at is null;
 update public.equipment_schedules set active=false where equipment_id=asset.id;
 return asset.id;
end $$;
revoke all on function public.update_my_nickname(text),public.retire_equipment(text,text,text) from public,anon;
grant execute on function public.update_my_nickname(text),public.retire_equipment(text,text,text) to authenticated;

-- Preserve the order of existing view columns for compatibility with installed clients.
create or replace view public.equipment_overview with (security_invoker=true) as
 select e.id,e.organization_id,e.equipment_type_id,e.public_code,e.internal_code,e.brand,e.model,e.serial_number,e.year,e.status,e.created_at,e.updated_at,
 t.name as type_name,a.branch_id,a.zone_id,b.name as branch_name,b.region_id,r.name as region_name,z.name as zone_name,
 (select max(i.completed_at) from public.inspections i where i.equipment_id=e.id) as last_inspection,
 (select min(s.next_due) from public.equipment_schedules s where s.equipment_id=e.id and s.active) as next_inspection,
 (select count(*)::integer from public.incidents i where i.equipment_id=e.id and i.status <> 'CLOSED') as open_incidents,
 e.retired_at,e.retirement_reason
 from public.equipment e join public.equipment_types t on t.id=e.equipment_type_id
 left join public.equipment_assignments a on a.equipment_id=e.id and a.end_date is null
 left join public.branches b on b.id=a.branch_id left join public.regions r on r.id=b.region_id left join public.zones z on z.id=a.zone_id;
