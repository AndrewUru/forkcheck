import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'Forkcheck · Control industrial', template: '%s · Forkcheck' },
  description: 'Inspección, seguridad y control diario de equipos industriales.',
  applicationName: 'Forkcheck',
  manifest: '/manifest.webmanifest',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <a className="skip-link" href="#main-content">
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
