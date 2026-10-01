create table public.providers (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations,
 name text not null check(length(trim(name)) between 1 and 120),
 contact_name text not null default '' check(length(contact_name)<=120),
 phone text not null default '' check(length(phone)<=40),
 email text not null default '' check(length(email)<=254 and (email='' or email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')),
 notes text not null default '' check(length(notes)<=1000),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 check(length(trim(phone))>0 or length(trim(email))>0)
);
create index providers_directory on public.providers(organization_id,active,name,id);
alter table public.providers enable row level security;
revoke all on public.providers from public,anon,authenticated;
grant select on public.providers to authenticated;
grant all on public.providers to service_role;
create policy providers_read on public.providers for select to authenticated using(organization_id=private.org_id());
create trigger audit_providers after insert or update or delete on public.providers for each row execute function private.audit_change();

create function public.save_provider(p_input jsonb,p_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.org_id(); result uuid;
begin
 if org is null or private.role() is distinct from 'CORPORATE_ADMIN' then raise exception 'Not authorized' using errcode='42501'; end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid input'; end if;
 if p_id is null then
  insert into public.providers(organization_id,name,contact_name,phone,email,notes,active)
  values(org,trim(p_input->>'name'),trim(coalesce(p_input->>'contact_name','')),trim(coalesce(p_input->>'phone','')),lower(trim(coalesce(p_input->>'email',''))),trim(coalesce(p_input->>'notes','')),coalesce((p_input->>'active')::boolean,true)) returning id into result;
 else
  update public.providers set name=trim(p_input->>'name'),contact_name=trim(coalesce(p_input->>'contact_name','')),phone=trim(coalesce(p_input->>'phone','')),email=lower(trim(coalesce(p_input->>'email',''))),notes=trim(coalesce(p_input->>'notes','')),active=coalesce((p_input->>'active')::boolean,true),updated_at=now()
  where id=p_id and organization_id=org returning id into result;
  if result is null then raise exception 'Provider unavailable'; end if;
 end if;
 return result;
end $$;
revoke all on function public.save_provider(jsonb,uuid) from public,anon;
grant execute on function public.save_provider(jsonb,uuid) to authenticated;
