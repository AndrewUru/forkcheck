import { ClipboardCheck, ArrowRight, ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { login } from '@/app/actions';
import { isConfigured } from '@/lib/supabase/server';
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isConfigured()) redirect('/setup');
  const { error } = await searchParams;
  return (
    <main id="main-content" className="auth-page">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-symbol">
            <ClipboardCheck />
          </span>
          forkcheck.
        </div>
        <div>
          <p className="eyebrow">CONTROL DIARIO. SEGURIDAD CONTINUA.</p>
          <h1>
            Un buen turno
            <br />
            empieza aquí.
          </h1>
          <p>
            Todos tus equipos. Cada revisión.
            <br />
            La tranquilidad de trabajar con seguridad.
          </p>
        </div>
        <span className="auth-foot">
          <ShieldCheck size={18} /> Acceso seguro para personal autorizado
        </span>
      </section>
      <section className="auth-form">
        <div className="auth-form-inner">
          <p className="eyebrow">BIENVENIDO A FORKCHECK</p>
          <h2>Inicia tu turno</h2>
          <p>Identifícate con tus credenciales de empresa.</p>
          {error && (
            <p className="alert" role="alert">
              {error === 'inactive'
                ? 'Tu usuario no tiene un perfil activo. Contacta con tu administrador.'
                : 'No se ha podido iniciar sesión. Revisa tus credenciales.'}
            </p>
          )}
          <form action={login}>
            <label>
              Organización
              <input
                name="organization"
                autoComplete="organization"
                placeholder="Código de empresa"
                required
                pattern="[a-z0-9-]{2,40}"
              />
            </label>
            <label>
              ID de empleado
              <input
                name="employee"
                autoComplete="username"
                placeholder="Tu ID de empleado"
                required
                maxLength={40}
              />
            </label>
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <button className="button primary full">
              Entrar <ArrowRight size={18} />
            </button>
          </form>
          <p className="help-text">
            Si necesitas acceso o recuperar tu contraseña, contacta con el administrador de tu
            organización.
          </p>
        </div>
      </section>
    </main>
  );
}
