create extension if not exists pgcrypto with schema extensions;
create type public.app_role as enum ('OPERARIO','MANTENIMIENTO','SUPERVISOR','REGIONAL_MANAGER','CORPORATE_ADMIN','SUPERADMIN');
create type public.equipment_status as enum ('OPERATIVE','WARNING','BLOCKED','MAINTENANCE','INACTIVE');
create type public.answer_kind as enum ('OK','WARNING','CRITICAL','NOT_APPLICABLE');
create type public.severity as enum ('LOW','MEDIUM','HIGH','CRITICAL');
create type public.incident_status as enum ('OPEN','ASSIGNED','IN_PROGRESS','REPAIRED','VERIFIED','CLOSED');
create type public.frequency as enum ('DAILY','WEEKLY','MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL','CUSTOM');

create table public.organizations (
 id uuid primary key default gen_random_uuid(), slug text unique not null check(slug ~ '^[a-z0-9-]{2,40}$'), name text not null,
 timezone text not null default 'Europe/Madrid', created_at timestamptz not null default now()
);
create table public.regions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations, name text not null, unique(organization_id,id)
);
create table public.branches (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations, region_id uuid not null, name text not null,
 unique(organization_id,id), foreign key(organization_id,region_id) references public.regions(organization_id,id)
);
create table public.zones (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, branch_id uuid not null, name text not null,
 unique(organization_id,id), unique(organization_id,branch_id,id), foreign key(organization_id,branch_id) references public.branches(organization_id,id)
);
create table public.profiles (
 id uuid primary key references auth.users on delete restrict, organization_id uuid not null references public.organizations,
 employee_id text not null check(employee_id ~ '^[a-zA-Z0-9_-]{1,40}$'), first_name text not null, last_name text not null,
 role public.app_role not null default 'OPERARIO', active boolean not null default true,
 unique(organization_id,id), unique(organization_id,employee_id)
);
create table public.user_branches (
 organization_id uuid not null, user_id uuid not null, branch_id uuid not null, primary key(user_id,branch_id),
 foreign key(organization_id,user_id) references public.profiles(organization_id,id), foreign key(organization_id,branch_id) references public.branches(organization_id,id)
);
create table public.equipment_types (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations, name text not null, unique(organization_id,id)
);
create table public.equipment (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations, equipment_type_id uuid not null,
 public_code text not null unique default encode(extensions.gen_random_bytes(12),'hex'), internal_code text not null, brand text not null, model text not null,
 serial_number text, year integer check(year between 1900 and 2200), status public.equipment_status not null default 'OPERATIVE',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,internal_code),
 foreign key(organization_id,equipment_type_id) references public.equipment_types(organization_id,id)
);
create table public.equipment_assignments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, equipment_id uuid not null, branch_id uuid not null, zone_id uuid,
 start_date timestamptz not null default now(), end_date timestamptz, check(end_date is null or end_date >= start_date), unique(organization_id,id),
 foreign key(organization_id,equipment_id) references public.equipment(organization_id,id),
 foreign key(organization_id,branch_id) references public.branches(organization_id,id),
 foreign key(organization_id,branch_id,zone_id) references public.zones(organization_id,branch_id,id)
);
create unique index equipment_one_current_assignment on public.equipment_assignments(equipment_id) where end_date is null;
create index assignments_branch on public.equipment_assignments(organization_id,branch_id,equipment_id);
create table public.checklist_templates (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations, equipment_type_id uuid not null, name text not null,
 frequency public.frequency not null default 'DAILY', custom_days integer check(custom_days > 0), unique(organization_id,id),
 check(frequency <> 'CUSTOM' or custom_days is not null), foreign key(organization_id,equipment_type_id) references public.equipment_types(organization_id,id)
);
create table public.checklist_versions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, template_id uuid not null, version integer not null check(version > 0),
 published_at timestamptz, created_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,template_id,id), unique(template_id,version),
 foreign key(organization_id,template_id) references public.checklist_templates(organization_id,id)
);
create table public.checklist_sections (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, version_id uuid not null, title text not null, sort_order integer not null,
 unique(organization_id,id), unique(organization_id,version_id,id), foreign key(organization_id,version_id) references public.checklist_versions(organization_id,id)
);
create table public.checklist_items (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, version_id uuid not null, section_id uuid not null,
 label text not null, description text not null default '', sort_order integer not null, required boolean not null default true,
 severity_when_failed public.severity not null default 'MEDIUM', requires_photo_on_failure boolean not null default false,
 blocks_equipment_on_failure boolean not null default false,
 allowed_answers public.answer_kind[] not null default '{OK,WARNING,CRITICAL,NOT_APPLICABLE}',
 unique(organization_id,id), unique(organization_id,version_id,id), check(cardinality(allowed_answers) > 0),
 foreign key(organization_id,version_id,section_id) references public.checklist_sections(organization_id,version_id,id)
);
create table public.equipment_schedules (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, equipment_id uuid not null, template_id uuid not null,
 next_due date not null default current_date, active boolean not null default true, unique(organization_id,id), unique(equipment_id,template_id),
 foreign key(organization_id,equipment_id) references public.equipment(organization_id,id), foreign key(organization_id,template_id) references public.checklist_templates(organization_id,id)
);
create table public.inspections (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, branch_id uuid not null, equipment_id uuid not null, user_id uuid not null,
 checklist_template_id uuid not null, checklist_version_id uuid not null, schedule_id uuid not null, due_date date not null,
 started_at timestamptz not null default now(), completed_at timestamptz, overall_status public.answer_kind, signature_id uuid,
 created_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,id,checklist_version_id),
 foreign key(organization_id,branch_id) references public.branches(organization_id,id), foreign key(organization_id,equipment_id) references public.equipment(organization_id,id),
 foreign key(organization_id,user_id) references public.profiles(organization_id,id), foreign key(organization_id,checklist_template_id,checklist_version_id) references public.checklist_versions(organization_id,template_id,id),
 foreign key(organization_id,schedule_id) references public.equipment_schedules(organization_id,id)
);
create unique index inspection_one_draft on public.inspections(equipment_id,checklist_template_id) where completed_at is null;
create index inspections_branch_date on public.inspections(organization_id,branch_id,completed_at);
create table public.inspection_answers (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, inspection_id uuid not null, checklist_version_id uuid not null, checklist_item_id uuid not null,
 answer public.answer_kind not null, notes text not null default '', severity public.severity, created_at timestamptz not null default now(), unique(organization_id,id), unique(inspection_id,checklist_item_id),
 foreign key(organization_id,inspection_id,checklist_version_id) references public.inspections(organization_id,id,checklist_version_id),
 foreign key(organization_id,checklist_version_id,checklist_item_id) references public.checklist_items(organization_id,version_id,id)
);
create table public.incidents (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, branch_id uuid not null, equipment_id uuid not null, inspection_id uuid,
 inspection_answer_id uuid, reported_by uuid not null, assigned_to uuid, severity public.severity not null, status public.incident_status not null default 'OPEN',
 title text not null, description text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), resolved_at timestamptz,
 unique(organization_id,id), foreign key(organization_id,branch_id) references public.branches(organization_id,id),
 foreign key(organization_id,equipment_id) references public.equipment(organization_id,id), foreign key(organization_id,inspection_id) references public.inspections(organization_id,id),
 foreign key(organization_id,inspection_answer_id) references public.inspection_answers(organization_id,id),
 foreign key(organization_id,reported_by) references public.profiles(organization_id,id), foreign key(organization_id,assigned_to) references public.profiles(organization_id,id)
);
create index incidents_branch_status on public.incidents(organization_id,branch_id,status);
create table public.incident_attachments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, incident_id uuid not null, storage_path text not null unique,
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')), uploaded_by uuid not null, created_at timestamptz not null default now(),
 foreign key(organization_id,incident_id) references public.incidents(organization_id,id), foreign key(organization_id,uploaded_by) references public.profiles(organization_id,id)
);
create table public.signatures (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, user_id uuid not null, inspection_id uuid not null unique,
 storage_path text not null unique, signed_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,user_id) references public.profiles(organization_id,id), foreign key(organization_id,inspection_id) references public.inspections(organization_id,id)
);
alter table public.inspections add foreign key(organization_id,signature_id) references public.signatures(organization_id,id);
create table public.maintenance_orders (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, branch_id uuid not null, equipment_id uuid not null, incident_id uuid not null,
 assigned_to uuid, description text not null, status text not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','CLOSED')), created_at timestamptz not null default now(), closed_at timestamptz,
 unique(organization_id,id), foreign key(organization_id,branch_id) references public.branches(organization_id,id), foreign key(organization_id,equipment_id) references public.equipment(organization_id,id),
 foreign key(organization_id,incident_id) references public.incidents(organization_id,id), foreign key(organization_id,assigned_to) references public.profiles(organization_id,id)
);
create table public.maintenance_actions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, order_id uuid not null, performed_by uuid not null,
 description text not null, parts_used text, created_at timestamptz not null default now(),
 foreign key(organization_id,order_id) references public.maintenance_orders(organization_id,id), foreign key(organization_id,performed_by) references public.profiles(organization_id,id)
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations, actor_user_id uuid,
 action text not null, entity_type text not null, entity_id uuid not null, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create index audit_org_date on public.audit_logs(organization_id,created_at desc);
