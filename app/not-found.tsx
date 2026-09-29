import Link from 'next/link';
export default function NotFound() {
  return (
    <main id="main-content" className="empty">
      <h1>No disponible</h1>
      <p>Este recurso no existe o no tienes permiso para consultarlo.</p>
      <Link className="button primary" href="/">
        Volver al inicio
      </Link>
    </main>
  );
}
