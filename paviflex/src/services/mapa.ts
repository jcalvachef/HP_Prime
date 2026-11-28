/**
 * Vista en planta del daño sobre un mapa base y composición del plano: marcador numerado, flecha
 * de norte y barra de escala. El mapa base se arma con teselas de un proveedor que no requiere
 * clave (imagen satelital, callejero, topográfico o un servicio propio); Google Maps queda como
 * opción para quien tenga clave de API. Sin conexión se dibuja un croquis con cuadrícula EPSG:9377.
 */
import { CapacitorHttp } from '@capacitor/core';
import type { Ajustes, MapaDano, TipoMapa } from '../domain/types';
import { aEpsg9377, metrosPorPixel, pixelMundo } from '../domain/geo';
import {
  ID_GOOGLE,
  ID_NINGUNO,
  ID_PERSONALIZADO,
  PROVEEDORES,
  errorPlantilla,
  planTeselas,
  proveedorPersonalizado,
  urlTesela,
  type ProveedorMapa,
  type Tesela,
} from '../domain/teselas';
import { base64ABlob, cargarImagen, lienzo, lienzoABlob } from './imagen';
import { esNativo } from './plataforma';
import { TINTA } from '../ui/colores';

export const MAPA_W = 600;
export const MAPA_H = 450;
export const MAPA_ESCALA = 2;
const FUENTE = '"Roboto", "Helvetica Neue", Arial, sans-serif';

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

type AjustesMapa = Pick<Ajustes, 'proveedorMapa' | 'plantillaXYZ' | 'atribucionXYZ' | 'claveGoogleMaps' | 'tipoMapa' | 'zoomMapa'>;

/** Proveedor de teselas configurado, o null si la configuración usa Google, ninguno o es inválida. */
export function proveedorTeselas(aj: AjustesMapa): ProveedorMapa | null {
  if (aj.proveedorMapa === ID_PERSONALIZADO) return errorPlantilla(aj.plantillaXYZ) ? null : proveedorPersonalizado(aj.plantillaXYZ, aj.atribucionXYZ);
  return PROVEEDORES.find((p) => p.id === aj.proveedorMapa) ?? null;
}

export function nombreProveedor(aj: AjustesMapa): string {
  if (aj.proveedorMapa === ID_GOOGLE) return 'Google Maps';
  if (aj.proveedorMapa === ID_NINGUNO) return 'Sin mapa base';
  if (aj.proveedorMapa === ID_PERSONALIZADO) return 'Servicio de teselas propio';
  return PROVEEDORES.find((p) => p.id === aj.proveedorMapa)?.nombre ?? 'Mapa base';
}

/** Motivo por el cual no se puede descargar el mapa base con los ajustes actuales; null si se puede. */
export function impedimentoMapa(aj: AjustesMapa): string | null {
  if (aj.proveedorMapa === ID_NINGUNO) return 'En Ajustes está elegido «Sin mapa base»: el plano se presenta como croquis con cuadrícula.';
  if (aj.proveedorMapa === ID_GOOGLE) return aj.claveGoogleMaps.trim() ? null : 'Google Maps requiere una clave de API. Escríbala en Ajustes o elija otro mapa base.';
  if (aj.proveedorMapa === ID_PERSONALIZADO) return errorPlantilla(aj.plantillaXYZ);
  return proveedorTeselas(aj) ? null : 'El mapa base elegido ya no está disponible; elija otro en Ajustes.';
}

// ───────────── Descarga de imágenes ─────────────

const AGENTE = 'PaviFlex/1.3 (co.calvache.paviflex)';

type Descarga = { blob: Blob | null; estado: number; cuerpo: string };

/**
 * Descarga una imagen. Devuelve blob nulo si el servidor responde que no existe; lanza si no hay red.
 * En Android se intenta primero la petición nativa (no depende de CORS y permite identificar la
 * aplicación ante el servidor); si esa vía falla se usa la del navegador integrado.
 */
