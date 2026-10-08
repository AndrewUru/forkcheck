import Link from 'next/link';
import {
  ArrowUpRight,
  Truck,
  ClipboardCheck,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  Clock3,
} from 'lucide-react';
import { requirePermission } from '@/lib/auth/session';
import { metricsSchema } from '@/types/domain';
import { parseFilters, todayIn, type SearchParams } from '@/lib/validations/filters';
import { FilterBar } from '@/components/dashboard/filters';
import { Empty, Status } from '@/components/ui/status';
export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const { db, profile } = await requirePermission('dashboard');
  const f = parseFilters(await searchParams);
  const [org, regions, branches, zones, types] = await Promise.all([
    db.from('organizations').select('*').single(),
    db.from('regions').select('*').order('name').limit(200),
    db.from('branches').select('*').order('name').limit(200),
    db.from('zones').select('*').order('name').limit(500),
    db.from('equipment_types').select('*').order('name').limit(200),
  ]);
  if (org.error || regions.error || branches.error || zones.error || types.error)
    throw new Error('No se pueden cargar los filtros');
  f.date ??= todayIn(org.data.timezone);
  const { data, error } = await db.rpc('dashboard_metrics', {
    p_date: f.date,
    p_region: f.region,
    p_branch: f.branch,
    p_zone: f.zone,
    p_type: f.type,
    p_brand: f.brand,
    p_model: f.model,
  });
  if (error) throw error;
  const m = metricsSchema.parse(data);
  let attentionQuery = db
    .from('equipment_overview')
    .select('*')
    .in('status', ['BLOCKED', 'WARNING'])
    .order('status', { ascending: false })
    .order('internal_code')
    .limit(6);
  if (f.region) attentionQuery = attentionQuery.eq('region_id', f.region);
  if (f.branch) attentionQuery = attentionQuery.eq('branch_id', f.branch);
  if (f.zone) attentionQuery = attentionQuery.eq('zone_id', f.zone);
  if (f.type) attentionQuery = attentionQuery.eq('equipment_type_id', f.type);
  if (f.brand) attentionQuery = attentionQuery.eq('brand', f.brand);
  if (f.model) attentionQuery = attentionQuery.eq('model', f.model);
  const { data: attention, error: attentionError } = await attentionQuery;
  if (attentionError) throw attentionError;
  let overdueQuery = db
    .from('equipment_overview')
    .select('*', { count: 'exact' })
    .neq('status', 'INACTIVE')
    .lt('next_inspection', f.date)
    .order('next_inspection')
    .order('id')
    .limit(4);
  if (f.region) overdueQuery = overdueQuery.eq('region_id', f.region);
  if (f.branch) overdueQuery = overdueQuery.eq('branch_id', f.branch);
  if (f.zone) overdueQuery = overdueQuery.eq('zone_id', f.zone);
  if (f.type) overdueQuery = overdueQuery.eq('equipment_type_id', f.type);
  if (f.brand) overdueQuery = overdueQuery.eq('brand', f.brand);
  if (f.model) overdueQuery = overdueQuery.eq('model', f.model);
  const overdue = await overdueQuery;
  if (overdue.error) throw new Error('No se pudieron cargar las revisiones atrasadas');
  const scope = Object.fromEntries(
    Object.entries({
      region: f.region,
      branch: f.branch,
      zone: f.zone,
      type: f.type,
      brand: f.brand,
      model: f.model,
    }).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  const blockedLink = `/equipment?${new URLSearchParams({ ...scope, status: 'BLOCKED' })}`;
  const overdueLink = `/equipment?${new URLSearchParams({ ...scope, before: f.date })}`;
  const compliance = m.due ? Math.round((m.completed / m.due) * 100) : null;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{org.data.name} / VISIÓN OPERATIVA</p>
          <h1>Centro de control</h1>
          <p>Hola, {profile.first_name}. Empieza por lo que necesita atención.</p>
        </div>
        <Link className="button primary" href="/equipment">
          Ver equipos <ArrowUpRight size={18} />
        </Link>
      </div>
      <FilterBar
        filters={f}
        regions={regions.data}
        branches={branches.data}
        zones={zones.data}
        types={types.data}
      />
      <section className="priority-section" aria-labelledby="priority-title">
        <div className="section-label">
          <h2 id="priority-title">Lo primero, lo importante.</h2>
          <span>Prioridades del alcance seleccionado</span>
        </div>
        <div className="priority-grid">
          <Link className="priority-card priority-danger" href={blockedLink}>
            <ShieldAlert size={25} />
            <span>Equipos bloqueados</span>
            <strong>{m.blocked}</strong>
            <p>No deben utilizarse hasta su resolución autorizada.</p>
            <b>
              Revisar equipos <ArrowRight size={17} />
            </b>
          </Link>
          <Link className="priority-card priority-caution" href={overdueLink}>
            <Clock3 size={25} />
            <span>Equipos con revisión atrasada</span>
            <strong>{overdue.count ?? 0}</strong>
            <p>Próxima revisión anterior al {f.date}.</p>
            <b>
              Organizar revisiones <ArrowRight size={17} />
            </b>
          </Link>
          <Link className="priority-card priority-blue" href="/incidents">
            <AlertTriangle size={25} />
            <span>Incidencias abiertas</span>
            <strong>{m.incidents}</strong>
            <p>{m.critical} críticas en este alcance.</p>
            <b>
              Abrir bandeja de incidencias <ArrowRight size={17} />
            </b>
            <small>La bandeja muestra todas las incidencias autorizadas.</small>
          </Link>
        </div>
      </section>
      <div className="section-label">
        <span>ESTADO DE LA FLOTA</span>
        <span>Datos actuales · {m.branches} sucursales en el alcance</span>
      </div>
      <div className="metric-grid">
        {[
          {
            label: 'Equipos en la operación',
            value: m.equipment,
            note: `${m.operative} operativos`,
            icon: Truck,
            tone: '',
          },
          {
            label: 'Inspecciones realizadas',
            value: `${m.completed} / ${m.due}`,
            note: `${m.pending} pendientes en la fecha`,
            icon: ClipboardCheck,
            tone: '',
          },
          {
            label: 'Incidencias abiertas',
            value: m.incidents,
            note: `${m.critical} de severidad crítica`,
            icon: AlertTriangle,
            tone: 'amber',
          },
          {
            label: 'Equipos bloqueados',
            value: m.blocked,
            note: 'Requieren autorización de uso',
            icon: ShieldAlert,
            tone: 'red',
          },
        ].map((card) => (
          <div className={`metric-card ${card.tone}`} key={card.label}>
            <div className="metric-top">
              <span>{card.label}</span>
              <card.icon size={19} />
            </div>
            <strong>{card.value}</strong>
            <small>{card.note}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Necesitan atención</h2>
              <p>Hasta seis equipos; bloqueados primero</p>
            </div>
            <span className="count-badge">{m.blocked + m.warning}</span>
          </div>
          {attention?.length ? (
            <div className="asset-list">
              {attention.map((e) => (
                <Link href={`/equipment/${e.public_code}`} className="asset-row" key={e.id}>
                  <div className="asset-icon">
                    <Truck size={24} />
                  </div>
                  <div className="asset-row-name">
                    <strong>{e.internal_code}</strong>
                    <span>
                      {e.brand} {e.model} · {e.branch_name ?? 'Sin asignar'}
                    </span>
                  </div>
                  <Status status={e.status} />
                  <ArrowUpRight size={17} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="Sin equipos en alerta">
              Los equipos de este alcance no tienen estados de advertencia o bloqueo.
            </Empty>
          )}
          <Link className="panel-footer" href="/equipment">
            Consultar todos los equipos <ArrowRight size={17} />
          </Link>
        </section>
        <section className="panel compliance-panel">
          <div className="panel-heading">
            <div>
              <h2>Cumplimiento de revisión</h2>
              <p>Planes vencidos o previstos · {f.date}</p>
            </div>
          </div>
          <div className="compliance-number">{compliance === null ? '—' : `${compliance}%`}</div>
          <p>
            {m.due
              ? `${m.completed} de ${m.due} revisiones completadas`
              : 'No hay revisiones previstas para esta fecha'}
          </p>
          <div className="progress-track">
            <div style={{ width: `${compliance ?? 0}%` }} />
          </div>
          <div className="compliance-breakdown">
            <span>
              <i className="dot green" /> Realizadas <strong>{m.completed}</strong>
            </span>
            <span>
              <i className="dot amber" /> Pendientes <strong>{m.pending}</strong>
            </span>
          </div>
          <div className="info-note">
            Incluye planes pendientes de días anteriores. Los estados de equipos e incidencias
            reflejan la situación actual.
          </div>
        </section>
      </div>
      <section className="panel overdue-panel">
        <div className="panel-heading">
          <div>
            <h2>Próximas acciones</h2>
            <p>Hasta cuatro equipos con la revisión más antigua.</p>
          </div>
          <Link className="text-link" href={overdueLink}>
            Ver pendientes <ArrowRight size={17} />
          </Link>
        </div>
        {overdue.data.length ? (
          <div className="asset-list">
            {overdue.data.map((e) => (
              <Link className="asset-row" key={e.id} href={`/equipment/${e.public_code}`}>
                <span className="asset-icon">
                  <ClipboardCheck size={22} />
                </span>
                <div className="asset-row-name">
                  <strong>{e.internal_code}</strong>
                  <span>
                    {e.branch_name ?? 'Sin sucursal'} · pendiente desde {e.next_inspection}
                  </span>
                </div>
                <ArrowRight size={18} />
              </Link>
            ))}
          </div>
        ) : (
          <Empty title="Sin revisiones atrasadas en este alcance">
            Puedes consultar la programación de la fecha en el calendario.
          </Empty>
        )}
      </section>
      <div className="operational-note">
        <ShieldAlert size={20} />
        <span>
          Un equipo bloqueado no debe utilizarse. Una inspección correcta no lo desbloquea
          automáticamente.
        </span>
      </div>
    </>
  );
}
