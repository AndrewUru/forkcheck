import Link from 'next/link';
import { ClipboardCheck, LogOut } from 'lucide-react';
import { logout } from '@/app/actions';
import { WorkspaceNavigation, WorkspaceLocation } from './navigation';
import { can } from '@/lib/permissions';
import type { Profile } from '@/types/domain';
export function Shell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-symbol">
            <ClipboardCheck size={24} />
          </span>
          forkcheck<span className="brand-dot">.</span>
        </Link>
        <div className="workspace-label">CONTROL DE OPERACIONES</div>
        <WorkspaceNavigation dashboard={can(profile, 'dashboard')} configure={can(profile, 'configure')} />
        <div className="sidebar-bottom">
          <div className="avatar">
            {profile.first_name[0]}
            {profile.last_name[0]}
          </div>
          <div>
            <strong>{profile.nickname || `${profile.first_name} ${profile.last_name}`}</strong>
            <small>{profile.role.replaceAll('_', ' ')}</small>
          </div>
          <form action={logout}>
            <button className="icon-button" title="Cerrar sesión" aria-label="Cerrar sesión">
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <WorkspaceLocation />
          <span className="topbar-note">SEGURIDAD EN CADA TURNO</span>
        </header>
        <main id="main-content">{children}</main>
        <footer className="page-footer">
          <span>FORKCHECK / GESTIÓN DE ACTIVOS</span>
          <span>Inspeccionar. Registrar. Prevenir.</span>
        </footer>
      </div>
    </div>
  );
}
