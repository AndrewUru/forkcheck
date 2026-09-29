import { ClipboardCheck, Database, ShieldCheck, Terminal } from 'lucide-react';
export default function Setup() {
  return (
    <main id="main-content" className="setup-page">
      <div className="brand">
        <span className="brand-symbol">
          <ClipboardCheck />
        </span>
        forkcheck.
      </div>
      <div className="setup-card">
        <p className="eyebrow">PUESTA EN MARCHA</p>
        <h1>
          Tu operación empieza
          <br />
          con una base segura.
        </h1>
        <p className="lede">
          La aplicación está instalada. Conecta Supabase para acceder a tus equipos y realizar la
          primera inspección.
        </p>
        <div className="setup-step">
          <Database />
          <div>
            <h2>01 · Conecta la base de datos</h2>
            <p>
              Copia <code>.env.example</code> a <code>.env.local</code> y configura la URL y clave
              pública de Supabase.
            </p>
          </div>
        </div>
        <div className="setup-step">
          <Terminal />
          <div>
            <h2>02 · Aplica las migraciones</h2>
            <p>
              En desarrollo, ejecuta <code>npx supabase start</code> y{' '}
              <code>npx supabase db reset</code>. Consulta el README para desplegar.
            </p>
          </div>
        </div>
        <div className="setup-step">
          <ShieldCheck />
          <div>
            <h2>03 · Da de alta a tu equipo</h2>
            <p>
              Utiliza el script de provisión para crear una identidad de Supabase Auth y asignarle
              organización, rol y sucursales.
            </p>
          </div>
        </div>
        <div className="setup-note">
          Los datos operativos se consultan únicamente con una sesión autorizada. No hay datos
          simulados en la aplicación.
        </div>
      </div>
      <p className="help-text">FORKCHECK / CONTROL INDUSTRIAL</p>
    </main>
  );
}
