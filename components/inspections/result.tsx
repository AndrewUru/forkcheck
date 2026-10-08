import Link from 'next/link';
import { Check, ArrowRight, ScanLine, ShieldAlert } from 'lucide-react';
import { Status } from '@/components/ui/status';
import { equipmentGuidance } from '@/lib/equipment/experience';
import type { EquipmentStatus } from '@/types/domain';
export function InspectionResult({
  equipment,
  outcome,
  completed,
  incidents,
}: {
  equipment: { id: string; public_code: string; status: EquipmentStatus } | null;
  outcome: string;
  completed: string;
  incidents: number;
}) {
  const guidance = equipment ? equipmentGuidance(equipment.status) : null;
  return (
    <section className={`inspection-result tone-${guidance?.tone ?? 'neutral'}`} role="status">
      <span className="result-check" aria-hidden>
        <Check size={36} />
      </span>
      <p className="eyebrow">REVISIÓN GUARDADA Y FIRMADA</p>
      <h2>Tu revisión queda registrada.</h2>
      <p>{completed}</p>
      <div className="result-facts">
        <div>
          <span>Resultado de la revisión</span>
          <strong>{outcome}</strong>
        </div>
        <div>
          <span>Incidencias registradas</span>
          <strong>{incidents}</strong>
        </div>
      </div>
      {equipment && guidance && (
        <div className="result-equipment">
          <div>
            <span>Estado actual del equipo</span>
            <Status status={equipment.status} />
          </div>
          <h3>
            {equipment.status === 'OPERATIVE'
              ? 'Comprobación registrada. Sigue el procedimiento de tu centro.'
              : guidance.title}
          </h3>
          <p>
            {equipment.status === 'OPERATIVE'
              ? 'El equipo figura como operativo. Si detectas otro fallo, detén el uso y comunícalo al responsable.'
              : guidance.detail}
          </p>
        </div>
      )}
      <div className="heading-actions">
        {equipment && (equipment.status === 'BLOCKED' || equipment.status === 'WARNING') ? (
          <Link className="button dark" href={`/incidents?equipment=${equipment.id}`}>
            <ShieldAlert size={18} />
            Consultar incidencias
          </Link>
        ) : (
          <Link className="button dark" href="/scan">
            <ScanLine size={18} />
            Escanear otro equipo
          </Link>
        )}
        {equipment && (
          <Link className="button" href={`/equipment/${equipment.public_code}`}>
            Volver al equipo <ArrowRight size={17} />
          </Link>
        )}
      </div>
    </section>
  );
}
