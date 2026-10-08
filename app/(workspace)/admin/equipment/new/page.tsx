import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { CreateEquipmentForm } from '@/components/equipment/create-form';
import { isMissingFleetSchema } from '@/lib/equipment/schema';
import { FleetUpdateNotice } from '@/components/equipment/update-notice';
import { checklistSchemaReady } from '@/lib/checklists';
import { ChecklistUpdateNotice } from '@/components/checklists/update-notice';
export default async function NewEquipmentPage() {
  const { db } = await requirePermission('configure');
  const check = await db.from('equipment_operators').select('id').limit(1);
  if (isMissingFleetSchema(check.error)) return <FleetUpdateNotice />;
  if (check.error) throw check.error;
  if (!await checklistSchemaReady(db)) return <ChecklistUpdateNotice />;
  const [types, branches, zones, templates] = await Promise.all([
    db.from('equipment_types').select('*').order('name').limit(201),
    db.from('branches').select('*').order('name').limit(201),
    db.from('zones').select('*').order('name').limit(501),
    db.from('available_checklist_templates').select('*').order('name').limit(201),
  ]);
  if (types.error || branches.error || zones.error || templates.error)
    throw new Error('No se puede cargar la configuración del equipo');
  if (types.data.length > 200 || branches.data.length > 200 || zones.data.length > 500 || templates.data.length > 200)
    return <p>La configuración supera la capacidad de los selectores de alta (200 tipos, sucursales o plantillas; 500 zonas). Contacta con el responsable de configuración.</p>;
  return (
    <>
      <Link className="back-link" href="/equipment">
        ← Equipos
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN / RENOVACIÓN DE FLOTA</p>
          <h1>Nuevo equipo</h1>
          <p>Da de alta la nueva carretilla y configura su primera revisión.</p>
        </div>
      </div>
      <CreateEquipmentForm
        types={types.data}
        branches={branches.data}
        zones={zones.data}
        templates={templates.data}
      />
    </>
  );
}
