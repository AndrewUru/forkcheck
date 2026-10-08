import Link from 'next/link';
import { ArrowRight, ClipboardCheck, MapPin, ScanLine, ShieldAlert, Truck } from 'lucide-react';
import { startInspection } from '@/app/actions';
import { Status } from '@/components/ui/status';
import { equipmentGuidance } from '@/lib/equipment/experience';
import type { EquipmentOverview } from '@/types/domain';
export function EquipmentFocus({
  equipment: e,
  schedule,
  ongoing,
  today,
  mayInspect,
}: {
  equipment: EquipmentOverview;
  schedule?: { id: string; next_due: string };
  ongoing?: string;
  today: string;
  mayInspect: boolean;
}) {
  const guidance = equipmentGuidance(e.status);
  const due = schedule && schedule.next_due <= today;
  const available = mayInspect && !['INACTIVE', 'MAINTENANCE'].includes(e.status);
  return (
    <section className={`equipment-focus tone-${guidance.tone}`}>
      <div className="focus-heading">
        <span className="focus-icon">
          <Truck size={34} />
        </span>
        <Status status={e.status} />
      </div>
      <p className="eyebrow">{e.type_name} / EQUIPO IDENTIFICADO</p>
      <h1>{e.internal_code}</h1>
      <p className="focus-model">
        {e.brand} {e.model}
      </p>
      <p className="focus-location">
        <MapPin size={16} />
        {e.branch_name ?? 'Sin ubicación'} · {e.zone_name ?? 'Sin zona'}
      </p>
      <div className="focus-guidance">
        <ShieldAlert size={22} />
        <div>
          <h2>{guidance.title}</h2>
          <p>{guidance.detail}</p>
        </div>
      </div>
      <div className="focus-next">
        <span>{ongoing ? 'REVISIÓN EN CURSO' : due ? 'TU SIGUIENTE PASO' : 'PROGRAMACIÓN'}</span>
        <strong>
          {ongoing
            ? 'Continúa tu revisión'
            : schedule
              ? due
                ? 'Revisión pendiente'
                : `Próxima revisión: ${schedule.next_due}`
              : 'Sin plan de revisión'}
        </strong>
        {!schedule && <p>El administrador debe asignar un plan antes de iniciar una revisión.</p>}
        {ongoing && (
          <p>Las respuestas sin enviar solo se conservan en la pestaña donde las introdujiste.</p>
        )}
      </div>
      <div className="focus-actions">
        {ongoing && mayInspect ? (
          <Link className="button primary" href={`/inspections/${ongoing}`}>
            Continuar revisión <ArrowRight size={19} />
          </Link>
        ) : e.status === 'BLOCKED' || (e.status === 'WARNING' && !due) ? (
          <Link className="button primary" href={`/incidents?equipment=${e.id}`}>
            Consultar incidencias <ArrowRight size={19} />
          </Link>
        ) : available && due ? (
          <form action={startInspection}>
            <input type="hidden" name="schedule" value={schedule.id} />
            <button className="button primary">
              <ClipboardCheck size={20} />
              Empezar revisión
            </button>
          </form>
        ) : e.status === 'MAINTENANCE' ? (
          <Link className="button primary" href="/providers">
            Contactar con renting
          </Link>
        ) : (
          <Link className="button primary" href="/scan">
            <ScanLine size={20} />
            Escanear otro equipo
          </Link>
        )}
        {e.open_incidents > 0 && (
          <Link className="button" href={`/incidents?equipment=${e.id}`}>
            {e.open_incidents} incidencias abiertas
          </Link>
        )}
        <a className="text-link" href="#equipment-reviews">
          Ver planes e historial ↓
        </a>
      </div>
    </section>
  );
}
