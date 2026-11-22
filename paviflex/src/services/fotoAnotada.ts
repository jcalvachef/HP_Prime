/**
 * Fotografía con las anotaciones de medición: regla de 1,00 m y trazos de largo, ancho y área
 * con su valor real. Se usa en la ficha de registro del informe y en las vistas previas.
 */
import type { Medicion, Pt } from '../domain/types';
import { pxPorMetro, valorTrazo } from '../domain/regla';
import { fmtFijo } from '../domain/formato';
import { cargarImagen, lienzo } from './imagen';
import { TINTA } from '../ui/colores';

export const COLOR_TRAZO = { largo: '#00e5ff', ancho: '#ffe94a', area: '#ff5ad1', regla: TINTA.naranja };
export const NOMBRE_TRAZO = { largo: 'Largo', ancho: 'Ancho', area: 'Área' };

function rotulo(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, color: string, tam: number) {
  ctx.font = `700 ${Math.round(tam)}px "Roboto", Arial, sans-serif`;
  const w = ctx.measureText(texto).width + tam * 0.8;
  const h = tam * 1.5;
  ctx.fillStyle = 'rgba(11,11,11,0.82)';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h * 0.3);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, x, y + tam * 0.05);
}

function centroide(p: Pt[]): Pt {
  return { x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length };
}

/** Dibuja las anotaciones sobre un lienzo cuyo sistema de coordenadas es el de la fotografía × f. */
export function dibujarAnotaciones(ctx: CanvasRenderingContext2D, m: Medicion, f: number, anchoLienzo: number) {
  const u = Math.max(1, anchoLienzo / 420); // unidad de trazo proporcional al tamaño de salida
  const ppm = pxPorMetro(m);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const t of m.trazos) {
    if (t.puntos.length < 2) continue;
    const color = COLOR_TRAZO[t.clase];
    ctx.beginPath();
    t.puntos.forEach((p, i) => (i ? ctx.lineTo(p.x * f, p.y * f) : ctx.moveTo(p.x * f, p.y * f)));
    if (t.clase === 'area') {
      ctx.closePath();
      ctx.fillStyle = color + '33';
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 4.4 * u;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4 * u;
    ctx.stroke();
    if (ppm) {
      const v = valorTrazo(t, ppm);
      const c = t.clase === 'area' ? centroide(t.puntos) : puntoEnFraccion(t.puntos, t.clase === 'largo' ? 0.28 : 0.72);
      rotulo(ctx, `${NOMBRE_TRAZO[t.clase]} ${fmtFijo(v, 2)} ${t.clase === 'area' ? 'm²' : 'm'}`, c.x * f, c.y * f, color, 11 * u);
    }
  }
  if (m.regla) {
    const { a, b } = m.regla;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 4.4 * u;
    ctx.beginPath(); ctx.moveTo(a.x * f, a.y * f); ctx.lineTo(b.x * f, b.y * f); ctx.stroke();
    ctx.strokeStyle = COLOR_TRAZO.regla;
    ctx.lineWidth = 2.4 * u;
    ctx.setLineDash([7 * u, 5 * u]);
    ctx.beginPath(); ctx.moveTo(a.x * f, a.y * f); ctx.lineTo(b.x * f, b.y * f); ctx.stroke();
    ctx.setLineDash([]);
    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.arc(p.x * f, p.y * f, 4.5 * u, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2 * u;
      ctx.strokeStyle = COLOR_TRAZO.regla;
      ctx.stroke();
    }
    rotulo(ctx, `Regla ${fmtFijo(m.longitudRegla, 2)} m`, ((a.x + b.x) / 2) * f, ((a.y + b.y) / 2) * f - 13 * u, COLOR_TRAZO.regla, 11 * u);
  }
  ctx.restore();
}

/** Punto a una fracción de la longitud de la polilínea (los rótulos de largo y ancho no se superponen donde se cruzan). */
function puntoEnFraccion(p: Pt[], fr: number): Pt {
  let total = 0;
  for (let i = 1; i < p.length; i++) total += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  let acum = 0;
  for (let i = 1; i < p.length; i++) {
    const d = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    if (acum + d >= total * fr && d > 0) {
      const t = (total * fr - acum) / d;
      return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * t, y: p[i - 1].y + (p[i].y - p[i - 1].y) * t };
    }
    acum += d;
  }
  return p[p.length - 1];
}

/**
 * Devuelve la fotografía reducida al lado máximo indicado, con las anotaciones y un sello con
 * el número de foto y la fecha (el manual pide que el registro fotográfico indique la fecha).
 */
export async function fotoParaInforme(
  foto: Blob,
  medicion: Medicion | null,
  sello: string,
  ladoMax = 1100,
): Promise<{ dataUrl: string; w: number; h: number }> {
  const img = await cargarImagen(foto);
  const f = Math.min(1, ladoMax / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * f), h = Math.round(img.naturalHeight * f);
  const c = lienzo(w, h);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  if (medicion) dibujarAnotaciones(ctx, medicion, f, w);
  if (sello) {
    const tam = Math.max(11, w / 46);
    ctx.font = `600 ${Math.round(tam)}px "Roboto", Arial, sans-serif`;
    const tw = ctx.measureText(sello).width + tam;
    ctx.fillStyle = 'rgba(11,11,11,0.7)';
    ctx.fillRect(w - tw, h - tam * 1.7, tw, tam * 1.7);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(sello, w - tam / 2, h - tam * 0.82);
  }
  return { dataUrl: c.toDataURL('image/jpeg', 0.82), w, h };
}
