'use client';
import { useEffect, useRef } from 'react';
import { drawPiece, PIECE_SHAPES } from '@/lib/pieces';

export function Pieces() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current, c = cv?.getContext('2d');
    if (!cv || !c) return;
    const W = 1100, H = 760;
    cv.width = W * 2; cv.height = H * 2;
    c.scale(2, 2);
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1238F5'); bg.addColorStop(.55, '#3F6BFF'); bg.addColorStop(1, '#86A8FF');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    PIECE_SHAPES.forEach((s, i) => {
      const at = (x: number, y: number, size: number, a: number, v = 0) => { c.save(); c.translate(x, y); drawPiece(c, s, size, v, a); c.restore(); };
      at(120 + i * 215, 130, 150, 0);
      at(120 + i * 215, 300, 90, .9);
      for (let k = 0; k < 14; k++) at(60 + i * 215 + (k % 5) * 33 + (k > 9 ? 12 : k > 4 ? 16 : 0), 560 - Math.floor(k / 5) * 34, 44, k * 1.3 + i, k);
      for (let k = 0; k < 24; k++) at(45 + i * 215 + (k % 8) * 21, 690 - Math.floor(k / 8) * 20, 24, k * 2.1 + i, k);
    });
  }, []);
  return <canvas ref={ref} style={{ width: 1100, height: 760 }} />;
}
