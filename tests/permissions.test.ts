import { describe, it, expect } from 'vitest';
import { can, hasScope } from '@/lib/permissions';
import { employeeEmail, loginSchema } from '@/lib/validations/inspection';
import type { Profile } from '@/types/domain';
const p: Profile = {
  id: crypto.randomUUID(),
  organization_id: crypto.randomUUID(),
  employee_id: 'op01',
  first_name: 'Ana',
  last_name: 'López',
  role: 'OPERARIO',
  active: true,
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
  it('keeps employee aliases distinct per organization and normalizes case', () => {
    expect(employeeEmail('north', 'OP01')).not.toBe(employeeEmail('south', 'OP01'));
    expect(
      loginSchema.parse({ organization: 'NORTH', employee: 'OP01', password: 'secret' }).employee,
    ).toBe('op01');
  });
});
