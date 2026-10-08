export default function LoadingWorkspace() {
  return (
    <div className="workspace-loading" role="status" aria-live="polite">
      <span className="eyebrow">FORKCHECK</span>
      <h1>Preparando tu espacio…</h1>
      <p>Consultando el estado actualizado de tus equipos.</p>
      <div className="loading-skeleton" aria-hidden />
      <div className="loading-skeleton short" aria-hidden />
    </div>
  );
}
