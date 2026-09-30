import Link from 'next/link';
import { session } from '@/lib/auth/session';
import { Status } from '@/components/ui/status';
import { isMissingFleetSchema } from '@/lib/equipment/schema';
export async function MyEquipment() {
  const { db, profile } = await session();
  const { data: assignment, error } = await db
    .from('equipment_operators')
    .select('*')
    .eq('user_id', profile.id)
    .is('ended_at', null)
    .maybeSingle();
  if (isMissingFleetSchema(error)) return null;
  if (error) throw error;
  if (!assignment)
    return (
      <section className="panel detail-panel my-equipment">
        <p className="eyebrow">MI CARRETILLA</p>
        <h2>Todavía no tienes un equipo asignado</h2>
        <p>
          Tu administrador puede asignártelo. Puedes seguir consultando los equipos de tus
          sucursales autorizadas.
        </p>
      </section>
    );
  const { data: e, error: ee } = await db
    .from('equipment_overview')
    .select('*')
    .eq('id', assignment.equipment_id)
    .maybeSingle();
  if (ee) throw ee;
  if (!e)
    return (
      <section className="panel detail-panel my-equipment">
        <h2>Asignación pendiente de revisión</h2>
        <p>
          Tu equipo asignado ya no está disponible en tu alcance autorizado. Contacta con el
          administrador.
        </p>
      </section>
    );
  return (
    <section className="panel detail-panel my-equipment">
      <div>
        <p className="eyebrow">MI CARRETILLA</p>
        <h2>
          {e.internal_code} · {e.brand} {e.model}
        </h2>
        <p>
          {e.branch_name} · {e.zone_name ?? 'Sin zona'}
        </p>
        <Status status={e.status} />
      </div>
      <Link className="button primary" href={`/equipment/${e.public_code}`}>
        Ver mi equipo →
      </Link>
    </section>
  );
}
