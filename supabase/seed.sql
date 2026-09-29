-- DEVELOPMENT ONLY. No passwords, public storage objects or production identities.
do $$
declare org uuid := '10000000-0000-4000-8000-000000000001';
 reporter uuid := '20000000-0000-4000-8000-000000000001';
 region_ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 branch_ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 type_ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 template_ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 version_ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 section_id uuid; eq uuid; zone uuid; k integer; typ integer; branch integer;
 names text[] := array['Valencia','Alicante','Madrid','Toledo','Barcelona','Zaragoza'];
 labels text[]; item_label text; status public.equipment_status;
begin
 insert into public.organizations(id,slug,name) values(org,'demo-logistics','Demo Logistics');
 -- Non-login identity used solely to attribute development incidents.
 insert into auth.users(id,aud,role,email,created_at,updated_at) values(reporter,'authenticated','authenticated','seed-reporter@demo-logistics.employees.forkcheck.invalid',now(),now());
 insert into public.profiles(id,organization_id,employee_id,first_name,last_name,role,active) values(reporter,org,'seed-reporter','Histórico','de desarrollo','OPERARIO',false);
 for k in 1..3 loop insert into public.regions(id,organization_id,name) values(region_ids[k],org,(array['Región Este','Región Centro','Región Norte'])[k]); end loop;
 for k in 1..6 loop
 insert into public.branches(id,organization_id,region_id,name) values(branch_ids[k],org,region_ids[((k-1)/2)+1],names[k]);
 insert into public.zones(organization_id,branch_id,name) values(org,branch_ids[k],'Almacén'),(org,branch_ids[k],'Expediciones'),(org,branch_ids[k],'Recepción');
 end loop;
 for k in 1..4 loop
 insert into public.equipment_types(id,organization_id,name) values(type_ids[k],org,(array['Carretilla elevadora','Transpaleta','Barredora','Botiquín'])[k]);
 insert into public.checklist_templates(id,organization_id,equipment_type_id,name,frequency)
 values(template_ids[k],org,type_ids[k],(array['Carretilla eléctrica · revisión diaria','Transpaleta · revisión diaria','Barredora · revisión semanal','Botiquín · revisión trimestral'])[k],(array['DAILY','DAILY','WEEKLY','QUARTERLY']::public.frequency[])[k]);
 insert into public.checklist_versions(id,organization_id,template_id,version) values(version_ids[k],org,template_ids[k],1);
 section_id := gen_random_uuid();
 insert into public.checklist_sections(id,organization_id,version_id,title,sort_order) values(section_id,org,version_ids[k],(array['SEGURIDAD Y FUNCIONAMIENTO','SEGURIDAD Y FUNCIONAMIENTO','ESTADO Y LIMPIEZA','CONTENIDO Y ACCESIBILIDAD'])[k],1);
 labels := case k when 1 then array['Horquillas y mástil','Cadenas y ruedas','Ausencia de fugas','Cinturón de seguridad','Claxon y avisador de marcha atrás','Luces y espejos','Batería y conectores','Dirección','Freno de servicio','Freno de estacionamiento','Elevación e inclinación','Desplazador lateral']
 when 2 then array['Horquillas','Ruedas y rodillos','Freno de servicio','Botón de parada de emergencia','Batería y conectores']
 when 3 then array['Cepillos y rodillos','Depósito de residuos','Filtros','Freno de servicio','Señalización luminosa']
 else array['Acceso libre y señalización','Material dentro de fecha de caducidad','Gasas y vendas','Guantes y antiséptico','Listado de teléfonos de emergencia'] end;
 for typ in 1..cardinality(labels) loop
 item_label := labels[typ];
 insert into public.checklist_items(organization_id,version_id,section_id,label,description,sort_order,severity_when_failed,requires_photo_on_failure,blocks_equipment_on_failure,allowed_answers)
 values(org,version_ids[k],section_id,item_label,'Comprueba el estado y el funcionamiento antes de confirmar.',typ,
 case when item_label in ('Cinturón de seguridad','Freno de servicio','Botón de parada de emergencia') then 'CRITICAL'::public.severity else 'MEDIUM'::public.severity end,
 true,item_label in ('Cinturón de seguridad','Freno de servicio','Botón de parada de emergencia'),
 case when item_label in ('Cinturón de seguridad','Freno de servicio','Botón de parada de emergencia') then array['OK','WARNING','CRITICAL']::public.answer_kind[] else array['OK','WARNING','CRITICAL','NOT_APPLICABLE']::public.answer_kind[] end);
 end loop;
 update public.checklist_versions set published_at=now() where id=version_ids[k];
 end loop;
 for k in 1..40 loop
 typ := case when k<=24 then 1 when k<=32 then 2 when k<=36 then 3 else 4 end;
 branch := ((k-1)%6)+1;
 status := case when k in (3,17,25) then 'BLOCKED'::public.equipment_status when k in (5,12,22,34) then 'WARNING'::public.equipment_status when k=9 then 'MAINTENANCE'::public.equipment_status when k=38 then 'INACTIVE'::public.equipment_status else 'OPERATIVE'::public.equipment_status end;
 insert into public.equipment(organization_id,equipment_type_id,internal_code,brand,model,serial_number,year,status)
 values(org,type_ids[typ],(array['CAR','TRA','BAR','BOT'])[typ]||'-'||lpad(k::text,3,'0'),
 case when typ<=2 then (array['Still','Linde','Toyota','Jungheinrich'])[((k-1)%4)+1] when typ=3 then 'Kärcher' else 'Sofar' end,
 case when typ=1 then (array['RX 20','E16','Traigo 48','EFG 216'])[((k-1)%4)+1] when typ=2 then 'Eléctrica 2.0 t' when typ=3 then 'KM 70/20' else 'Primeros auxilios 50 personas' end,
 'DL-2024-'||lpad(k::text,5,'0'),2020+(k%5),status) returning id into eq;
 select id into zone from public.zones where branch_id=branch_ids[branch] and name='Almacén';
 insert into public.equipment_assignments(organization_id,equipment_id,branch_id,zone_id,start_date) values(org,eq,branch_ids[branch],zone,now()-interval '30 days');
 insert into public.equipment_schedules(organization_id,equipment_id,template_id,next_due) values(org,eq,template_ids[typ],current_date+case when k%5=0 then 3 else 0 end);
 if status in ('BLOCKED','WARNING') then
 insert into public.incidents(organization_id,branch_id,equipment_id,reported_by,severity,title,description)
 values(org,branch_ids[branch],eq,reporter,case when status='BLOCKED' then 'CRITICAL'::public.severity else 'MEDIUM'::public.severity end,
 case when status='BLOCKED' then 'Fallo del freno de servicio' else 'Desgaste visible en rueda delantera' end,
 case when status='BLOCKED' then 'El equipo no se detiene en la comprobación previa al turno. Retirado de servicio y pendiente de mantenimiento.' else 'Se observa desgaste irregular en la rueda delantera. Se solicita valoración de mantenimiento.' end);
 end if;
 end loop;
end $$;
