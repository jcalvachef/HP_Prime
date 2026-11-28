/** Arma y entrega los archivos KML/KMZ con los puntos de inspección de un proyecto o de un sector. */
import { listarDanos, listarSectores, obtenerBlob, obtenerProyecto, obtenerSector } from '../data/db';
import { fmtFechaHora } from '../domain/formato';
import type { Dano } from '../domain/types';
import { MIME_KML, contarPuntos, generarKml, generarKmz, nombreArchivoKml, type DatosKml } from '../report/kml';
import { fotoParaInforme } from './fotoAnotada';
import { dataUrlABytes, lienzo } from './imagen';
import { entregarArchivo } from './plataforma';

async function reunir(proyectoId: string, sectorId?: string): Promise<DatosKml & { soloSector?: boolean }> {
  const proyecto = await obtenerProyecto(proyectoId);
  if (!proyecto) throw new Error('Proyecto no encontrado.');
  const sectores = sectorId ? [await obtenerSector(sectorId)].filter((s) => !!s) : await listarSectores(proyectoId);
  return { proyecto, sectores: await Promise.all(sectores.map(async (sector) => ({ sector: sector!, danos: await listarDanos(sector!.id) }))) };
}

function icono(color: string): Promise<Uint8Array> {
  const c = lienzo(64, 64);
  const ctx = c.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(32, 32, 20, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  return Promise.resolve(dataUrlABytes(c.toDataURL('image/png')));
}

async function foto(d: Dano): Promise<Uint8Array | null> {
  if (!d.foto) return null;
  const blob = await obtenerBlob(d.foto.blobId);
  if (!blob) return null;
  const r = await fotoParaInforme(blob, d.medicion, `Foto ${d.numero} · ${fmtFechaHora(d.fechaHora)}`, 1000);
  return dataUrlABytes(r.dataUrl);
}

/**
 * Exporta los puntos de inspección. Devuelve el mensaje para el usuario.
 * `formato` 'kmz' incluye fotografías; 'kml' es solo el archivo de puntos y atributos.
 */
export async function exportarPuntos(
  formato: 'kml' | 'kmz',
  proyectoId: string,
  sectorId?: string,
  alProgreso?: (hechos: number, total: number) => void,
): Promise<string> {
  const datos = await reunir(proyectoId, sectorId);
  const { conPunto, sinCoordenadas } = contarPuntos(datos);
  if (!conPunto) throw new Error('No hay registros con coordenadas para exportar. Capture la posición de los daños.');
  const nombre = nombreArchivoKml(datos.proyecto, sectorId ? datos.sectores[0]?.sector : undefined);
  const blob = formato === 'kmz' ? await generarKmz(datos, foto, icono, alProgreso) : new Blob([generarKml(datos)], { type: MIME_KML });
  const r = await entregarArchivo(blob, `${nombre}.${formato}`, 'Puntos de inspección');
  return `${conPunto} puntos exportados${sinCoordenadas ? ` (${sinCoordenadas} registros sin coordenadas quedaron fuera)` : ''}. ${r.mensaje}`;
}
