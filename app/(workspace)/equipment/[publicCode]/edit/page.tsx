import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/session';
import { CreateEquipmentForm } from '@/components/equipment/create-form';

export default async function EditEquipmentPage({
  params,
}: {
  params: Promise<{ publicCode: string }>;
}) {
  const { db } = await requirePermission('manage_equipment');
  const { publicCode } = await params;
  const [equipment, branches, zones] = await Promise.all([
    db.from('equipment_overview').select('*').eq('public_code', publicCode).maybeSingle(),
    db.from('branches').select('id,name').order('name').limit(201),
    db.from('zones').select('id,name,branch_id').order('name').limit(501),
  ]);
  if (equipment.error || branches.error || zones.error)
    throw new Error('No se puede cargar el equipo.');
  if (!equipment.data || equipment.data.status === 'INACTIVE') notFound();
  if (branches.data.length > 200 || zones.data.length > 500)
    return (
      <p>
        La selección supera el límite de 200 centros o 500 zonas. Contacta con el responsable de
        configuración.
      </p>
    );
  return (
    <>
      <Link className="back-link" href={`/equipment/${publicCode}`}>
        ← Volver al equipo
      </Link>
      <div className="page-heading">
        <div>
          <h1>Modificar equipo</h1>
          <p>
            {equipment.data.internal_code} · {equipment.data.type_name}
          </p>
        </div>
      </div>
      <CreateEquipmentForm
        key={equipment.data.updated_at}
        equipment={equipment.data}
        branches={branches.data}
        zones={zones.data}
        types={[]}
        templates={[]}
      />
    </>
  );
}
