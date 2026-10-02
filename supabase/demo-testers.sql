-- Solo para el proyecto de demostraciÃ³n con las migraciones ya aplicadas.
begin;
do $$
declare
 org uuid := gen_random_uuid();
 region uuid := gen_random_uuid();
 equipment_type uuid := gen_random_uuid();
 template uuid := gen_random_uuid();
 demo_version uuid := gen_random_uuid();
 section uuid := gen_random_uuid();
 branch uuid; zone uuid; equipment uuid; participant integer; unit integer;
begin
 if exists(select 1 from public.organizations where slug='demo-testers') then
  raise exception 'demo-testers ya existe. No se ha modificado nada.';
 end if;
 insert into public.organizations(id,slug,name) values(org,'demo-testers','Forkcheck Â· DemostraciÃ³n');
 insert into public.regions(id,organization_id,name) values(region,org,'Pruebas');
 insert into public.equipment_types(id,organization_id,name) values(equipment_type,org,'Carretilla de demostraciÃ³n');
 insert into public.checklist_templates(id,organization_id,equipment_type_id,name,frequency)
 values(template,org,equipment_type,'ComprobaciÃ³n diaria de demostraciÃ³n','DAILY');
 insert into public.checklist_versions(id,organization_id,template_id,version) values(demo_version,org,template,1);
 insert into public.checklist_sections(id,organization_id,version_id,title,sort_order) values(section,org,demo_version,'Seguridad y funcionamiento',1);
 insert into public.checklist_items(organization_id,version_id,section_id,label,sort_order,severity_when_failed,requires_photo_on_failure,blocks_equipment_on_failure,allowed_answers)
 values
 (org,demo_version,section,'Estado de ruedas y horquillas',1,'MEDIUM',true,false,array['OK','WARNING','CRITICAL','NOT_APPLICABLE']::public.answer_kind[]),
 (org,demo_version,section,'Freno de servicio',2,'CRITICAL',true,true,array['OK','WARNING','CRITICAL']::public.answer_kind[]),
 (org,demo_version,section,'Claxon y seÃ±alizaciÃ³n',3,'MEDIUM',true,false,array['OK','WARNING','CRITICAL']::public.answer_kind[]);
 update public.checklist_versions set published_at=now() where id=demo_version;
 for participant in 1..5 loop
  branch := gen_random_uuid(); zone := gen_random_uuid();
  insert into public.branches(id,organization_id,region_id,name) values(branch,org,region,'Demo '||lpad(participant::text,2,'0'));
  insert into public.zones(id,organization_id,branch_id,name) values(zone,org,branch,'Zona de prueba');
  for unit in 1..2 loop
   insert into public.equipment(organization_id,equipment_type_id,internal_code,brand,model)
   values(org,equipment_type,'DEMO-'||lpad(participant::text,2,'0')||'-'||unit,'DemostraciÃ³n','Equipo de prueba') returning id into equipment;
   insert into public.equipment_assignments(organization_id,equipment_id,branch_id,zone_id) values(org,equipment,branch,zone);
   insert into public.equipment_schedules(organization_id,equipment_id,template_id,next_due) values(org,equipment,template,(now() at time zone 'Europe/Madrid')::date);
  end loop;
 end loop;
end $$;
commit;

