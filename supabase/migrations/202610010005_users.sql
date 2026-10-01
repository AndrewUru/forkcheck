create function public.register_employee(p_auth_id uuid, p_input jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; employee text; selected_role public.app_role; branches uuid[]; b uuid; org_slug text;
begin
 select * into actor from public.profiles where id=auth.uid() and active for update;
 if actor.id is null or actor.role <> 'CORPORATE_ADMIN' then raise exception 'Not authorized'; end if;
 employee := p_input->>'employee_id';
 selected_role := (p_input->>'role')::public.app_role;
 if selected_role is null or selected_role = 'SUPERADMIN' or employee is null or employee !~ '^[a-z0-9_-]{1,40}$'
 or length(trim(coalesce(p_input->>'first_name',''))) not between 1 and 100
 or length(trim(coalesce(p_input->>'last_name',''))) not between 1 and 100 then raise exception 'Invalid employee'; end if;
 select slug into org_slug from public.organizations where id=actor.organization_id;
 if not exists(select 1 from auth.users where id=p_auth_id and email=employee||'@'||org_slug||'.employees.forkcheck.invalid') then raise exception 'Invalid identity'; end if;
 if jsonb_typeof(p_input->'branches') is distinct from 'array' then raise exception 'Invalid branches'; end if;
 if jsonb_array_length(p_input->'branches') > 100 then raise exception 'Invalid branches'; end if;
 select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into branches from jsonb_array_elements_text(p_input->'branches');
 if selected_role <> 'CORPORATE_ADMIN' and cardinality(branches)=0 then raise exception 'Branches required'; end if;
 foreach b in array branches loop
 if not exists(select 1 from public.branches where id=b and organization_id=actor.organization_id) then raise exception 'Invalid branch'; end if;
 end loop;
 insert into public.profiles(id,organization_id,employee_id,first_name,last_name,role)
 values(p_auth_id,actor.organization_id,employee,trim(p_input->>'first_name'),trim(p_input->>'last_name'),selected_role);
 insert into public.user_branches(organization_id,user_id,branch_id) select actor.organization_id,p_auth_id,unnest(branches);
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id) values(actor.organization_id,actor.id,'CREATE_USER','profile',p_auth_id);
 return p_auth_id;
end $$;

create function public.deactivate_employee(p_user_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; target public.profiles;
begin
 -- Serialize administrators to avoid mutual deactivation deadlocks.
 perform pg_advisory_xact_lock(hashtextextended(coalesce(private.org_id()::text,''),0));
 select * into actor from public.profiles where id=auth.uid() and active for update;
 if actor.id is null or actor.role <> 'CORPORATE_ADMIN' then raise exception 'Not authorized'; end if;
 if p_user_id=actor.id then raise exception 'Cannot deactivate yourself'; end if;
 select * into target from public.profiles where id=p_user_id and organization_id=actor.organization_id for update;
 if target.id is null or target.role='SUPERADMIN' then raise exception 'User unavailable'; end if;
 if not target.active then return target.id; end if;
 update public.profiles set active=false where id=target.id;
 update public.equipment_operators set ended_at=now() where user_id=target.id and ended_at is null;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id) values(actor.organization_id,actor.id,'DEACTIVATE_USER','profile',target.id);
 return target.id;
end $$;
revoke all on function public.register_employee(uuid,jsonb), public.deactivate_employee(uuid) from public,anon;
grant execute on function public.register_employee(uuid,jsonb), public.deactivate_employee(uuid) to authenticated;
