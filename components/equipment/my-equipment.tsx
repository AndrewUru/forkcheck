import Link from 'next/link';
import { session } from '@/lib/auth/session';
import { Status } from '@/components/ui/status';
import { isMissingFleetSchema } from '@/lib/equipment/schema';
import { can } from '@/lib/permissions';
import { startInspection } from '@/app/actions';
import { todayIn } from '@/lib/validations/filters';
export async function MyEquipment({ quickStart = false }: { quickStart?: boolean }) {
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
  const [schedules, organization] = quickStart
    ? await Promise.all([
        db.from('equipment_schedules').select('id,next_due').eq('equipment_id', e.id)
          .eq('active', true).order('next_due').order('id').limit(1),
        db.from('organizations').select('timezone').single(),
      ])
    : [null, null];
  if (schedules?.error || organization?.error) throw new Error('No se pudo cargar la revisión del equipo');
  const schedule = schedules?.data?.[0];
  const due = schedule && organization?.data && schedule.next_due <= todayIn(organization.data.timezone);
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
        {quickStart && <p className="shift-due">{schedule ? `${due ? 'Revisión pendiente' : 'Próxima revisión'} · ${schedule.next_due}` : 'Sin revisión programada'}</p>}
        {e.status === 'BLOCKED' && <p className="text-red">Equipo bloqueado. No utilizar. Una revisión no lo desbloquea.</p>}
      </div>
      <div className="heading-actions">
        {quickStart && due && can(profile, 'inspect') && !['INACTIVE', 'MAINTENANCE'].includes(e.status) && (
          <form action={startInspection}>
            <input type="hidden" name="schedule" value={schedule.id} />
            <button className="button primary">Iniciar revisión</button>
          </form>
        )}
        <Link className={`button ${quickStart ? '' : 'primary'}`} href={`/equipment/${e.public_code}`}>
          Ver mi equipo →
        </Link>
      </div>
    </section>
  );
}
