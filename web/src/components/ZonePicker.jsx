import { useEffect, useRef } from 'react';

const ZONE_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];

export default function ZonePicker({ zones = [], onZonesChange, canvasRef: externalRef, externalImageUrl }) {
  const internalRef = useRef(null);
  const ref = externalRef || internalRef;
  const imgRef = useRef(null);
  const drawing = useRef(null);

  const redraw = () => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (imgRef.current) {
      ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);
    }
    zones.forEach((z, i) => {
      const color = ZONE_COLORS[i % ZONE_COLORS.length];
      const rx = z.x * canvas.width;
      const ry = z.y * canvas.height;
      const rw = z.w * canvas.width;
      const rh = z.h * canvas.height;
      ctx.fillStyle = color + '33';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillStyle = color;
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(z.name || `Zone ${i + 1}`, rx + 4, ry + 14);
    });
  };

  useEffect(() => {
    if (!externalImageUrl) {
      imgRef.current = null;
      redraw();
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = ref.current;
      if (canvas) {
        const maxW = 800;
        const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
      }
      imgRef.current = img;
      redraw();
    };
    img.onerror = () => {
      imgRef.current = null;
      redraw();
    };
    img.src = externalImageUrl;
  }, [externalImageUrl]);

  useEffect(() => {
    redraw();
  }, [zones]);

  const getPos = (e) => {
    const canvas = ref.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const onMouseDown = (e) => {
    if (!imgRef.current) return;
    drawing.current = getPos(e);
  };

  const onMouseUp = (e) => {
    if (!drawing.current || !imgRef.current) return;
    const start = drawing.current;
    const end = getPos(e);
    drawing.current = null;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    if (w < 0.01 || h < 0.01) return;
    const name = window.prompt('Zone name (e.g. BookletBarcode):');
    if (!name) return;
    onZonesChange([...zones, { name, pageScope: 'FirstPage', pageScopeValue: 1, x, y, w, h, hint: 'ANY' }]);
  };

  if (!externalImageUrl) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        border: '1px dashed var(--border-color)',
        borderRadius: '6px',
        fontSize: '0.85rem',
      }}>
        Upload a sample image to pick barcode zones
      </div>
    );
  }

  return (
    <canvas
      ref={ref}
      style={{
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        cursor: 'crosshair',
        maxWidth: '100%',
        display: 'block',
      }}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
    />
  );
}
