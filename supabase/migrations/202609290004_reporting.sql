create function public.dashboard_metrics(p_date date, p_region uuid default null, p_branch uuid default null, p_zone uuid default null, p_type uuid default null, p_brand text default null, p_model text default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
 begin
 if private.role() is null or private.role() not in ('SUPERVISOR','REGIONAL_MANAGER','CORPORATE_ADMIN') then raise exception 'Not authorized' using errcode='42501'; end if;
 return (
 with assets as (
 select * from public.equipment_overview e where (p_region is null or region_id=p_region) and (p_branch is null or branch_id=p_branch)
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
