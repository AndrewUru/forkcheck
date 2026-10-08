'use client';
import Link from 'next/link';
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <section className="panel detail-panel workspace-error">
      <p className="eyebrow">NO SE PUDO CARGAR</p>
      <h1>Volvamos a intentarlo.</h1>
      <p>
        No hemos podido consultar la información actualizada. Comprueba la conexión y vuelve a
        cargar la pantalla.
      </p>
      <div className="heading-actions">
        <button className="button primary" onClick={reset}>
          Reintentar
        </button>
        <Link className="button" href="/">
          Volver al inicio
        </Link>
      </div>
    </section>
  );
}
