import Link from 'next/link';
import { session } from '@/lib/auth/session';
import { can } from '@/lib/permissions';
import { AssistantForm } from '@/components/ai/assistant-form';

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ equipment?: string }>;
}) {
  const { profile } = await session();
  const code = (await searchParams).equipment;
  const publicCode = code && /^[a-zA-Z0-9-]{4,80}$/.test(code) ? code : undefined;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">AYUDA / DATOS AUTORIZADOS</p>
          <h1>Asistente IA</h1>
          <p>Pregunta por inspecciones, incidencias o el estado de la flota.</p>
        </div>
      </div>
      {publicCode && (
        <p className="info-note">
          Equipo seleccionado: <strong>{publicCode}</strong> ·{' '}
          <Link href="/assistant">Quitar filtro</Link>
        </p>
      )}
      <section className="panel assistant-panel">
        <AssistantForm publicCode={publicCode} canSeeMetrics={can(profile, 'dashboard')} />
      </section>
      <p className="muted assistant-footnote">
        Las respuestas son orientativas y se basan en los datos que puedes consultar. Comprueba el
        estado del equipo antes de utilizarlo.
      </p>
    </>
  );
}
