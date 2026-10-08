'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, ScanLine, ShieldCheck, ArrowRight, Square } from 'lucide-react';
import { equipmentCodeFromQr } from '@/lib/qr';
import { resolveScannedEquipment } from '@/app/scan-actions';
export function QrScanner() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const [state, setState] = useState<'idle' | 'starting' | 'scanning' | 'resolving'>('idle');
  const [message, setMessage] = useState('Activa la cámara y encuadra la etiqueta del equipo.');
  const [code, setCode] = useState('');
  const stop = useCallback(() => {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        stop();
        setState('idle');
        setMessage('Cámara en pausa. Actívala cuando quieras continuar.');
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      stop();
    };
  }, [stop]);
  async function open(raw: string) {
    stop();
    const attempt = generation.current;
    const publicCode = equipmentCodeFromQr(raw, window.location.origin);
    if (!publicCode) {
      setState('idle');
      setMessage(
        'Ese QR no pertenece a esta aplicación. Escanea una etiqueta de Forkcheck o introduce su código.',
      );
      return;
    }
    setState('resolving');
    setMessage('Etiqueta reconocida. Comprobando acceso al equipo…');
    try {
      const result = await resolveScannedEquipment(publicCode);
      if (attempt !== generation.current) return;
      if (result.href) {
        router.push(result.href);
        return;
      }
      setMessage(result.message ?? 'No se pudo abrir el equipo.');
    } catch {
      if (attempt !== generation.current) return;
      setMessage('No se pudo conectar. Puedes volver a intentarlo sin perder el código.');
    }
    setState('idle');
  }
  async function start() {
    stop();
    const attempt = generation.current;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setState('idle');
      setMessage(
        'La cámara necesita HTTPS y un navegador compatible. Puedes introducir el código de la etiqueta abajo.',
      );
      return;
    }
    setState('starting');
    setMessage('Permite el acceso a la cámara para leer el QR.');
    try {
      const { default: decode } = await import('jsqr');
      if (attempt !== generation.current) return;
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
      if (attempt !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const element = video.current;
      if (!element) {
        stop();
        return;
      }
      element.srcObject = media;
      await element.play();
      if (attempt !== generation.current) return;
      setState('scanning');
      setMessage('Busca buena luz y mantén el QR dentro del recuadro.');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas unavailable');
      const read = () => {
        if (attempt !== generation.current) return;
        try {
          if (element.readyState >= 2 && element.videoWidth) {
            const scale = Math.min(1, 720 / Math.max(element.videoWidth, element.videoHeight));
            canvas.width = Math.round(element.videoWidth * scale);
            canvas.height = Math.round(element.videoHeight * scale);
            context.drawImage(element, 0, 0, canvas.width, canvas.height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            const qr = decode(pixels.data, pixels.width, pixels.height, {
              inversionAttempts: 'attemptBoth',
            });
            if (qr) {
              void open(qr.data);
              return;
            }
          }
          timer.current = setTimeout(read, 200);
        } catch {
          stop();
          setState('idle');
          setMessage('La cámara se ha interrumpido. Actívala de nuevo o introduce el código.');
        }
      };
      read();
    } catch (error) {
      if (attempt !== generation.current) return;
      stop();
      setState('idle');
      setMessage(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'No hay permiso de cámara. Puedes permitirlo en el navegador o introducir el código abajo.'
          : 'No se pudo abrir la cámara. Comprueba que no esté ocupada o introduce el código abajo.',
      );
    }
  }
  return (
    <section className="scanner-card" aria-label="Lector QR de equipos">
      <div className={`scanner-viewport ${state === 'scanning' ? 'is-scanning' : ''}`}>
        <video ref={video} muted playsInline aria-label="Vista de la cámara para escanear" />
        <div className="scanner-frame" aria-hidden>
          <span />
          <span />
          <span />
          <span />
          {state !== 'scanning' && <ScanLine size={70} strokeWidth={1.25} />}
        </div>
        <span className="scanner-caption">
          {state === 'scanning'
            ? 'Cámara activa'
            : state === 'resolving'
              ? 'Abriendo equipo…'
              : 'Tu revisión empieza aquí'}
        </span>
      </div>
      <div className="scanner-controls">
        <p role="status" aria-live="polite">
          {message}
        </p>
        {state === 'scanning' || state === 'starting' ? (
          <button
            className="button full"
            type="button"
            onClick={() => {
              stop();
              setState('idle');
              setMessage('Cámara detenida. Puedes activarla de nuevo.');
            }}
          >
            <Square size={18} />
            {state === 'starting' ? 'Cancelar' : 'Detener cámara'}
          </button>
        ) : (
          <button
            type="button"
            className="button primary full"
            disabled={state === 'resolving'}
            onClick={start}
          >
            <Camera size={20} />
            {state === 'resolving' ? 'Comprobando equipo…' : 'Activar cámara'}
          </button>
        )}
        <p className="scanner-privacy">
          <ShieldCheck size={15} />
          La imagen se procesa en tu dispositivo y no se guarda.
        </p>
        <details className="scanner-manual">
          <summary>Introducir código o enlace del QR</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void open(code);
            }}
          >
            <label>
              Código público o enlace de la etiqueta
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
                maxLength={2048}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <button
              className="button dark full"
              disabled={state === 'resolving' || state === 'starting'}
            >
              Abrir equipo <ArrowRight size={18} />
            </button>
          </form>
        </details>
      </div>
    </section>
  );
}
