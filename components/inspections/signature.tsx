'use client';
import { useRef, useState, type PointerEvent } from 'react';
export function Signature({
  onChange,
  disabled,
}: {
  onChange: (file: File | null) => void;
  disabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const points = useRef(0);
  const [signed, setSigned] = useState(false);
  function position(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * 800) / rect.width,
      y: ((event.clientY - rect.top) * 280) / rect.height,
    };
  }
  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const ctx = event.currentTarget.getContext('2d');
    const p = position(event);
    ctx?.beginPath();
    ctx?.moveTo(p.x, p.y);
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const ctx = event.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = position(event);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#132b30';
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    points.current++;
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    if (points.current < 8) return;
    setSigned(true);
    canvasRef.current?.toBlob((blob) => {
      if (blob) onChange(new File([blob], 'signature.png', { type: 'image/png' }));
    }, 'image/png');
  }
  function clear() {
    canvasRef.current?.getContext('2d')?.clearRect(0, 0, 800, 280);
    points.current = 0;
    setSigned(false);
    onChange(null);
  }
  return (
    <div className="signature">
      <div className="signature-heading">
        <label htmlFor="signature-pad">Firma de confirmación</label>
        <button type="button" className="text-link" onClick={clear} disabled={disabled}>
          Borrar firma
        </button>
      </div>
      <canvas
        id="signature-pad"
        ref={canvasRef}
        width={800}
        height={280}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="Dibuja tu firma con el dedo o el ratón"
      />
      <p>
        {signed ? 'Firma capturada.' : 'Firma dentro del recuadro con el dedo o el ratón.'}{' '}
        Evidencia interna de confirmación; no es una firma electrónica cualificada.
      </p>
    </div>
  );
}
