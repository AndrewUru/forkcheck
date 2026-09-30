'use server';
import { revalidatePath } from 'next/cache';
import { session } from '@/lib/auth/session';
import {
  createEquipmentSchema,
  assignmentSchema,
  type FleetActionResult,
} from '@/lib/validations/fleet';
import { isMissingFleetSchema } from '@/lib/equipment/schema';
import { nicknameSchema, retirementSchema } from '@/lib/validations/fleet';

function mutationError(error: { code?: string; message?: string }) {
  if (isMissingFleetSchema(error))
    return 'La actualización de gestión de flota todavía no está aplicada en Supabase.';
  if (error.code === '23505') return 'Ese código de equipo ya existe. Utiliza un código único.';
  if (error.message?.includes('Assignment changed'))
    return 'La asignación ha cambiado. Recarga la página antes de guardarla.';
  if (error.message?.includes('not authorized for this branch'))
    return 'El usuario no tiene autorización para la sucursal de ese equipo.';
  if (error.message?.includes('Equipment unavailable'))
    return 'No se encuentra un equipo activo con ese código.';
  if (error.message?.includes('Employee unavailable'))
    return 'El usuario no existe o está inactivo.';
  if (error.message?.includes('compatible published template'))
    return 'Selecciona una plantilla publicada compatible con el tipo de equipo.';
  if (error.message?.includes('location or type'))
    return 'Comprueba el tipo, la sucursal y que la zona pertenezca a esa sucursal.';
  return 'No se ha guardado el cambio. Revisa los datos y tus permisos.';
}
export async function updateNickname(input: unknown): Promise<FleetActionResult> {
  const { db } = await session();
  const parsed = nicknameSchema.safeParse(input);
  if (!parsed.success)
    return { error: 'El nickname admite hasta 40 caracteres y no puede contener saltos de línea.' };
  const { error } = await db.rpc('update_my_nickname', { p_nickname: parsed.data });
  if (error) return { error: mutationError(error) };
  revalidatePath('/', 'layout');
  return { success: true };
}
export async function retireEquipment(input: unknown): Promise<FleetActionResult> {
  const { db, profile } = await session();
  if (profile.role !== 'CORPORATE_ADMIN')
    return { error: 'Solo el administrador de empresa puede retirar equipos.' };
  const parsed = retirementSchema.safeParse(input);
  if (!parsed.success)
    return { error: 'Escribe el código del equipo y un motivo de entre 3 y 500 caracteres.' };
  const { error } = await db.rpc('retire_equipment', {
    p_public_code: parsed.data.publicCode,
    p_confirm_code: parsed.data.confirmCode,
    p_reason: parsed.data.reason,
  });
  if (error?.message?.includes('still in progress'))
    return { error: 'Hay una inspección en curso. Debe finalizarse antes de retirar el equipo.' };
  if (error?.message?.includes('Confirmation code'))
    return { error: 'El código de confirmación no coincide con el equipo.' };
  if (error) return { error: mutationError(error) };
  revalidatePath('/equipment', 'layout');
  revalidatePath('/admin', 'layout');
  revalidatePath('/profile');
  return { success: true };
}
export async function createEquipment(input: unknown): Promise<FleetActionResult> {
  const { db, profile } = await session();
  if (profile.role !== 'CORPORATE_ADMIN')
    return { error: 'Solo el administrador de empresa puede dar de alta equipos.' };
  const parsed = createEquipmentSchema.safeParse(input);
  if (!parsed.success)
    return { error: 'Completa los campos obligatorios y revisa el año de fabricación.' };
  const { data, error } = await db.rpc('create_equipment', { p_input: parsed.data });
  if (error) return { error: mutationError(error) };
  revalidatePath('/equipment');
  revalidatePath('/admin');
  return { success: true, publicCode: data };
}
export async function assignEquipment(input: unknown): Promise<FleetActionResult> {
  const { db, profile } = await session();
  if (profile.role !== 'CORPORATE_ADMIN')
    return { error: 'Solo el administrador de empresa puede cambiar asignaciones.' };
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) return { error: 'Revisa el usuario y el código de equipo.' };
  const { error } = await db.rpc('assign_equipment', {
    p_employee_id: parsed.data.employeeId,
    p_equipment_code: parsed.data.equipmentCode,
    p_expected_assignment: parsed.data.expectedAssignment,
  });
  if (error) return { error: mutationError(error) };
  revalidatePath('/admin/assignments');
  revalidatePath('/equipment');
  revalidatePath('/profile');
  return { success: true };
}
