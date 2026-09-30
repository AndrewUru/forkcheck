import Link from 'next/link';
import Image from 'next/image';
import QRCode from 'qrcode';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { ArrowLeft, ClipboardCheck, MapPin } from 'lucide-react';
import { session } from '@/lib/auth/session';
import { can } from '@/lib/permissions';
import { startInspection } from '@/app/actions';
import { Empty, Status } from '@/components/ui/status';
import { RetireEquipmentForm } from '@/components/equipment/retire-form';
export default async function EquipmentDetail({
  params,
}: {
  params: Promise<{ publicCode: string }>;
}) {
  const { publicCode } = await params;
  const { db, profile } = await session();
  const { data: e, error } = await db
    .from('equipment_overview')
    .select('*')
    .eq('public_code', publicCode)
    .maybeSingle();
  if (error) throw error;
  if (!e) notFound();
  const [schedules, templates, inspections, incidents, moves, orders, branches] = await Promise.all(
    [
      db.from('equipment_schedules').select('*').eq('equipment_id', e.id).eq('active', true),
      db.from('checklist_templates').select('*'),
      db
        .from('inspections')
        .select('*')
        .eq('equipment_id', e.id)
        .order('started_at', { ascending: false })
        .limit(20),
      db
        .from('incidents')
        .select('*')
        .eq('equipment_id', e.id)
        .order('created_at', { ascending: false })
        .limit(20),
      db
        .from('equipment_assignments')
        .select('*')
        .eq('equipment_id', e.id)
        .order('start_date', { ascending: false })
        .limit(20),
      db
        .from('maintenance_orders')
        .select('*')
        .eq('equipment_id', e.id)
        .order('created_at', { ascending: false })
        .limit(20),
      db.from('branches').select('*'),
    ],
  );
  if ([schedules, templates, inspections, incidents, moves, orders, branches].some((r) => r.error))
    throw new Error('No se pudo cargar el historial');
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  const qr = await QRCode.toDataURL(`${protocol}://${host}/equipment/${e.public_code}`, {
    width: 200,
    margin: 1,
  });
  return (
    <>
      <Link href="/equipment" className="back-link">
        <ArrowLeft size={17} /> Equipos
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{e.type_name} / FICHA DEL EQUIPO</p>
          <h1>{e.internal_code}</h1>
          <p>
            {e.brand} {e.model}
          </p>
        </div>
        <Status status={e.status} />
      </div>
      <Link className="button" href={`/assistant?equipment=${encodeURIComponent(e.public_code)}`}>
        Preguntar al asistente sobre este equipo
      </Link>
      {e.retired_at && (
        <div className="info-note">
          <strong>
            Equipo retirado de la flota el {new Date(e.retired_at).toLocaleDateString('es-ES')}.
          </strong>
          <p>Motivo: {e.retirement_reason}. El historial se conserva para consulta.</p>
        </div>
      )}
      {e.status === 'BLOCKED' && (
        <div className="alert">
          <strong>Equipo bloqueado. No utilizar.</strong> La revisión no autoriza su puesta en
          servicio.
        </div>
      )}
      <div className="detail-columns">
        <section className="panel detail-panel">
          <h2>Información del activo</h2>
          <dl className="details-grid">
            <div>
              <dt>{e.retired_at ? 'Última ubicación' : 'Ubicación actual'}</dt>
              <dd>
                <MapPin size={16} /> {e.branch_name ?? 'Sin asignar'} · {e.zone_name ?? 'Sin zona'}
              </dd>
            </div>
            <div>
              <dt>Número de serie</dt>
              <dd>{e.serial_number ?? 'No registrado'}</dd>
            </div>
            <div>
              <dt>Año de fabricación</dt>
              <dd>{e.year ?? 'No registrado'}</dd>
            </div>
            <div>
              <dt>Última inspección</dt>
              <dd>
                {e.last_inspection
                  ? new Date(e.last_inspection).toLocaleString('es-ES', {
                      timeZone: 'Europe/Madrid',
                    })
                  : 'Sin inspecciones'}
              </dd>
            </div>
            <div>
              <dt>Próxima inspección</dt>
              <dd>{e.next_inspection ?? 'Sin programación'}</dd>
            </div>
            <div>
              <dt>Incidencias abiertas</dt>
              <dd>{e.open_incidents}</dd>
            </div>
          </dl>
        </section>
        <section className="panel qr-panel">
          <Image
            src={qr}
            alt={`QR de acceso a ${e.internal_code}`}
            width={150}
            height={150}
            unoptimized
          />
          <div>
            <h2>Identificación QR</h2>
            <p>
              Escanea para abrir esta ficha.
              <br />
              Requiere una sesión autorizada.
            </p>
            <a href={qr} download={`QR-${e.internal_code}.png`} className="text-link">
              Descargar etiqueta QR
            </a>
          </div>
        </section>
      </div>
      <section className="panel inspection-start">
        <h2>Revisiones del equipo</h2>
        {schedules.data?.length ? (
          schedules.data.map((s) => (
            <div className="schedule-row" key={s.id}>
              <div>
                <strong>
                  {templates.data?.find((t) => t.id === s.template_id)?.name ?? 'Revisión'}
                </strong>
                <p>Próxima fecha: {s.next_due}</p>
              </div>
              {can(profile, 'inspect') && !['INACTIVE', 'MAINTENANCE'].includes(e.status) && (
                <form action={startInspection}>
                  <input type="hidden" name="schedule" value={s.id} />
                  <button className="button primary">
                    <ClipboardCheck size={20} /> Iniciar inspección
                  </button>
                </form>
              )}
            </div>
          ))
        ) : (
          <Empty title={e.retired_at ? 'Equipo retirado' : 'Sin plan de revisión'}>
            {e.retired_at
              ? 'Los planes de revisión se desactivaron al dar de baja el equipo.'
              : 'El administrador debe asignar una plantilla publicada.'}
          </Empty>
        )}
      </section>
      <h2 className="history-title">
        Historial autorizado <small>Últimos 20 registros por categoría</small>
      </h2>
      <div className="history-grid">
        <section className="panel detail-panel">
          <h2>Inspecciones</h2>
          {inspections.data?.length ? (
            inspections.data.map((i) => (
              <Link className="history-row" key={i.id} href={`/inspections/${i.id}`}>
                <span>{new Date(i.started_at).toLocaleDateString('es-ES')}</span>
                <strong>{i.completed_at ? i.overall_status : 'En curso'}</strong>
              </Link>
            ))
          ) : (
            <p className="muted">Todavía no hay inspecciones.</p>
          )}
        </section>
        <section className="panel detail-panel">
          <h2>Incidencias</h2>
          {incidents.data?.length ? (
            incidents.data.map((i) => (
              <div className="history-row" key={i.id}>
                <div>
                  <strong>{i.title}</strong>
                  <p>{i.description}</p>
                </div>
                <span className={i.severity === 'CRITICAL' ? 'text-red' : ''}>
                  {i.severity} · {i.status}
                </span>
              </div>
            ))
          ) : (
            <p className="muted">No hay incidencias registradas.</p>
          )}
        </section>
        <section className="panel detail-panel">
          <h2>Mantenimiento</h2>
          {orders.data?.length ? (
            orders.data.map((o) => (
              <div className="history-row" key={o.id}>
                <span>{o.description}</span>
                <strong>{o.status}</strong>
              </div>
            ))
          ) : (
            <p className="muted">No hay órdenes registradas.</p>
          )}
        </section>
        <section className="panel detail-panel">
          <h2>Traslados</h2>
          {moves.data?.map((a) => (
            <div className="history-row" key={a.id}>
              <span>
                {branches.data?.find((b) => b.id === a.branch_id)?.name ?? 'Sucursal autorizada'}
              </span>
              <span>
                {new Date(a.start_date).toLocaleDateString('es-ES')} ·{' '}
                {a.end_date ? new Date(a.end_date).toLocaleDateString('es-ES') : 'Actual'}
              </span>
            </div>
          ))}
        </section>
      </div>
      {profile.role === 'CORPORATE_ADMIN' && e.retired_at === null && (
        <RetireEquipmentForm publicCode={e.public_code} internalCode={e.internal_code} />
      )}
    </>
  );
}
