import { z } from 'zod';

export const roles = [
  'OPERARIO',
  'MANTENIMIENTO',
  'SUPERVISOR',
  'REGIONAL_MANAGER',
  'CORPORATE_ADMIN',
  'SUPERADMIN',
] as const;
export type Role = (typeof roles)[number];
export const statuses = ['OPERATIVE', 'WARNING', 'BLOCKED', 'MAINTENANCE', 'INACTIVE'] as const;
export type EquipmentStatus = (typeof statuses)[number];
export const answerKinds = ['OK', 'WARNING', 'CRITICAL', 'NOT_APPLICABLE'] as const;
export type AnswerKind = (typeof answerKinds)[number];
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export interface Profile {
  id: string;
  organization_id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  role: Role;
  active: boolean;
}
export interface Equipment {
  id: string;
  organization_id: string;
  equipment_type_id: string;
  public_code: string;
  internal_code: string;
  brand: string;
  model: string;
  serial_number: string | null;
  year: number | null;
  status: EquipmentStatus;
  created_at: string;
  updated_at: string;
}
export interface EquipmentOverview extends Equipment {
  type_name: string;
  branch_id: string | null;
  zone_id: string | null;
  branch_name: string | null;
  region_id: string | null;
  region_name: string | null;
  zone_name: string | null;
  last_inspection: string | null;
  next_inspection: string | null;
  open_incidents: number;
}
export interface ChecklistItem {
  id: string;
  organization_id: string;
  version_id: string;
  section_id: string;
  label: string;
  description: string;
  sort_order: number;
  required: boolean;
  severity_when_failed: Severity;
  requires_photo_on_failure: boolean;
  blocks_equipment_on_failure: boolean;
  allowed_answers: AnswerKind[];
}
export interface Inspection {
  id: string;
  organization_id: string;
  branch_id: string;
  equipment_id: string;
  user_id: string;
  checklist_template_id: string;
  checklist_version_id: string;
  schedule_id: string;
  due_date: string;
  started_at: string;
  completed_at: string | null;
  overall_status: AnswerKind | null;
  signature_id: string | null;
  created_at: string;
}
export interface Incident {
  id: string;
  organization_id: string;
  branch_id: string;
  equipment_id: string;
  inspection_id: string | null;
  inspection_answer_id: string | null;
  reported_by: string;
  assigned_to: string | null;
  severity: Severity;
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'REPAIRED' | 'VERIFIED' | 'CLOSED';
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}
export const metricsSchema = z.object({
  branches: z.number(),
  equipment: z.number(),
  operative: z.number(),
  warning: z.number(),
  blocked: z.number(),
  due: z.number(),
  completed: z.number(),
  pending: z.number(),
  incidents: z.number(),
  critical: z.number(),
});
export type Metrics = z.infer<typeof metricsSchema>;
