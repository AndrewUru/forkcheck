import type {
  ChecklistItem,
  Equipment,
  EquipmentOverview,
  Incident,
  Inspection,
  Profile,
} from './domain';
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Tenant = { id: string; organization_id: string };
type Named = Tenant & { name: string };
type Row<T> = { [K in keyof T]: T[K] };
type Table<T> = {
  Row: Row<T>;
  Insert: Partial<Row<T>>;
  Update: Partial<Row<T>>;
  Relationships: [];
};
export interface Database {
  public: {
    Tables: {
      providers: Table<
        Tenant & {
          name: string;
          contact_name: string;
          phone: string;
          email: string;
          notes: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        }
      >;
      organizations: Table<{
        id: string;
        name: string;
        slug: string;
        timezone: string;
        created_at: string;
      }>;
      profiles: Table<
        Profile & { must_change_password: boolean; password_reset_at: string | null }
      >;
      regions: Table<Named>;
      branches: Table<Named & { region_id: string }>;
      zones: Table<Named & { branch_id: string }>;
      user_branches: Table<{ organization_id: string; user_id: string; branch_id: string }>;
      equipment_types: Table<Named>;
      equipment_operators: Table<
        Tenant & {
          equipment_id: string;
          user_id: string;
          assigned_by: string;
          started_at: string;
          ended_at: string | null;
        }
      >;
      equipment: Table<Equipment>;
      equipment_assignments: Table<
        Tenant & {
          equipment_id: string;
          branch_id: string;
          zone_id: string | null;
          start_date: string;
          end_date: string | null;
        }
      >;
      equipment_schedules: Table<
        Tenant & { equipment_id: string; template_id: string; next_due: string; active: boolean }
      >;
      checklist_templates: Table<
        Named & { equipment_type_id: string; frequency: string; custom_days: number | null }
      >;
      checklist_versions: Table<
        Tenant & {
          template_id: string;
          version: number;
          published_at: string | null;
          created_at: string;
        }
      >;
      checklist_sections: Table<Tenant & { version_id: string; title: string; sort_order: number }>;
      checklist_items: Table<ChecklistItem>;
      inspections: Table<Inspection>;
      inspection_answers: Table<
        Tenant & {
          inspection_id: string;
          checklist_version_id: string;
          checklist_item_id: string;
          answer: string;
          notes: string;
          severity: string | null;
          created_at: string;
        }
      >;
      incidents: Table<Incident>;
      signatures: Table<
        Tenant & { user_id: string; inspection_id: string; storage_path: string; signed_at: string }
      >;
      incident_attachments: Table<
        Tenant & {
          incident_id: string;
          storage_path: string;
          mime_type: string;
          uploaded_by: string;
          created_at: string;
        }
      >;
      maintenance_orders: Table<
        Tenant & {
          branch_id: string;
          equipment_id: string;
          incident_id: string;
          assigned_to: string | null;
          description: string;
          status: string;
          created_at: string;
          closed_at: string | null;
        }
      >;
      maintenance_actions: Table<
        Tenant & {
          order_id: string;
          performed_by: string;
          description: string;
          parts_used: string | null;
          created_at: string;
        }
      >;
      audit_logs: Table<
        Tenant & {
          actor_user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          metadata: Json;
          created_at: string;
        }
      >;
    };
    Views: { equipment_overview: { Row: Row<EquipmentOverview>; Relationships: [] } };
    Functions: {
      register_employee: { Args: { p_auth_id: string; p_input: Json }; Returns: string };
      deactivate_employee: { Args: { p_user_id: string }; Returns: string };
      save_provider: { Args: { p_input: Json; p_id: string | null }; Returns: string };
      update_my_nickname: { Args: { p_nickname: string }; Returns: string | null };
      retire_equipment: {
        Args: { p_public_code: string; p_confirm_code: string; p_reason: string };
        Returns: string;
      };
      create_equipment: { Args: { p_input: Json }; Returns: string };
      assign_equipment: {
        Args: {
          p_employee_id: string;
          p_equipment_code: string;
          p_expected_assignment: string | null;
        };
        Returns: string | null;
      };
      start_inspection: { Args: { p_schedule: string }; Returns: string };
      finish_inspection: { Args: { p_inspection: string; p_answers: Json }; Returns: string };
      dashboard_metrics: {
        Args: {
          p_date: string;
          p_region?: string;
          p_branch?: string;
          p_zone?: string;
          p_type?: string;
          p_brand?: string;
          p_model?: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
