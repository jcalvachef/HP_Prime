/**
 * Gráficas del informe (capítulo 3 del manual), dibujadas en lienzo para insertarlas en PDF/Word
 * y mostrarlas en la aplicación.
 *  - Área afectada por tramo (columnas).
 *  - Distribución de los daños por tipo, una gráfica por severidad (barras horizontales con la
 *    misma escala). El porcentaje respecto al área inspeccionada va rotulado en cada barra,
 *    en lugar de un segundo eje.
 */
import type { AnalisisGrupo } from '../domain/analisis';
import type { Severidad } from '../domain/types';
import { fmtNum } from '../domain/formato';
import { lienzo } from '../services/imagen';
import { TINTA } from '../ui/colores';

export interface Grafica {
  dataUrl: string;
  w: number;
  h: number;
}

const F = '"Roboto", "Helvetica Neue", Arial, sans-serif';
const K = 3; // densidad para impresión

function pasoBonito(max: number, objetivo = 5): number {
  if (!(max > 0)) return 1;
  const bruto = max / objetivo;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const f = bruto / pot;
  return (f > 5 ? 10 : f > 2 ? 5 : f > 1 ? 2 : 1) * pot;
}

function fmtPctCorto(fr: number): string {
  const v = fr * 100;
  const dec = v >= 10 ? 1 : v >= 0.1 ? 2 : 3;
  return v.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' %';
}

