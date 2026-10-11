import { describe, it, expect } from 'vitest';
import { can, hasScope } from '@/lib/permissions';
import { employeeEmail, loginSchema } from '@/lib/validations/inspection';
import { businessRoles, roles, type Profile } from '@/types/domain';
import { newEmployee } from '@/lib/validations/users';
import { homeFor } from '@/lib/navigation';
const p: Profile = {
  id: crypto.randomUUID(),
  organization_id: crypto.randomUUID(),
  employee_id: 'op01',
  first_name: 'Ana',
  last_name: 'López',
  role: 'OPERARIO',
  active: true,
  nickname: null,
};
describe('authorization', () => {
  it('allows inspection but not corporate management for operators', () => {
    expect(can(p, 'inspect')).toBe(true);
    expect(can(p, 'configure')).toBe(false);
    expect(can(p, 'dashboard')).toBe(false);
  });
  it('denies inactive employees', () =>
    expect(can({ ...p, active: false }, 'inspect')).toBe(false));
  it('requires explicit branches', () =>
    expect(hasScope(p, p.organization_id, 'branch-b', ['branch-a'])).toBe(false));
  it('never crosses organizations, even for corporate admins', () =>
    expect(hasScope({ ...p, role: 'CORPORATE_ADMIN' }, crypto.randomUUID(), 'branch', [])).toBe(
      false,
    ));
  it('gives superadmin no implicit tenant bypass', () => {
    expect(can({ ...p, role: 'SUPERADMIN' }, 'configure')).toBe(false);
    expect(hasScope({ ...p, role: 'SUPERADMIN' }, p.organization_id, 'branch', [])).toBe(false);
  });
  it('limits warehouse management to operator creation and assignment', () => {
    const chief = { ...p, role: 'JEFE_ALMACEN' as const };
    expect(can(chief, 'create_users')).toBe(true);
    expect(can(chief, 'assign_equipment')).toBe(true);
    expect(can(chief, 'inspect')).toBe(true);
    expect(can(chief, 'configure')).toBe(false);
    expect(can(chief, 'manage_equipment')).toBe(false);
    expect(homeFor(chief)).toBe('/admin');
  });
  it.each(['DELEGADO_CENTRO', 'EHS', 'DIRECTOR_REGIONAL', 'DIRECTOR_GENERAL'] as const)(
    'gives %s reports without operational mutations', (role) => {
      const reader = { ...p, role };
      expect(can(reader, 'dashboard')).toBe(true);
      for (const permission of ['inspect', 'create_users', 'assign_equipment', 'manage_equipment', 'maintain', 'configure'] as const)
        expect(can(reader, permission)).toBe(false);
      expect(homeFor(reader)).toBe('/admin');
      expect(hasScope(reader, crypto.randomUUID(), 'branch', ['branch'])).toBe(false);
      expect(hasScope(reader, p.organization_id, 'branch', [])).toBe(role === 'DIRECTOR_GENERAL');
    },
  );
  it.each(roles)('revokes every permission of inactive %s', (role) => {
    for (const permission of ['inspect', 'dashboard', 'create_users', 'assign_equipment', 'manage_equipment', 'maintain', 'configure'] as const)
      expect(can({ ...p, role, active: false }, permission)).toBe(false);
    expect(hasScope({ ...p, role, active: false }, p.organization_id, 'branch', ['branch'])).toBe(false);
  });
  it('only offers business roles for new users and requires explicit scope except general direction', () => {
    const input = { employee_id: 'new', first_name: 'Ana', last_name: 'López', password: 'secure-example-123', branches: [] };
    for (const role of businessRoles) {
      expect(newEmployee.safeParse({ ...input, role }).success).toBe(role === 'DIRECTOR_GENERAL');
      expect(newEmployee.safeParse({ ...input, role, branches: [crypto.randomUUID()] }).success).toBe(true);
    }
    for (const role of ['SUPERVISOR', 'REGIONAL_MANAGER', 'CORPORATE_ADMIN', 'MANTENIMIENTO', 'SUPERADMIN'])
      expect(newEmployee.safeParse({ ...input, role, branches: [crypto.randomUUID()] }).success).toBe(false);
  });
  it('keeps employee aliases distinct per organization and normalizes case', () => {
    expect(employeeEmail('north', 'OP01')).not.toBe(employeeEmail('south', 'OP01'));
    expect(
      loginSchema.parse({ organization: 'NORTH', employee: 'OP01', password: 'secret' }).employee,
    ).toBe('op01');
  });
});