async function descargarImagen(url: string): Promise<Descarga> {
  if (esNativo) {
    try {
      const r = await CapacitorHttp.get({ url, responseType: 'blob', headers: { 'User-Agent': AGENTE } });
      const tipo = String(r.headers['Content-Type'] ?? r.headers['content-type'] ?? '');
      if (r.status === 200 && tipo.startsWith('image/') && typeof r.data === 'string' && r.data.length > 0)
        return { blob: base64ABlob(r.data.replace(/\s/g, ''), tipo.split(';')[0]), estado: 200, cuerpo: '' };
      if (r.status >= 400 && r.status < 500) return { blob: null, estado: r.status, cuerpo: '' };
    } catch {
      // se intenta con el navegador integrado
    }
  }
  const r = await fetch(url);
  if (!r.ok) return { blob: null, estado: r.status, cuerpo: await r.text().catch(() => '') };
  const b = await r.blob();
  return { blob: b.type.startsWith('image/') ? b : null, estado: r.status, cuerpo: '' };
}

function mensajeGoogle(estado: number, cuerpo: string): string {
  if (estado === 403) return 'Google Maps rechazó la clave de API (403). Verifique la clave y que "Maps Static API" esté habilitada con facturación activa.';
  if (estado === 400) return 'Solicitud de mapa inválida (400).';
  if (estado === 429) return 'Se superó la cuota de Google Maps (429).';
  return `No se pudo descargar el mapa (${estado}). ${cuerpo.slice(0, 120)}`;
}

// ───────────── Mosaico de teselas ─────────────

/**
 * Esri responde con una tesela gris uniforme ("Map data not yet available", gris 205) donde no
 * tiene imagen a ese nivel de detalle. Se reconoce por ser gris neutro casi sin variación; en ese
 * caso se usa la tesela del nivel anterior, que cubre la misma zona con menos detalle.
 * Solo se aplica a los proveedores marcados con `marcaSinDatos`: un callejero claro y vacío
 * tendría un aspecto parecido y es un dato válido.
 */
function esTeselaSinDatos(img: HTMLImageElement): boolean {
  const n = 16;
  const c = lienzo(n, n);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, n, n);
  const d = ctx.getImageData(0, 0, n, n).data;
  let suma = 0, suma2 = 0, color = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] + d[i + 1] + d[i + 2]) / 3;
    suma += g;
    suma2 += g * g;
    color = Math.max(color, Math.abs(d[i] - d[i + 1]), Math.abs(d[i + 1] - d[i + 2]));
  }
  const m = suma / (n * n);
  const desv = Math.sqrt(Math.max(0, suma2 / (n * n) - m * m));
  return color <= 4 && desv < 5 && m > 197 && m < 212;
}

const NIVELES_RESPALDO = 3;
const SIMULTANEAS = 4;

