import Link from 'next/link';
import {
  ArrowUpRight,
  Truck,
  ClipboardCheck,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
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
    db.from('regions').select('*').order('name'),
    db.from('branches').select('*').order('name'),
    db.from('zones').select('*').order('name'),
    db.from('equipment_types').select('*').order('name'),
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
  const compliance = m.due ? Math.round((m.completed / m.due) * 100) : null;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{org.data.name} / VISIÓN OPERATIVA</p>
          <h1>Centro de control</h1>
          <p>Hola, {profile.first_name}. Así está tu operación.</p>
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
              <p>Equipos con alertas activas</p>
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
