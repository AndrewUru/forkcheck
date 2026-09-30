import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { CreateEquipmentForm } from '@/components/equipment/create-form';
import { isMissingFleetSchema } from '@/lib/equipment/schema';
import { FleetUpdateNotice } from '@/components/equipment/update-notice';
export default async function NewEquipmentPage() {
  const { db } = await requirePermission('configure');
  const check = await db.from('equipment_operators').select('id').limit(1);
  if (isMissingFleetSchema(check.error)) return <FleetUpdateNotice />;
  if (check.error) throw check.error;
  const [types, branches, zones, templates, versions] = await Promise.all([
    db.from('equipment_types').select('*').order('name'),
    db.from('branches').select('*').order('name'),
    db.from('zones').select('*').order('name'),
    db.from('checklist_templates').select('*').order('name'),
    db.from('checklist_versions').select('template_id').not('published_at', 'is', null),
  ]);
  if (types.error || branches.error || zones.error || templates.error || versions.error)
    throw new Error('No se puede cargar la configuración del equipo');
  const published = new Set(versions.data.map((v) => v.template_id));
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
        templates={templates.data.filter((t) => published.has(t.id))}
      />
    </>
  );
}
