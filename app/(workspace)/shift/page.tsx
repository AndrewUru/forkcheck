import Link from 'next/link';
import { ScanLine, CalendarDays, ArrowRight } from 'lucide-react';
import { session } from '@/lib/auth/session';
import { todayIn } from '@/lib/validations/filters';
import { MyEquipment } from '@/components/equipment/my-equipment';
import { EquipmentList } from '@/components/equipment/list';
import { Empty } from '@/components/ui/status';

export default async function ShiftPage() {
  const { db, profile } = await session();
  const { data: organization, error } = await db.from('organizations').select('timezone').single();
  if (error) throw new Error('No se pudo cargar el turno');
  const today = todayIn(organization.timezone);
  const [pending, ongoing] = await Promise.all([
    db
      .from('equipment_overview')
      .select('*')
      .neq('status', 'INACTIVE')
      .lte('next_inspection', today)
      .order('next_inspection')
      .order('id')
      .limit(6),
    db
      .from('inspections')
      .select('id,equipment_id')
      .eq('user_id', profile.id)
      .is('completed_at', null)
      .order('started_at', { ascending: false })
      .limit(5),
  ]);
  if (pending.error || ongoing.error) throw new Error('No se pudieron cargar las revisiones');
  return (
    <>
      <div className="page-heading shift-heading">
        <div>
          <p className="eyebrow">
            TU JORNADA /{' '}
            {new Date(`${today}T12:00:00Z`).toLocaleDateString('es-ES', {
              timeZone: 'UTC',
              day: 'numeric',
              month: 'long',
            })}
          </p>
          <h1>Mi turno</h1>
          <p>
            Hola, {profile.nickname || profile.first_name}. Empieza por la revisión de tu equipo.
          </p>
        </div>
        <Link className="button dark" href="/scan">
          <ScanLine size={20} /> Abrir equipo por QR
        </Link>
      </div>
      <MyEquipment quickStart />
      {ongoing.data.length > 0 && (
        <section className="panel detail-panel shift-resume" aria-labelledby="ongoing-title">
          <h2 id="ongoing-title">Revisiones que has iniciado</h2>
          <p>
            Retoma una revisión pendiente de finalizar. Las respuestas sin enviar permanecen solo en
            la página donde las has introducido.
          </p>
          {ongoing.data.map((inspection, index) => (
            <Link key={inspection.id} className="button" href={`/inspections/${inspection.id}`}>
              Retomar revisión {index + 1}
              <ArrowRight size={18} />
            </Link>
          ))}
        </section>
      )}
      <div className="page-heading shift-section-heading">
        <div>
          <h2>Revisiones pendientes</h2>
          <p>Equipos autorizados con revisión para hoy o atrasada. Se muestran hasta seis.</p>
        </div>
        <Link href="/calendar" className="text-link">
          <CalendarDays size={18} /> Ver calendario
        </Link>
      </div>
      {pending.data.length ? (
        <EquipmentList equipment={pending.data} />
      ) : (
        <Empty title="No hay revisiones pendientes">
          Puedes consultar los equipos y su historial.
        </Empty>
      )}
      <Link href="/equipment" className="button shift-all">
        Ver todos los equipos <ArrowRight size={18} />
      </Link>
    </>
  );
}