/** Columnas: área afectada (m²) en cada tramo. */
export function graficaTramos(a: AnalisisGrupo): Grafica {
  const W = 640, H = 300;
  const c = lienzo(W * K, H * K);
  const ctx = c.getContext('2d')!;
  ctx.scale(K, K);
  ctx.fillStyle = TINTA.superficie;
  ctx.fillRect(0, 0, W, H);
  const mIzq = 52, mDer = 14, mSup = 18, mInf = 42;
  const pw = W - mIzq - mDer, ph = H - mSup - mInf;
  const n = a.tramos.length;
  const max = Math.max(...a.totalTramo, 0);
  const paso = pasoBonito(max || 1);
  const tope = Math.max(paso, Math.ceil((max * 1.08) / paso) * paso);
  const y = (v: number) => mSup + ph - (v / tope) * ph;

  ctx.font = `400 10px ${F}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (let v = 0; v <= tope + 1e-9; v += paso) {
    ctx.strokeStyle = v === 0 ? TINTA.eje : TINTA.rejilla;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mIzq, Math.round(y(v)) + 0.5);
    ctx.lineTo(W - mDer, Math.round(y(v)) + 0.5);
    ctx.stroke();
    ctx.fillStyle = TINTA.tenue;
    ctx.fillText(fmtNum(v, 2), mIzq - 6, y(v));
  }
  const banda = pw / Math.max(1, n);
  const anchoBarra = Math.max(2, Math.min(24, banda - 2));
  const iMax = a.totalTramo.indexOf(max);
  const cadaEtiqueta = Math.ceil(n / Math.floor(pw / 26));
  for (let i = 0; i < n; i++) {
    const cx = mIzq + banda * (i + 0.5);
    const v = a.totalTramo[i];
    if (v > 0) {
      const alto = Math.max(1, y(0) - y(v));
      const r = Math.min(4, anchoBarra / 2, alto);
      ctx.fillStyle = TINTA.serie;
      ctx.beginPath();
      ctx.roundRect(cx - anchoBarra / 2, y(v), anchoBarra, alto, [r, r, 0, 0]);
      ctx.fill();
    }
    if (i % cadaEtiqueta === 0 || i === n - 1) {
      ctx.fillStyle = TINTA.secundaria;
      ctx.font = `400 10px ${F}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(a.tramos[i].id, cx, mSup + ph + 6);
    }
  }
  // Rótulos directos: con pocos tramos, todos; con muchos, solo el máximo.
  ctx.font = `600 10px ${F}`;
  ctx.fillStyle = TINTA.primaria;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (let i = 0; i < n; i++) {
    const v = a.totalTramo[i];
    if (!(v > 0)) continue;
    if (n <= 12 || i === iMax) ctx.fillText(fmtNum(v, 2), mIzq + banda * (i + 0.5), y(v) - 3);
  }
  ctx.fillStyle = TINTA.secundaria;
  ctx.font = `500 10.5px ${F}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Tramo', mIzq + pw / 2, H - 8);
  ctx.save();
  ctx.translate(13, mSup + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Área afectada (m²)', 0, 0);
  ctx.restore();
  return { dataUrl: c.toDataURL('image/png'), w: W, h: H };
}

const TITULO_SEV: Record<Severidad | 'N', string> = {
  B: 'Severidad baja',
  M: 'Severidad media',
  A: 'Severidad alta',
  N: 'Sin grados de severidad asociados',
};

/**
 * Barras horizontales por tipo de daño, un panel por severidad (misma escala en todos los paneles).
 * Cada barra lleva su área y el porcentaje del área inspeccionada.
 */
export function graficaSeveridades(a: AnalisisGrupo): Grafica | null {
  const paneles = (['B', 'M', 'A', 'N'] as const)
    .map((s) => ({
      sev: s,
      filas: a.columnas
        .map((col, j) => ({ col, area: a.totalColumna[j] }))
        .filter((x) => (x.col.sev ?? 'N') === s && x.area > 0)
        .sort((p, q) => q.area - p.area),
    }))
    .filter((p) => p.filas.length);
  if (!paneles.length) return null;

  const W = 640;
  const altoFila = 22, cabecera = 26, pie = 10, mIzq = 56, mDer = 118;
  const H = paneles.reduce((s, p) => s + cabecera + p.filas.length * altoFila + pie, 0) + 30;
  const c = lienzo(W * K, H * K);
  const ctx = c.getContext('2d')!;
  ctx.scale(K, K);
  ctx.fillStyle = TINTA.superficie;
  ctx.fillRect(0, 0, W, H);
  const max = Math.max(...paneles.flatMap((p) => p.filas.map((f) => f.area)));
  const paso = pasoBonito(max, 4);
  const tope = Math.max(paso, Math.ceil(max / paso) * paso);
  const pw = W - mIzq - mDer;
  const x = (v: number) => mIzq + (v / tope) * pw;

  let y0 = 4;
  for (const p of paneles) {
    ctx.fillStyle = TINTA.primaria;
    ctx.font = `600 11.5px ${F}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(TITULO_SEV[p.sev], 4, y0 + cabecera / 2 + 1);
    const yTop = y0 + cabecera;
    const alto = p.filas.length * altoFila;
    for (let v = 0; v <= tope + 1e-9; v += paso) {
      ctx.strokeStyle = v === 0 ? TINTA.eje : TINTA.rejilla;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x(v)) + 0.5, yTop);
      ctx.lineTo(Math.round(x(v)) + 0.5, yTop + alto);
      ctx.stroke();
    }
    p.filas.forEach((f, i) => {
      const cy = yTop + altoFila * (i + 0.5);
      const largo = Math.max(1.5, x(f.area) - x(0));
      const gr = 14;
      const r = Math.min(4, largo);
      ctx.fillStyle = TINTA.serie;
      ctx.beginPath();
      ctx.roundRect(x(0), cy - gr / 2, largo, gr, [0, r, r, 0]);
      ctx.fill();
      ctx.fillStyle = TINTA.secundaria;
      ctx.font = `500 10.5px ${F}`;
      ctx.textAlign = 'right';
      ctx.fillText(f.col.sigla, mIzq - 8, cy + 0.5);
      ctx.fillStyle = TINTA.primaria;
      ctx.font = `600 10px ${F}`;
      ctx.textAlign = 'left';
      const txtArea = `${fmtNum(f.area, 2)} m²`;
      const txtPct = ` · ${fmtPctCorto(a.areaRefTotal > 0 ? f.area / a.areaRefTotal : 0)}`;
      const wArea = ctx.measureText(txtArea).width;
      ctx.font = `400 10px ${F}`;
      const wPct = ctx.measureText(txtPct).width;
      // Fondo del rótulo para que las líneas de la rejilla no lo crucen
      ctx.fillStyle = TINTA.superficie;
      ctx.fillRect(x(f.area) + 3, cy - 7, wArea + wPct + 6, 14);
      ctx.fillStyle = TINTA.primaria;
      ctx.font = `600 10px ${F}`;
      ctx.fillText(txtArea, x(f.area) + 6, cy + 0.5);
      ctx.fillStyle = TINTA.secundaria;
      ctx.font = `400 10px ${F}`;
      ctx.fillText(txtPct, x(f.area) + 6 + wArea, cy + 0.5);
    });
    y0 = yTop + alto + pie;
  }
  // Eje común
  ctx.fillStyle = TINTA.tenue;
  ctx.font = `400 10px ${F}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let v = 0; v <= tope + 1e-9; v += paso) ctx.fillText(fmtNum(v, 2), x(v), y0 - 4);
  ctx.fillStyle = TINTA.secundaria;
  ctx.font = `500 10.5px ${F}`;
  ctx.textAlign = 'right';
  ctx.fillText('Área afectada (m²) · % del área de referencia', W - 4, y0 + 12);
  return { dataUrl: c.toDataURL('image/png'), w: W, h: H };
}