/** Compone el mapa base a partir de teselas y devuelve la imagen con la atribución impresa. */
async function mosaico(lat: number, lon: number, zoom: number, prov: ProveedorMapa): Promise<Blob> {
  const plan = planTeselas(lat, lon, zoom, MAPA_W, MAPA_H, MAPA_ESCALA, prov);
  const c = lienzo(plan.ancho, plan.alto);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e5e3df';
  ctx.fillRect(0, 0, plan.ancho, plan.alto);
  ctx.imageSmoothingQuality = 'high';

  // Las teselas vecinas comparten las de niveles anteriores: se descargan una sola vez
  const cache = new Map<string, Promise<HTMLImageElement | null>>();
  let erroresRed = 0;
  const obtener = (plantilla: string, validar: boolean, z: number, x: number, y: number): Promise<HTMLImageElement | null> => {
    const url = urlTesela(prov, z, x, y, plantilla);
    let p = cache.get(url);
    if (!p) {
      p = (async () => {
        try {
          const r = await descargarImagen(url);
          if (!r.blob) return null;
          const img = await cargarImagen(r.blob);
          return validar && prov.marcaSinDatos && esTeselaSinDatos(img) ? null : img;
        } catch {
          erroresRed++;
          return null;
        }
      })();
      cache.set(url, p);
    }
    return p;
  };
  /** Dibuja en el destino de `t` la parte que le corresponde de la tesela de `k` niveles atrás. */
  const dibujar = (img: HTMLImageElement, t: Tesela, k: number) => {
    const sw = img.naturalWidth / (1 << k), sh = img.naturalHeight / (1 << k);
    const mascara = (1 << k) - 1;
    ctx.drawImage(img, (t.x & mascara) * sw, (t.y & mascara) * sh, sw, sh, t.dx, t.dy, t.dw, t.dh);
  };

  let dibujadas = 0;
  // Si el servidor no tiene el nivel pedido en esta zona, las teselas siguientes empiezan
  // directamente en el nivel anterior en vez de volver a pedir el que falta.
  let nivelInicial = 0;
  const sinDato = new Array(NIVELES_RESPALDO + 1).fill(0);
  const usadas: { t: Tesela; k: number }[] = [];
  const pendientes = [...plan.teselas];
  const trabajador = async () => {
    for (let t = pendientes.shift(); t; t = pendientes.shift()) {
      for (let k = nivelInicial; k <= NIVELES_RESPALDO && t.z - k >= 0; k++) {
        const img = await obtener(prov.plantilla, true, t.z - k, t.x >> k, t.y >> k);
        if (!img) {
          if (++sinDato[k] >= 2 && k === nivelInicial && k < NIVELES_RESPALDO && !erroresRed) nivelInicial = k + 1;
          continue;
        }
        dibujar(img, t, k);
        usadas.push({ t, k });
        dibujadas++;
        break;
      }
    }
  };
  await Promise.all(Array.from({ length: SIMULTANEAS }, trabajador));

  if (dibujadas === 0)
    throw new Error(erroresRed ? 'Sin conexión a Internet para descargar el mapa base.' : `El proveedor del mapa base no entregó imágenes para esta zona (${prov.nombre}).`);
  if (dibujadas < plan.teselas.length * 0.6) throw new Error('El mapa base se descargó incompleto. Intente de nuevo con mejor conexión.');

  // Capa superpuesta (vías y nombres), al mismo nivel que se usó en cada tesela; si falla, se omite
  if (prov.superpuesta) {
    const cola = [...usadas];
    const superponer = async () => {
      for (let u = cola.shift(); u; u = cola.shift()) {
        const img = await obtener(prov.superpuesta!, false, u.t.z - u.k, u.t.x >> u.k, u.t.y >> u.k);
        if (img) dibujar(img, u.t, u.k);
      }
    };
    await Promise.all(Array.from({ length: SIMULTANEAS }, superponer));
  }

  if (prov.atribucion) {
    const k = MAPA_ESCALA;
    ctx.font = `500 ${9 * k}px ${FUENTE}`;
    const texto = prov.atribucion.length > 90 ? prov.atribucion.slice(0, 89) + '…' : prov.atribucion;
    const wt = ctx.measureText(texto).width + 10 * k;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillRect(plan.ancho - wt, plan.alto - 15 * k, wt, 15 * k);
    ctx.fillStyle = '#262626';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, plan.ancho - 5 * k, plan.alto - 7 * k);
  }
  return lienzoABlob(c, 'image/jpeg', 0.86);
}

/**
 * Descarga el mapa base centrado en la posición con el proveedor configurado.
 * Lanza un error descriptivo si no se puede (sin conexión, configuración incompleta…).
 */
export async function descargarMapa(lat: number, lon: number, aj: AjustesMapa, zoom?: number): Promise<{ blob: Blob; meta: Omit<MapaDano, 'blobId'> }> {
  const impedimento = impedimentoMapa(aj);
  if (impedimento) throw new Error(impedimento);
  const z = zoom ?? aj.zoomMapa;
  const meta = { zoom: z, tipo: aj.tipoMapa, w: MAPA_W, h: MAPA_H, escala: MAPA_ESCALA, lat, lon, proveedor: aj.proveedorMapa };
  if (aj.proveedorMapa === ID_GOOGLE) {
    let r: Descarga;
    try {
      r = await descargarImagen(urlMapaEstatico(lat, lon, z, aj.tipoMapa, aj.claveGoogleMaps.trim()));
    } catch {
      throw new Error('Sin conexión a Internet para descargar el mapa.');
    }
    if (!r.blob) throw new Error(mensajeGoogle(r.estado, r.cuerpo));
    return { blob: r.blob, meta };
  }
  return { blob: await mosaico(lat, lon, z, proveedorTeselas(aj)!), meta };
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
  /** true si lleva mapa base; false si es el croquis de respaldo */
  conFondo: boolean;
}

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
  // Barra de escala (arriba a la izquierda: las esquinas inferiores son de la atribución del mapa)
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
 * Compone el plano: mapa base (si existe) con marcadores, escala y norte.
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
  ctx.fillText('Croquis sin mapa base · cuadrícula EPSG:9377', W - 60 * k, 8 * k);
  return { dataUrl: c.toDataURL('image/jpeg', 0.86), w: W, h: H, conFondo: false };
}
