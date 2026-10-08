'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  House,
  Truck,
  AlertTriangle,
  UserRound,
  CalendarDays,
  Users,
  Building2,
  ScanLine,
  Sparkles,
  LayoutDashboard,
  Menu,
  ClipboardCheck,
} from 'lucide-react';

export function WorkspaceNavigation({
  dashboard,
  configure,
  mobileLogout,
}: {
  dashboard: boolean;
  configure: boolean;
  mobileLogout: React.ReactNode;
}) {
  const pathname = usePathname();
  const home = dashboard ? '/admin' : '/shift';
  const primary = [
    { href: home, label: 'Inicio', icon: House },
    { href: '/equipment', label: 'Equipos', icon: Truck },
    { href: '/incidents', label: 'Incidencias', icon: AlertTriangle },
    { href: '/profile', label: 'Perfil', icon: UserRound },
  ];
  const secondary = [
    { href: '/calendar', label: 'Calendario diario', icon: CalendarDays },
    ...(configure
      ? [
          { href: '/admin/users', label: 'Usuarios', icon: Users },
          { href: '/admin/templates', label: 'Plantillas', icon: ClipboardCheck },
          { href: '/admin/assignments', label: 'Asignaciones', icon: Users },
        ]
      : []),
    { href: '/providers', label: 'Proveedores de renting', icon: Building2 },
    { href: '/assistant', label: 'Asistente IA', icon: Sparkles },
    ...(dashboard ? [{ href: '/admin/branches', label: 'Sucursales', icon: Building2 }] : []),
    { href: '/scan', label: 'Acceso por QR', icon: ScanLine },
  ];
  const active = (href: string) =>
    pathname === href || (href !== home && pathname.startsWith(`${href}/`));
  const links = (items: typeof primary) =>
    items.map(({ href, label, icon: Icon }) => (
      <Link
        key={href}
        href={href}
        aria-current={active(href) ? 'page' : undefined}
        onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
      >
        <Icon size={20} aria-hidden />
        <span>{label}</span>
      </Link>
    ));
  return (
    <>
      <nav className="desktop-navigation" aria-label="Navegación principal">
        {links([
          {
            href: home,
            label: dashboard ? 'Centro de control' : 'Mi turno',
            icon: dashboard ? LayoutDashboard : House,
          },
          ...primary.slice(1),
          ...secondary,
        ])}
      </nav>
      <details className="mobile-options">
        <summary>
          <Menu size={20} aria-hidden /> Más opciones
        </summary>
        <nav aria-label="Más opciones">
          {links(secondary)}
          {mobileLogout}
        </nav>
      </details>
      <nav className="mobile-navigation" aria-label="Navegación móvil">
        {links(primary)}
      </nav>
    </>
  );
}

export function WorkspaceLocation() {
  const pathname = usePathname();
  const label = pathname.startsWith('/inspections/')
    ? 'Revisión de seguridad'
    : pathname.startsWith('/equipment/')
      ? 'Ficha del equipo'
      : pathname === '/admin'
        ? 'Centro de control'
        : pathname.startsWith('/admin/templates')
          ? 'Plantillas'
          : pathname.startsWith('/admin/users')
            ? 'Usuarios'
            : pathname.startsWith('/admin/assignments')
              ? 'Asignaciones'
              : pathname.startsWith('/admin/branches')
                ? 'Sucursales'
                : pathname.startsWith('/admin/equipment')
                  ? 'Nuevo equipo'
                  : ({
                      '/shift': 'Mi turno',
                      '/equipment': 'Equipos',
                      '/calendar': 'Calendario diario',
                      '/incidents': 'Incidencias',
                      '/profile': 'Mi perfil',
                      '/scan': 'Acceso por QR',
                      '/providers': 'Proveedores',
                      '/assistant': 'Asistente IA',
                    }[pathname] ?? 'Operaciones');
  return (
    <span>
      Operaciones / <strong>{label}</strong>
    </span>
  );
}
