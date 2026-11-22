/**
 * Vista en planta del daño sobre fondo Google Maps (Maps Static API) y composición del plano:
 * marcador numerado, flecha de norte, barra de escala y coordenadas. Cuando no hay clave de API
 * o conexión, se dibuja un croquis de localización con cuadrícula EPSG:9377.
 */
import { CapacitorHttp } from '@capacitor/core';
import type { Ajustes, MapaDano, TipoMapa } from '../domain/types';
import { aEpsg9377, metrosPorPixel, pixelMundo } from '../domain/geo';
import { base64ABlob, cargarImagen, lienzo } from './imagen';
import { esNativo } from './plataforma';
import { TINTA } from '../ui/colores';

export const MAPA_W = 600;
export const MAPA_H = 450;
export const MAPA_ESCALA = 2;

export function urlMapaEstatico(lat: number, lon: number, zoom: number, tipo: TipoMapa, clave: string, w = MAPA_W, h = MAPA_H): string {
  const p = new URLSearchParams({
    center: `${lat.toFixed(7)},${lon.toFixed(7)}`,
    zoom: String(zoom),
    size: `${w}x${h}`,
    scale: String(MAPA_ESCALA),
    maptype: tipo,
    format: 'jpg',
    language: 'es',
    region: 'CO',
    key: clave,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${p.toString()}`;
}

async function descargarImagen(url: string): Promise<Blob> {
  if (esNativo) {
    const r = await CapacitorHttp.get({ url, responseType: 'blob' });
    if (r.status !== 200) throw new Error(mensajeGoogle(r.status, typeof r.data === 'string' ? r.data : ''));
    const tipo = r.headers['Content-Type'] ?? r.headers['content-type'] ?? 'image/jpeg';
    if (!tipo.startsWith('image/')) throw new Error(mensajeGoogle(r.status, ''));
    return base64ABlob(String(r.data).replace(/\s/g, ''), tipo.split(';')[0]);
  }
  let r: Response;
  try {
    r = await fetch(url);
  } catch {
    throw new Error('Sin conexión a Internet para descargar el mapa.');
  }
  if (!r.ok) throw new Error(mensajeGoogle(r.status, await r.text().catch(() => '')));
  const b = await r.blob();
  if (!b.type.startsWith('image/')) throw new Error(mensajeGoogle(r.status, ''));
  return b;
}

function mensajeGoogle(estado: number, cuerpo: string): string {
  if (estado === 403) return 'Google Maps rechazó la clave de API (403). Verifique la clave y que "Maps Static API" esté habilitada con facturación activa.';
  if (estado === 400) return 'Solicitud de mapa inválida (400).';
  if (estado === 429) return 'Se superó la cuota de Google Maps (429).';
  return `No se pudo descargar el mapa (${estado}). ${cuerpo.slice(0, 120)}`;
}

/** Descarga el mapa de fondo centrado en la posición. Lanza un error descriptivo si falla. */
export async function descargarMapa(lat: number, lon: number, aj: Pick<Ajustes, 'claveGoogleMaps' | 'tipoMapa' | 'zoomMapa'>, zoom?: number): Promise<{ blob: Blob; meta: Omit<MapaDano, 'blobId'> }> {
  const clave = aj.claveGoogleMaps.trim();
  if (!clave) throw new Error('Falta la clave de API de Google Maps (Ajustes).');
  const z = zoom ?? aj.zoomMapa;
  const blob = await descargarImagen(urlMapaEstatico(lat, lon, z, aj.tipoMapa, clave));
  return { blob, meta: { zoom: z, tipo: aj.tipoMapa, w: MAPA_W, h: MAPA_H, escala: MAPA_ESCALA, lat, lon } };
}

/** Zoom y centro para que un conjunto de puntos quepa en el mapa (plano general del sector). */
export function encuadre(puntos: { lat: number; lon: number }[], w = MAPA_W, h = MAPA_H, margen = 60): { lat: number; lon: number; zoom: number } {
  const lats = puntos.map((p) => p.lat);
  const lons = puntos.map((p) => p.lon);
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lon = (Math.min(...lons) + Math.max(...lons)) / 2;
  let zoom = 20;
  for (; zoom > 3; zoom--) {
    const xs = puntos.map((p) => pixelMundo(p.lat, p.lon, zoom));
    const dx = Math.max(...xs.map((p) => p.x)) - Math.min(...xs.map((p) => p.x));
    const dy = Math.max(...xs.map((p) => p.y)) - Math.min(...xs.map((p) => p.y));
    if (dx <= w - 2 * margen && dy <= h - 2 * margen) break;
  }
  return { lat, lon, zoom };
}

export interface Marcador {
  lat: number;
  lon: number;
  etiqueta: string;
  color: string;
  colorTexto?: string;
  /** Marcador principal: se dibuja más grande y encima de los demás */
  principal?: boolean;
}

export interface PlanoCompuesto {
  dataUrl: string;
  w: number;
  h: number;
  /** true si el fondo es Google Maps; false si es el croquis de respaldo */
  conFondo: boolean;
}

const FUENTE = '"Roboto", "Helvetica Neue", Arial, sans-serif';

function dibujarMarcador(ctx: CanvasRenderingContext2D, x: number, y: number, m: Marcador, k: number) {
  const r = (m.principal ? 15 : 11) * k;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r + 2.5 * k, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 5 * k;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = m.color;
  ctx.fill();
  ctx.fillStyle = m.colorTexto ?? '#ffffff';
  ctx.font = `700 ${Math.round((m.etiqueta.length > 2 ? 10 : 13) * k * (m.principal ? 1.15 : 1))}px ${FUENTE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(m.etiqueta, x, y + 0.5 * k);
  ctx.restore();
}

function escalaBonita(metros: number): number {
  const pot = Math.pow(10, Math.floor(Math.log10(metros)));
  const f = metros / pot;
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * pot;
}

function dibujarEscalaYNorte(ctx: CanvasRenderingContext2D, W: number, _H: number, mPorPx: number, k: number, norte: string) {
  // Barra de escala (arriba a la izquierda: la esquina inferior es de la atribución de Google)
  const metros = escalaBonita(mPorPx * W * 0.28);
  const largo = metros / mPorPx;
  const x0 = 14 * k, y0 = 14 * k;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = 'rgba(11,11,11,0.25)';
  ctx.lineWidth = 1 * k;
  const cajaW = largo + 20 * k, cajaH = 34 * k;
  ctx.beginPath();
  ctx.roundRect(x0, y0, cajaW, cajaH, 5 * k);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = TINTA.primaria;
  ctx.fillRect(x0 + 10 * k, y0 + 22 * k, largo / 2, 5 * k);
  ctx.strokeStyle = TINTA.primaria;
  ctx.lineWidth = 1.2 * k;
  ctx.strokeRect(x0 + 10 * k, y0 + 22 * k, largo, 5 * k);
  ctx.font = `600 ${Math.round(11 * k)}px ${FUENTE}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText('0', x0 + 10 * k, y0 + 17 * k);
  ctx.textAlign = 'right';
  ctx.fillText(metros >= 1000 ? `${metros / 1000} km` : `${metros} m`, x0 + 10 * k + largo, y0 + 17 * k);
  // Flecha de norte
  const cx = W - 30 * k, cy = 36 * k;
  ctx.beginPath();
  ctx.arc(cx, cy, 22 * k, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(11,11,11,0.25)';
  ctx.lineWidth = 1 * k;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - 17 * k);
  ctx.lineTo(cx + 7 * k, cy + 4 * k);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx - 7 * k, cy + 4 * k);
  ctx.closePath();
  ctx.fillStyle = TINTA.primaria;
  ctx.fill();
  ctx.font = `700 ${Math.round(11 * k)}px ${FUENTE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(norte, cx, cy + 17 * k);
  ctx.restore();
}

/**
 * Compone el plano: fondo Google Maps (si existe) con marcadores, escala y norte.
 * `vista` define el centro y el zoom con que se descargó el fondo.
 */
export async function componerPlano(
  fondo: Blob | null,
  vista: { lat: number; lon: number; zoom: number; w: number; h: number; escala: number },
  marcadores: Marcador[],
): Promise<PlanoCompuesto> {
  const k = vista.escala;
  const W = vista.w * k, H = vista.h * k;
  const c = lienzo(W, H);
  const ctx = c.getContext('2d')!;
  let conFondo = false;
  if (fondo) {
    try {
      const img = await cargarImagen(fondo);
      ctx.drawImage(img, 0, 0, W, H);
      conFondo = true;
    } catch {
      conFondo = false;
    }
  }
  if (!conFondo) return componerCroquis(marcadores, vista.w, vista.h, k);

  const centro = pixelMundo(vista.lat, vista.lon, vista.zoom);
  const orden = [...marcadores].sort((a, b) => Number(!!a.principal) - Number(!!b.principal));
  for (const m of orden) {
    const p = pixelMundo(m.lat, m.lon, vista.zoom);
    const x = W / 2 + (p.x - centro.x) * k;
    const y = H / 2 + (p.y - centro.y) * k;
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    dibujarMarcador(ctx, x, y, m, k);
  }
  dibujarEscalaYNorte(ctx, W, H, metrosPorPixel(vista.lat, vista.zoom) / k, k, 'N');
  return { dataUrl: c.toDataURL('image/jpeg', 0.86), w: W, h: H, conFondo: true };
}

/** Croquis de localización sin fondo: cuadrícula EPSG:9377 con los daños a escala. */
export function componerCroquis(marcadores: Marcador[], w = MAPA_W, h = MAPA_H, k = MAPA_ESCALA): PlanoCompuesto {
  const W = w * k, H = h * k;
  const c = lienzo(W, H);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f4f3ef';
  ctx.fillRect(0, 0, W, H);
  if (!marcadores.length) {
    ctx.fillStyle = TINTA.tenue;
    ctx.font = `500 ${14 * k}px ${FUENTE}`;
    ctx.textAlign = 'center';
    ctx.fillText('Sin coordenadas', W / 2, H / 2);
    return { dataUrl: c.toDataURL('image/jpeg', 0.86), w: W, h: H, conFondo: false };
  }
  const pts = marcadores.map((m) => ({ m, ...aEpsg9377(m.lat, m.lon) }));
  const principal = pts.find((p) => p.m.principal);
  let cE: number, cN: number, mPorPx: number;
  if (principal && pts.length >= 1) {
    cE = principal.este;
    cN = principal.norte;
    mPorPx = 60 / W; // ventana de 60 m de ancho alrededor del daño
  } else {
    const minE = Math.min(...pts.map((p) => p.este)), maxE = Math.max(...pts.map((p) => p.este));
    const minN = Math.min(...pts.map((p) => p.norte)), maxN = Math.max(...pts.map((p) => p.norte));
    cE = (minE + maxE) / 2;
    cN = (minN + maxN) / 2;
    mPorPx = Math.max((maxE - minE) / (W * 0.78), (maxN - minN) / (H * 0.72), 40 / W);
  }
  const aX = (e: number) => W / 2 + (e - cE) / mPorPx;
  const aY = (n: number) => H / 2 - (n - cN) / mPorPx;

  // Cuadrícula con coordenadas
  const paso = escalaBonita(mPorPx * W * 0.24);
  ctx.strokeStyle = '#d5d3ca';
  ctx.lineWidth = 1 * k;
  ctx.fillStyle = TINTA.secundaria;
  ctx.font = `500 ${Math.round(10 * k)}px ${FUENTE}`;
  const e0 = cE - (W / 2) * mPorPx, e1 = cE + (W / 2) * mPorPx;
  const n0 = cN - (H / 2) * mPorPx, n1 = cN + (H / 2) * mPorPx;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (let e = Math.ceil(e0 / paso) * paso; e < e1; e += paso) {
    ctx.beginPath(); ctx.moveTo(aX(e), 0); ctx.lineTo(aX(e), H); ctx.stroke();
    if (aX(e) > 60 * k && aX(e) < W - 60 * k) ctx.fillText(`E ${Math.round(e).toLocaleString('es-CO')}`, aX(e), H - 6 * k);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let n = Math.ceil(n0 / paso) * paso; n < n1; n += paso) {
    ctx.beginPath(); ctx.moveTo(0, aY(n)); ctx.lineTo(W, aY(n)); ctx.stroke();
    if (aY(n) > 60 * k && aY(n) < H - 24 * k) ctx.fillText(`N ${Math.round(n).toLocaleString('es-CO')}`, 6 * k, aY(n) - 8 * k);
  }
  const orden = [...pts].sort((a, b) => Number(!!a.m.principal) - Number(!!b.m.principal));
  for (const p of orden) {
    const x = aX(p.este), y = aY(p.norte);
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    dibujarMarcador(ctx, x, y, p.m, k);
  }
  dibujarEscalaYNorte(ctx, W, H, mPorPx, k, 'N');
  ctx.fillStyle = TINTA.tenue;
  ctx.font = `500 ${Math.round(10 * k)}px ${FUENTE}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('Croquis sin fondo · cuadrícula EPSG:9377', W - 60 * k, 8 * k);
  return { dataUrl: c.toDataURL('image/jpeg', 0.86), w: W, h: H, conFondo: false };
}
