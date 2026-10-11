import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }));
vi.mock('@/app/user-actions', () => ({ createEmployee: vi.fn(), deactivateEmployee: vi.fn() }));
import { WorkspaceNavigation } from '@/components/ui/navigation';
import { CreateEmployeeForm } from '@/components/profile/user-forms';
import { can } from '@/lib/permissions';
import { roleLabels, type Role } from '@/types/domain';

it.each([
  'JEFE_ALMACEN',
  'DELEGADO_CENTRO',
  'EHS',
  'DIRECTOR_REGIONAL',
  'DIRECTOR_GENERAL',
  'CORPORATE_ADMIN',
] as const)('renders only the authorized navigation for %s', (role: Role) => {
  const profile = { role, active: true };
  const html = renderToStaticMarkup(
    createElement(WorkspaceNavigation, {
      home: '/admin',
      dashboard: can(profile, 'dashboard'),
      configure: can(profile, 'configure'),
      createUsers: can(profile, 'create_users'),
      assignEquipment: can(profile, 'assign_equipment'),
      mobileLogout: null,
    }),
  );
  expect(html.includes('href="/admin/users"')).toBe(
    role === 'JEFE_ALMACEN' || role === 'EHS' || role === 'CORPORATE_ADMIN',
  );
  expect(html.includes('href="/admin/assignments"')).toBe(
    role === 'JEFE_ALMACEN' || role === 'EHS' || role === 'CORPORATE_ADMIN',
  );
  expect(html.includes('href="/admin/templates"')).toBe(role === 'CORPORATE_ADMIN');
});
it('offers only the operator role to a chief and readable business labels to administrators', () => {
  const chief = renderToStaticMarkup(
    createElement(CreateEmployeeForm, { branches: [], actorRole: 'JEFE_ALMACEN' }),
  );
  expect(chief).toContain('<option value="OPERARIO">Operario</option>');
  expect(chief.match(/<option /g)).toHaveLength(1);
  const admin = renderToStaticMarkup(
    createElement(CreateEmployeeForm, { branches: [], actorRole: 'CORPORATE_ADMIN' }),
  );
  expect(admin.match(/<option /g)).toHaveLength(6);
  expect(admin).toContain(roleLabels.JEFE_ALMACEN);
  expect(admin).toContain(roleLabels.DELEGADO_CENTRO);
  expect(admin).not.toContain('CORPORATE_ADMIN');
  expect(admin).not.toContain('SUPERADMIN');
});
it('offers EHS only operator and chief roles', () => {
  const html = renderToStaticMarkup(
    createElement(CreateEmployeeForm, { branches: [], actorRole: 'EHS' }),
  );
  expect(html.match(/<option /g)).toHaveLength(2);
  expect(html).toContain('value="JEFE_ALMACEN"');
  expect(html).not.toContain('DIRECTOR_GENERAL');
});
