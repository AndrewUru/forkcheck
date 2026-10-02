import { redirect } from 'next/navigation';
import { ScanLine } from 'lucide-react';
async function openEquipment(form: FormData) {
  'use server';
  const code = String(form.get('code') ?? '').trim();
  if (!/^[a-zA-Z0-9-]{4,80}$/.test(code)) redirect('/scan?error=code');
  redirect(`/equipment/${encodeURIComponent(code)}`);
}
export default async function Scan({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="scan-page">
      <ScanLine size={64} />
      <p className="eyebrow">ACCESO RÁPIDO</p>
      <h1>Escanea. Revisa. Continúa.</h1>
      <p>
        Abre la cámara de tu teléfono y apunta al QR del equipo. El enlace te llevará directamente a
        su ficha.
      </p>
      <section className="panel detail-panel">
        <h2>¿Tienes el código del QR?</h2>
        <form action={openEquipment}>
          <label>
            Código público
            <input
              name="code"
              required
              placeholder="Código de la etiqueta QR"
              pattern="[a-zA-Z0-9\-]{4,80}"
            />
          </label>
          {error && <p role="alert">Introduce un código válido.</p>}
          <button className="button primary full">Abrir equipo</button>
        </form>
      </section>
    </div>
  );
}
