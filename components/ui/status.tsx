import type { EquipmentStatus } from '@/types/domain';
export const statusLabels: Record<EquipmentStatus, string> = {
  OPERATIVE: 'Operativo',
  WARNING: 'Con incidencias',
  BLOCKED: 'Bloqueado',
  MAINTENANCE: 'Mantenimiento',
  INACTIVE: 'Inactivo',
};
export function Status({ status }: { status: EquipmentStatus }) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      <span aria-hidden>●</span> {statusLabels[status]}
    </span>
  );
}
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-symbol" aria-hidden>
        □
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
