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
