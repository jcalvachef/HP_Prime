/**
 * Operaciones del motor de conocimiento sobre los datos de la aplicación: aprender de un registro
 * clasificado, leer una fotografía nueva, incorporar registros anteriores y compartir la base.
 */
import {
  eliminarEjemplo,
  guardarEjemplos,
  guardarVector,
  listarEjemplos,
  listarTodosLosDanos,
  nuevoId,
  obtenerBlob,
  obtenerVector,
} from '../data/db';
import {
  MODELO_VISION,
  calibrar,
  leer,
  leerArchivoConocimiento,
  serializarConocimiento,
  type Calibracion,
  type EjemploConocimiento,
  type Lectura,
} from '../domain/conocimiento';
import { familiaDe } from '../domain/similitud';
import type { Dano } from '../domain/types';
import { entregarArchivo } from './plataforma';
import { incrustarFoto } from './vision';

/** Vector de rasgos de la fotografía de un registro; se calcula una vez y se guarda. */
export async function vectorDeFoto(fotoId: string): Promise<Float32Array | null> {
  const guardado = await obtenerVector(fotoId, MODELO_VISION);
  if (guardado) return guardado;
  const blob = await obtenerBlob(fotoId);
  if (!blob) return null;
  const v = await incrustarFoto(blob);
  if (v) await guardarVector(fotoId, MODELO_VISION, v);
  return v;
}

const estaAprendido = (e: EjemploConocimiento | undefined, d: Dano) =>
  !!e && e.codigo === d.tipo && e.fotoId === d.foto?.blobId && e.modelo === MODELO_VISION;

/**
 * Incorpora (o corrige) el ejemplo de un registro clasificado. Devuelve true si el motor cambió.
 * Un registro sin tipo o sin fotografía no enseña nada y se retira si estaba.
 */
export async function aprender(d: Dano): Promise<boolean> {
  const ejemplos = await listarEjemplos();
  const actual = ejemplos.find((e) => e.id === d.id);
  if (!d.tipo || !d.foto || !familiaDe(d.tipo)) {
    if (actual) await eliminarEjemplo(d.id);
    return !!actual;
  }
  if (estaAprendido(actual, d)) return false;
  const vector = await vectorDeFoto(d.foto.blobId);
  if (!vector) return false;
  await guardarEjemplos([{ id: d.id, codigo: d.tipo, vector, fotoId: d.foto.blobId, fecha: d.fechaHora, modelo: MODELO_VISION, origen: 'propio' }]);
  return true;
}

let calibracion: { de: EjemploConocimiento[]; cal: Calibracion } | null = null;

/** Lectura de la fotografía de un registro contra lo aprendido (sin contarse a sí mismo). */
export async function lecturaPara(d: Dano): Promise<(Lectura & { ejemplos: number }) | null> {
  if (!d.foto) return null;
  const vector = await vectorDeFoto(d.foto.blobId);
  if (!vector) return null;
  const todos = await listarEjemplos();
  // Los niveles de similitud de la base se calculan una vez por cada cambio de la base
  if (calibracion?.de !== todos) calibracion = { de: todos, cal: calibrar(todos.filter((e) => e.modelo === MODELO_VISION)) };
  const ejemplos = todos.filter((e) => e.modelo === MODELO_VISION);
  return { ...leer(vector, ejemplos, d.id, calibracion.cal), ejemplos: ejemplos.filter((e) => e.id !== d.id).length };
}

/** Registros clasificados y con fotografía que aún no están en el motor (o cambiaron desde entonces). */
export async function registrosPorIncorporar(): Promise<Dano[]> {
  const porId = new Map((await listarEjemplos()).map((e) => [e.id, e]));
  return (await listarTodosLosDanos()).filter((d) => d.tipo && d.foto && familiaDe(d.tipo) && !estaAprendido(porId.get(d.id), d));
}

export async function incorporar(registros: Dano[], alProgreso?: (hechos: number, total: number) => void): Promise<number> {
  let hechos = 0, aprendidos = 0;
  for (const d of registros) {
    if (await aprender(d)) aprendidos++;
    alProgreso?.(++hechos, registros.length);
  }
  return aprendidos;
}

export async function exportarConocimiento(): Promise<string> {
  const ejemplos = await listarEjemplos();
  if (!ejemplos.length) throw new Error('El motor de conocimiento aún no tiene ejemplos.');
  const blob = new Blob([JSON.stringify(serializarConocimiento(ejemplos))], { type: 'application/json' });
  const r = await entregarArchivo(blob, `Conocimiento_PaviFlex_${new Date().toISOString().slice(0, 10)}.json`, 'Base de conocimiento');
  return `${ejemplos.length} ejemplos exportados. ${r.mensaje}`;
}

/** Suma a la base los ejemplos de un archivo; los que ya existen (mismo id) no se duplican. */
export async function importarConocimiento(archivo: Blob): Promise<{ nuevos: number; repetidos: number }> {
  const recibidos = leerArchivoConocimiento(await archivo.text());
  const existentes = new Set((await listarEjemplos()).map((e) => e.id));
  const nuevos = recibidos.filter((e) => !existentes.has(e.id));
  await guardarEjemplos(nuevos.map((e) => ({ ...e, id: e.id || nuevoId() })));
  return { nuevos: nuevos.length, repetidos: recibidos.length - nuevos.length };
}
