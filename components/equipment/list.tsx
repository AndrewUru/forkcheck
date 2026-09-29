import Link from 'next/link';
import { ArrowUpRight, Truck } from 'lucide-react';
import { Empty, Status } from '@/components/ui/status';
import type { EquipmentOverview } from '@/types/domain';
export function EquipmentList({ equipment }: { equipment: EquipmentOverview[] }) {
  if (!equipment.length)
    return (
      <Empty title="No hay equipos en este alcance">
        Prueba otra búsqueda o consulta las sucursales que tienes asignadas.
      </Empty>
    );
  return (
    <div className="equipment-grid">
      {equipment.map((e) => (
        <Link href={`/equipment/${e.public_code}`} className="equipment-card" key={e.id}>
          <div className="equipment-card-top">
            <span className="asset-icon">
              <Truck size={28} />
            </span>
            <Status status={e.status} />
          </div>
          <p className="eyebrow">{e.type_name}</p>
          <h2>
            {e.internal_code}
            <ArrowUpRight size={20} />
          </h2>
          <p>
            {e.brand} {e.model}
          </p>
          <div className="equipment-location">
            {e.branch_name ?? 'Sin sucursal'}
            <span>{e.zone_name ?? 'Sin zona asignada'}</span>
          </div>
          <div className="equipment-card-foot">
            <span>Próxima revisión</span>
            <strong>{e.next_inspection ?? 'Sin plan'}</strong>
          </div>
        </Link>
      ))}
    </div>
  );
}
