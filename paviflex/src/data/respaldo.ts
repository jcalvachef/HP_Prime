/** Respaldo de un proyecto completo (datos + fotografías + mapas) en un archivo .zip, y su restauración. */
import JSZip from 'jszip';
import type { Dano, Proyecto, Sector } from '../domain/types';
import {
  guardarBlob,
  guardarDano,
  guardarProyecto,
  guardarSector,
  listarDanos,
  listarSectores,
  nuevoId,
  obtenerBlob,
  obtenerProyecto,
} from './db';

interface Manifiesto {
  formato: 'paviflex-respaldo';
  version: 1;
  exportado: string;
  proyecto: Proyecto;
  sectores: Sector[];
  danos: Dano[];
}

export async function exportarProyecto(proyectoId: string): Promise<{ blob: Blob; nombre: string }> {
  const proyecto = await obtenerProyecto(proyectoId);
  if (!proyecto) throw new Error('Proyecto no encontrado');
  const sectores = await listarSectores(proyectoId);
  const danos: Dano[] = [];
  for (const s of sectores) danos.push(...(await listarDanos(s.id)));
  const zip = new JSZip();
  const m: Manifiesto = { formato: 'paviflex-respaldo', version: 1, exportado: new Date().toISOString(), proyecto, sectores, danos };
  zip.file('proyecto.json', JSON.stringify(m, null, 1));
  for (const d of danos) {
    for (const id of [d.foto?.blobId, d.foto?.miniId, d.mapa?.blobId]) {
      if (!id) continue;
      const b = await obtenerBlob(id);
      if (b) zip.file(`binarios/${id}`, await b.arrayBuffer(), { comment: b.type });
    }
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/zip' });
  const limpio = proyecto.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40) || 'proyecto';
  return { blob, nombre: `Respaldo_PaviFlex_${limpio}_${new Date().toISOString().slice(0, 10)}.zip` };
}

/** Restaura un respaldo como un proyecto nuevo (no sobrescribe datos existentes). Devuelve el id creado. */
export async function importarProyecto(archivo: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await archivo.arrayBuffer());
  const txt = await zip.file('proyecto.json')?.async('string');
  if (!txt) throw new Error('El archivo no es un respaldo de PaviFlex.');
  const m = JSON.parse(txt) as Manifiesto;
  if (m.formato !== 'paviflex-respaldo') throw new Error('El archivo no es un respaldo de PaviFlex.');
  const idP = nuevoId();
  const mapaS = new Map<string, string>();
  await guardarProyecto({ ...m.proyecto, id: idP });
  for (const s of m.sectores) {
    const id = nuevoId();
    mapaS.set(s.id, id);
    await guardarSector({ ...s, id, proyectoId: idP });
  }
  const copiar = async (idViejo: string | undefined): Promise<string | null> => {
    if (!idViejo) return null;
    const f = zip.file(`binarios/${idViejo}`);
    if (!f) return null;
    const idNuevo = nuevoId();
    await guardarBlob(idNuevo, new Blob([await f.async('arraybuffer')], { type: f.comment || 'image/jpeg' }));
    return idNuevo;
  };
  for (const d of m.danos) {
    const sectorId = mapaS.get(d.sectorId);
    if (!sectorId) continue;
    const fotoId = await copiar(d.foto?.blobId);
    const miniId = await copiar(d.foto?.miniId);
    const mapaId = await copiar(d.mapa?.blobId);
    await guardarDano({
      ...d,
      id: nuevoId(),
      sectorId,
      proyectoId: idP,
      foto: d.foto && fotoId ? { ...d.foto, blobId: fotoId, miniId: miniId ?? fotoId } : null,
      mapa: d.mapa && mapaId ? { ...d.mapa, blobId: mapaId } : null,
    });
  }
  return idP;
}
