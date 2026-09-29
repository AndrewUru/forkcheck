export default function Loading() {
  return (
    <div aria-label="Cargando datos" aria-busy="true">
      <div className="skeleton" style={{ width: '45%', height: 48 }} />
      <div className="metric-grid">
        {[1, 2, 3, 4].map((n) => (
          <div className="skeleton" key={n} style={{ height: 140 }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 360 }} />
    </div>
  );
}
