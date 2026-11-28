/**
 * Figuras del manual (fotografía y esquema de cada tipo de daño) e interpretación de la
 * fotografía tomada: descriptor de la imagen y sugerencias de tipo.
 */
import datosFiguras from '../assets/manual/figuras.json';
import { listarEjemplosPropios, modificarDano, obtenerBlob } from '../data/db';
import { FIGURA_DE, type FiguraManual } from '../domain/figuras';
import { DIM, describir, sugerir, type Sugerencia } from '../domain/similitud';
import type { Dano } from '../domain/types';
import { cargarImagen, lienzo } from './imagen';

const urls = import.meta.glob('../assets/manual/fig*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const figuras = new Map((datosFiguras as FiguraManual[]).map((f) => [f.num, f]));

export interface FiguraDeTipo extends FiguraManual {
  url: string;
}

/** Figura del manual que ilustra el tipo de daño. */
export function figuraDe(codigo: string): FiguraDeTipo | null {
  const num = FIGURA_DE[codigo];
  const f = num ? figuras.get(num) : undefined;
  const url = urls[`../assets/manual/fig${String(num).padStart(2, '0')}.jpg`];
  return f && url ? { ...f, url } : null;
}

/** Calcula el descriptor de una fotografía. */
export async function describirFoto(foto: Blob): Promise<number[]> {
  const img = await cargarImagen(foto);
  const f = Math.min(1, 512 / img.naturalWidth);
  const c = lienzo(img.naturalWidth * f, img.naturalHeight * f);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return describir(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
}

/**
 * Sugerencias de tipo para el registro: la más probable y dos alternativas. Calcula y guarda el
 * descriptor de la fotografía si aún no lo tiene, y usa como ejemplos los demás registros que el
 * inspector ya clasificó.
 */
export async function sugerenciasPara(d: Dano): Promise<Sugerencia[]> {
  if (!d.foto) return [];
  let descriptor = d.descriptor?.length === DIM && d.descriptorFoto === d.foto.blobId ? d.descriptor : null;
  if (!descriptor) {
    const blob = await obtenerBlob(d.foto.blobId);
    if (!blob) return [];
    descriptor = await describirFoto(blob);
    const blobId = d.foto.blobId;
    await modificarDano(d.id, (actual) => (actual.foto?.blobId === blobId ? { descriptor: descriptor!, descriptorFoto: blobId } : {}));
  }
  return sugerir(descriptor, await listarEjemplosPropios(d.id));
}
