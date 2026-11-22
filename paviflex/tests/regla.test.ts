import { describe, expect, it } from 'vitest';
import { areaPoligono, detectarReglaNaranja, pxPorMetro, resumenMedicion } from '../src/domain/regla';
import type { Medicion } from '../src/domain/types';

function imagenConRegla(w: number, h: number, x0: number, y0: number, x1: number, y1: number, grosor: number) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      // asfalto gris con textura determinista
      const g = 70 + ((x * 31 + y * 17) % 23);
      d[p] = g; d[p + 1] = g; d[p + 2] = g + 2; d[p + 3] = 255;
      // distancia al segmento
      const vx = x1 - x0, vy = y1 - y0;
      const t = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy)));
      const dist = Math.hypot(x - (x0 + t * vx), y - (y0 + t * vy));
      if (dist <= grosor / 2) { d[p] = 255; d[p + 1] = 120; d[p + 2] = 10; }
    }
  // distractor: línea amarilla de demarcación y mancha rojiza pequeña
  for (let y = 10; y < 16; y++) for (let x = 0; x < w; x++) { const p = (y * w + x) * 4; d[p] = 240; d[p + 1] = 210; d[p + 2] = 40; }
  for (let y = 200; y < 206; y++) for (let x = 30; x < 36; x++) { const p = (y * w + x) * 4; d[p] = 250; d[p + 1] = 110; d[p + 2] = 20; }
  return d;
}

describe('regla naranja de 1 m', () => {
  it('detecta los extremos de una regla inclinada', () => {
    const w = 400, h = 300;
    const d = imagenConRegla(w, h, 80, 220, 330, 150, 8);
    const r = detectarReglaNaranja(d, w, h);
    expect(r).not.toBeNull();
    const ext = [r!.a, r!.b].sort((p, q) => p.x - q.x);
    expect(Math.hypot(ext[0].x - 80, ext[0].y - 220)).toBeLessThan(6);
    expect(Math.hypot(ext[1].x - 330, ext[1].y - 150)).toBeLessThan(6);
  });
  it('no inventa una regla cuando no hay naranja', () => {
    const w = 200, h = 150;
    const d = new Uint8ClampedArray(w * h * 4).fill(90);
    expect(detectarReglaNaranja(d, w, h)).toBeNull();
  });
  it('convierte trazos a metros y m² con la escala de la regla', () => {
    const m: Medicion = {
      regla: { a: { x: 100, y: 100 }, b: { x: 600, y: 100 } }, // 500 px = 1 m
      longitudRegla: 1,
      trazos: [
        { id: '1', clase: 'largo', puntos: [{ x: 0, y: 0 }, { x: 1000, y: 0 }] },
        { id: '2', clase: 'ancho', puntos: [{ x: 0, y: 0 }, { x: 0, y: 250 }] },
        { id: '3', clase: 'area', puntos: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 500 }, { x: 0, y: 500 }] },
      ],
    };
    expect(pxPorMetro(m)).toBe(500);
    const r = resumenMedicion(m);
    expect(r.largo).toBeCloseTo(2);
    expect(r.ancho).toBeCloseTo(0.5);
    expect(r.area).toBeCloseTo(2);
    expect(areaPoligono([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }])).toBe(6);
  });
});
