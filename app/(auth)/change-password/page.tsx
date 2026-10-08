import { redirect } from 'next/navigation';
import { passwordSession } from '@/lib/auth/session';
import { ChangePasswordForm } from '@/components/profile/password-forms';
import { logout } from '@/app/actions';

export const dynamic = 'force-dynamic';
export default async function RequiredPasswordPage() {
  const { profile } = await passwordSession();
  if (!profile.must_change_password) redirect('/profile');
  return (
    <main id="main-content" className="password-page">
      <section className="panel detail-panel">
        <p className="eyebrow">SEGURIDAD DE TU CUENTA</p>
        <h1>Cambia tu contraseña temporal</h1>
        <p>{profile.first_name}, debes cambiarla antes de acceder a Forkcheck.</p>
        <ChangePasswordForm required />
        <form action={logout}>
          <button className="button">Cerrar sesión</button>
        </form>
      </section>
    </main>
  );
}
