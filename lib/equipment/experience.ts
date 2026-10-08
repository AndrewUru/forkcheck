import type { EquipmentStatus } from '@/types/domain';
export function equipmentGuidance(status: EquipmentStatus) {
  switch (status) {
    case 'BLOCKED':
      return {
        tone: 'danger',
        title: 'Equipo bloqueado. No lo utilices.',
        detail:
          'Consulta las incidencias y contacta con el responsable. Una revisión correcta no elimina este bloqueo.',
      };
    case 'MAINTENANCE':
      return {
        tone: 'caution',
        title: 'Equipo en mantenimiento',
        detail:
          'No inicies el trabajo con este equipo. Consulta el seguimiento o los contactos de renting.',
      };
    case 'INACTIVE':
      return {
        tone: 'neutral',
        title: 'Equipo fuera de servicio',
        detail:
          'Esta ficha conserva el historial. Escanea otro equipo autorizado para continuar tu turno.',
      };
    case 'WARNING':
      return {
        tone: 'caution',
        title: 'Hay incidencias que revisar',
        detail:
          'Consulta los avisos del equipo y sigue las indicaciones del responsable antes de utilizarlo.',
      };
    default:
      return {
        tone: 'ready',
        title: 'Comprueba tu equipo antes de empezar',
        detail:
          'Revisa los puntos de seguridad y registra lo que observes. El estado mostrado no sustituye la comprobación física.',
      };
  }
}
