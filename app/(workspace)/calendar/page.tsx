import Link from 'next/link';
import { session } from '@/lib/auth/session';
import { todayIn, type SearchParams } from '@/lib/validations/filters';
import { calendarFilters, dayBounds, shiftDate } from '@/lib/calendar/dates';
import { Empty, Status } from '@/components/ui/status';

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await session();
  const parsed = calendarFilters.safeParse(await searchParams);
  const filters = parsed.success ? parsed.data : calendarFilters.parse({});
  const { data: organization, error: organizationError } = await db.from('organizations').select('timezone').single();
  if (organizationError) throw new Error('No se pudo cargar el calendario');
  const today = todayIn(organization.timezone);
  const date = filters.date ?? today;
  const { start, end } = dayBounds(date, organization.timezone);
  const isPast = date < today;
  const label = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString('es-ES', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
  const link = (changes: Partial<typeof filters>) => `/calendar?${new URLSearchParams({ date, scheduledPage: String(filters.scheduledPage), completedPage: String(filters.completedPage), ...Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, String(value)])) })}`;
  let scheduledQuery = db.from('equipment_overview').select('*', { count: 'exact' }).neq('status', 'INACTIVE').order('next_inspection').order('id').range((filters.scheduledPage - 1) * 20, filters.scheduledPage * 20 - 1);
  scheduledQuery = date === today ? scheduledQuery.lte('next_inspection', date) : scheduledQuery.eq('next_inspection', date);
  const [scheduled, completed] = await Promise.all([
    isPast ? Promise.resolve({ data: [], count: 0, error: null }) : scheduledQuery,
    db.from('inspections').select('*', { count: 'exact' }).gte('completed_at', start).lt('completed_at', end).order('completed_at', { ascending: false }).order('id').range((filters.completedPage - 1) * 20, filters.completedPage * 20 - 1),
  ]);
  if (scheduled.error || completed.error) throw new Error('No se pudo cargar el calendario');
  const ids = [...new Set(completed.data.map((item) => item.equipment_id))];
  const equipment = ids.length ? await db.from('equipment').select('id,internal_code').in('id', ids) : { data: [], error: null };
  if (equipment.error) throw new Error('No se pudieron cargar los equipos');
  const codes = new Map(equipment.data.map((item) => [item.id, item.internal_code]));
  return <>
    <div className="page-heading"><div><p className="eyebrow">INSPECCIONES / AGENDA</p><h1>Calendario diario</h1><p>Revisiones y reportes de tus equipos autorizados.</p></div></div>
    <form className="search-bar"><label>Fecha<input type="date" name="date" defaultValue={date} required /></label><button className="button dark">Ver día</button><Link className="button" href={`/calendar?date=${today}`}>Hoy</Link></form>
    <nav className="calendar-days" aria-label="Elegir día">
      {Array.from({ length: 7 }, (_, index) => shiftDate(date, index - 3)).map((day) => <Link key={day} href={`/calendar?date=${day}`} className={`calendar-day ${day === date ? 'selected' : ''}`} aria-current={day === date ? 'date' : undefined}><span>{new Date(`${day}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' })}</span><strong>{Number(day.slice(-2))}</strong>{day === today && <small>Hoy</small>}</Link>)}
    </nav>
    <h2 className="history-title">{label(date)}</h2>
    {isPast ? <p className="info-note">Se muestran las inspecciones realizadas ese día. Los pendientes históricos no se reconstruyen a partir de la programación actual.</p> : <section className="panel detail-panel">
      <h2>{date === today ? 'Equipos por revisar · incluye atrasados' : 'Equipos con próxima revisión este día'} ({scheduled.count ?? 0})</h2>
      {date > today && <p className="muted">Próximas fechas registradas. Se actualizan al completar cada revisión.</p>}
      {scheduled.data.length ? scheduled.data.map((item) => <div className="calendar-row" key={item.id}><div><strong>{item.internal_code}</strong><p>{item.branch_name ?? 'Sin ubicación'} · {item.type_name}</p><small>{item.next_inspection && item.next_inspection < today ? 'Atrasada desde ' : 'Fecha prevista: '}{item.next_inspection}</small></div><Status status={item.status} /><Link className="button" href={`/equipment/${item.public_code}`}>Ver revisión</Link></div>) : <Empty title="Sin revisiones programadas">No hay equipos pendientes para esta fecha en tu alcance.</Empty>}
      <div className="pagination">{filters.scheduledPage > 1 && <Link className="button" href={link({ scheduledPage: filters.scheduledPage - 1 })}>Anteriores</Link>}{filters.scheduledPage * 20 < (scheduled.count ?? 0) && <Link className="button" href={link({ scheduledPage: filters.scheduledPage + 1 })}>Más equipos</Link>}</div>
    </section>}
    <section className="panel detail-panel calendar-completed"><h2>Inspecciones realizadas ({completed.count ?? 0})</h2>
      {completed.data.length ? completed.data.map((item) => <div className="calendar-row" key={item.id}><div><strong>{codes.get(item.equipment_id) ?? 'Equipo del registro histórico'}</strong><p>{new Date(item.completed_at!).toLocaleTimeString('es-ES', { timeZone: organization.timezone, hour: '2-digit', minute: '2-digit' })} · Resultado: {item.overall_status}</p></div><Link className="button" href={`/inspections/${item.id}`}>Ver reporte</Link></div>) : <Empty title="Sin inspecciones realizadas">No hay revisiones completadas en esta fecha.</Empty>}
      <div className="pagination">{filters.completedPage > 1 && <Link className="button" href={link({ completedPage: filters.completedPage - 1 })}>Anteriores</Link>}{filters.completedPage * 20 < (completed.count ?? 0) && <Link className="button" href={link({ completedPage: filters.completedPage + 1 })}>Más reportes</Link>}</div>
    </section>
  </>;
}
