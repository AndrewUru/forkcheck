import Link from 'next/link';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { session } from '@/lib/auth/session';
import { QrScanner } from '@/components/equipment/qr-scanner';
import { MyEquipment } from '@/components/equipment/my-equipment';
export default async function Scan() {
  const { profile } = await session();
  return (
    <div className="scan-experience">
      <header className="scan-intro">
        <p className="eyebrow">HOLA, {profile.nickname || profile.first_name}</p>
        <h1>
          Escanea tu equipo.
          <br />
          <span>Empieza con seguridad.</span>
        </h1>
        <p>Apunta al QR, comprueba el estado y comienza tu revisión.</p>
      </header>
      <div className="scan-layout">
        <QrScanner />
        <aside className="scan-alternatives">
          <MyEquipment subtle />
          <Link className="scan-turn-link" href="/shift">
            <ClipboardCheck size={24} />
            <span>
              <strong>Mi turno</strong>
              <small>Revisiones en curso y pendientes</small>
            </span>
            <ArrowRight size={20} />
          </Link>
          <p className="muted">
            También puedes <Link href="/equipment">buscar en tus equipos autorizados</Link>.
          </p>
        </aside>
      </div>
    </div>
  );
}
