'use client';
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <div className="empty">
      <h1>No se han podido cargar los datos</h1>
      <p>Comprueba la conexión e inténtalo de nuevo. No se mostrarán cifras incompletas.</p>
      <button className="button primary" onClick={reset}>
        Reintentar
      </button>
    </div>
  );
}
