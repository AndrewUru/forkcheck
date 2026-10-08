import { session } from '@/lib/auth/session';
import { NicknameForm } from '@/components/profile/nickname-form';
import { MyEquipment } from '@/components/equipment/my-equipment';
import { FleetUpdateNotice } from '@/components/equipment/update-notice';
import { ChangePasswordForm } from '@/components/profile/password-forms';
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string }>;
}) {
  const { profile } = await session();
  const { password } = await searchParams;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MI CUENTA</p>
          <h1>Mi perfil</h1>
          <p>
            {profile.first_name} {profile.last_name} · ID {profile.employee_id}
          </p>
        </div>
      </div>
      {profile.nickname === undefined ? (
        <FleetUpdateNotice />
      ) : (
        <section className="panel detail-panel profile-panel">
          <h2>Cómo apareces en la aplicación</h2>
          <NicknameForm nickname={profile.nickname} />
        </section>
      )}
      <section className="panel detail-panel profile-panel">
        <h2>Cambiar contraseña</h2>
        {password === 'changed' && <p role="status">Tu contraseña se ha cambiado correctamente.</p>}
        <ChangePasswordForm />
      </section>
      <MyEquipment />
    </>
  );
}
