/**
 * Almacenamiento local (IndexedDB). Los datos permanecen en el dispositivo:
 * proyectos, sectores, registros de daño y los binarios (fotografías y mapas).
 */
import { openDB, type IDBPDatabase } from 'idb';
import { descripcionAutomatica } from '../domain/formato';
import { AJUSTES_POR_DEFECTO, type Ajustes, type Dano, type Proyecto, type Sector } from '../domain/types';

const NOMBRE_BD = 'paviflex';
let promesa: Promise<IDBPDatabase> | null = null;

function bd(): Promise<IDBPDatabase> {
  if (!promesa) {
    promesa = openDB(NOMBRE_BD, 1, {
      upgrade(db) {
        db.createObjectStore('proyectos', { keyPath: 'id' });
        const s = db.createObjectStore('sectores', { keyPath: 'id' });
        s.createIndex('proyectoId', 'proyectoId');
        const d = db.createObjectStore('danos', { keyPath: 'id' });
        d.createIndex('sectorId', 'sectorId');
        d.createIndex('proyectoId', 'proyectoId');
        db.createObjectStore('blobs');
        db.createObjectStore('kv');
      },
    });
    void navigator.storage?.persist?.().catch(() => false);
  }
  return promesa;
}

export function nuevoId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ── Proyectos ──
export async function listarProyectos(): Promise<Proyecto[]> {
  const todos = (await (await bd()).getAll('proyectos')) as Proyecto[];
  return todos.sort((a, b) => b.actualizado.localeCompare(a.actualizado));
}
export async function obtenerProyecto(id: string): Promise<Proyecto | undefined> {
  return (await bd()).get('proyectos', id);
}
export async function guardarProyecto(p: Proyecto): Promise<void> {
  await (await bd()).put('proyectos', { ...p, actualizado: new Date().toISOString() });
}
export async function eliminarProyecto(id: string): Promise<void> {
  for (const s of await listarSectores(id)) await eliminarSector(s.id);
  await (await bd()).delete('proyectos', id);
}

// ── Sectores ──
export async function listarSectores(proyectoId: string): Promise<Sector[]> {
  const todos = (await (await bd()).getAllFromIndex('sectores', 'proyectoId', proyectoId)) as Sector[];
  return todos.sort((a, b) => a.prInicial - b.prInicial || a.creado.localeCompare(b.creado));
}
export async function obtenerSector(id: string): Promise<Sector | undefined> {
  return (await bd()).get('sectores', id);
}
export async function guardarSector(s: Sector): Promise<void> {
  await (await bd()).put('sectores', s);
}
export async function eliminarSector(id: string): Promise<void> {
  for (const d of await listarDanos(id)) await eliminarDano(d.id);
  await (await bd()).delete('sectores', id);
}

// ── Daños ──
export async function listarDanos(sectorId: string): Promise<Dano[]> {
  const todos = (await (await bd()).getAllFromIndex('danos', 'sectorId', sectorId)) as Dano[];
  return todos.sort((a, b) => a.numero - b.numero);
}
export async function contarDanosProyecto(proyectoId: string): Promise<number> {
  return (await bd()).countFromIndex('danos', 'proyectoId', proyectoId);
}
export async function obtenerDano(id: string): Promise<Dano | undefined> {
  return (await bd()).get('danos', id);
}
export async function guardarDano(d: Dano): Promise<void> {
  await (await bd()).put('danos', d);
  avisarCambio(d);
}

const oyentesDano = new Map<string, Set<(d: Dano) => void>>();
function avisarCambio(d: Dano) {
  oyentesDano.get(d.id)?.forEach((f) => f(d));
}
/** Avisa cada vez que cambia el registro (desde cualquier pantalla o tarea en segundo plano). */
export function suscribirDano(id: string, alCambiar: (d: Dano) => void): () => void {
  const grupo = oyentesDano.get(id) ?? new Set();
  grupo.add(alCambiar);
  oyentesDano.set(id, grupo);
  return () => {
    grupo.delete(alCambiar);
  };
}

/**
 * Aplica un cambio parcial al registro leyendo su estado actual dentro de una misma transacción.
 * Así varias fuentes (el formulario, la medición, el GPS y la descarga del mapa, que terminan en
 * momentos distintos) no se pisan entre sí. Devuelve el registro resultante, o undefined si ya
 * no existe.
 */
export async function modificarDano(id: string, cambio: Partial<Dano> | ((actual: Dano) => Partial<Dano>)): Promise<Dano | undefined> {
  const tx = (await bd()).transaction('danos', 'readwrite');
  const actual = (await tx.store.get(id)) as Dano | undefined;
  if (!actual) {
    await tx.done;
    return undefined;
  }
  let n: Dano = { ...actual, ...(typeof cambio === 'function' ? cambio(actual) : cambio), id };
  if (n.descripcionAuto) n = { ...n, descripcion: descripcionAutomatica(n) };
  await tx.store.put(n);
  await tx.done;
  avisarCambio(n);
  return n;
}
export async function eliminarDano(id: string): Promise<void> {
  const db = await bd();
  const d = (await db.get('danos', id)) as Dano | undefined;
  if (d?.foto) {
    await db.delete('blobs', d.foto.blobId);
    await db.delete('blobs', d.foto.miniId);
  }
  if (d?.mapa) await db.delete('blobs', d.mapa.blobId);
  await db.delete('danos', id);
}
export async function siguienteNumero(sectorId: string): Promise<number> {
  const ds = await listarDanos(sectorId);
  return ds.reduce((m, d) => Math.max(m, d.numero), 0) + 1;
}

// ── Binarios ──
// Se guardan como ArrayBuffer + tipo MIME: es el formato más robusto en los WebView de Android.
interface BlobGuardado {
  tipo: string;
  datos: ArrayBuffer;
}
export async function guardarBlob(id: string, blob: Blob): Promise<void> {
  const reg: BlobGuardado = { tipo: blob.type || 'application/octet-stream', datos: await blob.arrayBuffer() };
  await (await bd()).put('blobs', reg, id);
}
export async function obtenerBlob(id: string): Promise<Blob | undefined> {
  const reg = (await (await bd()).get('blobs', id)) as BlobGuardado | undefined;
  return reg ? new Blob([reg.datos], { type: reg.tipo }) : undefined;
}
export async function eliminarBlob(id: string): Promise<void> {
  await (await bd()).delete('blobs', id);
}

// ── Ajustes ──
export async function leerAjustes(): Promise<Ajustes> {
  const a = (await (await bd()).get('kv', 'ajustes')) as Partial<Ajustes> | undefined;
  return { ...AJUSTES_POR_DEFECTO, ...(a ?? {}) };
}
export async function guardarAjustes(a: Ajustes): Promise<void> {
  await (await bd()).put('kv', a, 'ajustes');
}
