alter table public.profiles add column must_change_password boolean not null default false;
alter table public.profiles add column password_reset_at timestamptz;

create or replace function private.org_id() returns uuid language sql stable security definer set search_path = '' as $$
 select organization_id from public.profiles where id = auth.uid() and active and not must_change_password
$$;
create or replace function private.role() returns public.app_role language sql stable security definer set search_path = '' as $$
 select role from public.profiles where id = auth.uid() and active and not must_change_password
$$;
-- The only business row visible during recovery is the caller's own active profile.
drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using(
 (id = auth.uid() and active) or (organization_id = private.org_id() and private.role() = 'CORPORATE_ADMIN')
);

-- Auth owns password verification/hashing. This trigger never copies or logs the hash.
-- A fresh administrative nonce differentiates a reset from the subsequent user change.
create function private.password_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; target public.profiles; reset_requested boolean;
begin
 reset_requested := (new.raw_app_meta_data->>'forkcheck_reset_nonce') is distinct from (old.raw_app_meta_data->>'forkcheck_reset_nonce');
 if not reset_requested and new.encrypted_password is not distinct from old.encrypted_password then return new; end if;
 if reset_requested then
   select * into actor from public.profiles
   where id=(new.raw_app_meta_data->>'forkcheck_reset_actor')::uuid and active and not must_change_password for update;
   if actor.id is null or actor.role <> 'CORPORATE_ADMIN' then raise exception 'Not authorized'; end if;
   select * into target from public.profiles where id=new.id and organization_id=actor.organization_id and active for update;
   if target.id is null or target.id=actor.id or target.role='SUPERADMIN' then raise exception 'User unavailable'; end if;
   if target.password_reset_at > now() - interval '1 minute' then raise exception 'Reset rate limited'; end if;
   if nullif(new.raw_app_meta_data->>'forkcheck_reset_nonce','') is null
      or nullif(new.encrypted_password,'') is null
      or new.encrypted_password is not distinct from old.encrypted_password then raise exception 'Password change required'; end if;
   update public.profiles set must_change_password=true, password_reset_at=now() where id=target.id;
   insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id)
   values(target.organization_id,actor.id,'RESET_PASSWORD','profile',target.id);
 else
   select * into target from public.profiles where id=new.id for update;
   if target.id is null then return new; end if;
   if not target.active then raise exception 'User unavailable'; end if;
   if nullif(new.encrypted_password,'') is null then raise exception 'Password required'; end if;
   update public.profiles set must_change_password=false where id=target.id;
   insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id)
   values(target.organization_id,target.id,'CHANGE_PASSWORD','profile',target.id);
 end if;
 return new;
end $$;
revoke all on function private.password_changed() from public,anon,authenticated;
create trigger forkcheck_password_changed after update of encrypted_password,raw_app_meta_data on auth.users
for each row execute function private.password_changed();

-- These RPCs authorize directly from profiles rather than private.org_id().
create or replace function public.register_employee(p_auth_id uuid, p_input jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; employee text; selected_role public.app_role; branches uuid[]; b uuid; org_slug text;
begin
 select * into actor from public.profiles where id=auth.uid() and active and not must_change_password for update;
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

create or replace function public.deactivate_employee(p_user_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; target public.profiles;
begin
 -- Serialize administrators to avoid mutual deactivation deadlocks.
 perform pg_advisory_xact_lock(hashtextextended(coalesce(private.org_id()::text,''),0));
 select * into actor from public.profiles where id=auth.uid() and active and not must_change_password for update;
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
