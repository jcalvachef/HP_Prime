/**
 * Motor de conocimiento: el clasificador que la aplicación entrena con el trabajo del inspector.
 *
 * Cada fotografía se convierte en un vector de rasgos con un modelo de visión preentrenado
 * (MobileNet). Cada daño que el inspector clasifica entra a la base como ejemplo (vector + sigla).
 * Una fotografía nueva se clasifica por sus vecinos más cercanos en esa base: mientras más ejemplos
 * haya de un tipo de daño, mejor lo reconoce. No hay un paso de entrenamiento aparte: el modelo
 * aprende en el momento en que se confirma cada registro, y puede autoevaluarse en cualquier
 * momento dejando por fuera un ejemplo a la vez.
 */
import { FAMILIAS, familiaDe } from './similitud';

/** Identificador del extractor de rasgos; los vectores de modelos distintos no son comparables. */
export const MODELO_VISION = 'mobilenet_v1_0.50_224';
export const DIM_VECTOR = 512;

export interface EjemploConocimiento {
  /** Id del registro de daño del que proviene, o un id propio si fue importado */
  id: string;
  codigo: string;
  vector: Float32Array;
  /** Fotografía de la que se calculó el vector (para detectar que el registro cambió de foto) */
  fotoId?: string;
  fecha: string;
  modelo: string;
  origen: 'propio' | 'importado';
}

/** Producto punto; los vectores están normalizados, así que es la similitud coseno. */
export function similitud(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function normalizar(v: Float32Array | number[]): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

const K = 7;
/** Qué tan rápido pierde peso un vecino al alejarse del más parecido. */
const TEMPERATURA = 0.05;

/**
 * Niveles de similitud de una base de ejemplos. Las fotografías de un mismo inspector comparten
 * asfalto, regla y cámara, así que dos daños de tipo distinto ya se parecen bastante (0,65 a 0,85
 * en las pruebas) y dos del mismo tipo, mucho (0,94 a 0,98). La confianza de una lectura se mide
 * entre esos dos niveles, estimados con los propios ejemplos.
 */
export interface Calibracion {
  /** Similitud típica entre daños de tipo distinto (más una desviación): por debajo, no cuenta */
  fondo: number;
  /** Similitud típica con el ejemplo más cercano del mismo tipo: desde aquí, cuenta del todo */
  propio: number;
}

/** Niveles supuestos mientras la base no tiene ejemplos suficientes para estimarlos. */
const CALIBRACION_INICIAL: Calibracion = { fondo: 0.83, propio: 0.95 };
const MUESTRA_CALIBRACION = 300;

export function calibrar(ejemplos: EjemploConocimiento[]): Calibracion {
  const m = ejemplos.slice(-MUESTRA_CALIBRACION);
  let sumaD = 0, suma2D = 0, nD = 0, sumaP = 0, nP = 0;
  for (let i = 0; i < m.length; i++) {
    let mejorPropio = -1;
    for (let j = 0; j < m.length; j++) {
      if (i === j || m[i].vector.length !== m[j].vector.length) continue;
      const sim = similitud(m[i].vector, m[j].vector);
      if (m[i].codigo === m[j].codigo) {
        if (sim > mejorPropio) mejorPropio = sim;
      } else if (j > i) {
        sumaD += sim;
        suma2D += sim * sim;
        nD++;
      }
    }
    if (mejorPropio >= 0) {
      sumaP += mejorPropio;
      nP++;
    }
  }
  let { fondo, propio } = CALIBRACION_INICIAL;
  if (nD >= 3) {
    const media = sumaD / nD;
    fondo = media + Math.sqrt(Math.max(0, suma2D / nD - media * media));
  }
  if (nP >= 3) propio = sumaP / nP;
  // Los dos niveles deben quedar separados para que la confianza tenga sentido
  fondo = Math.min(fondo, 0.97);
  return { fondo, propio: Math.max(propio, fondo + 0.03) };
}

export interface Lectura {
  /** Voto de cada sigla entre los vecinos más cercanos (suman 1) */
  votos: Map<string, number>;
  /** 0 a 1: cuánto se parece la fotografía a algo ya visto, frente a lo que se parecen entre sí daños distintos */
  confianza: number;
  /** Similitud con el ejemplo más parecido */
  mejorSimilitud: number;
}

/**
 * Lectura de una fotografía contra la base de ejemplos. `excluir` omite un ejemplo (autoevaluación).
 * `cal` son los niveles de la base; si no se pasan, se usan los iniciales.
 */
export function leer(vector: Float32Array, ejemplos: EjemploConocimiento[], excluir?: string, cal: Calibracion = CALIBRACION_INICIAL): Lectura {
  const cercanos: { codigo: string; sim: number }[] = [];
  for (const e of ejemplos) {
    if (e.id === excluir || e.vector.length !== vector.length) continue;
    const sim = similitud(vector, e.vector);
    if (cercanos.length < K) cercanos.push({ codigo: e.codigo, sim });
    else {
      let peor = 0;
      for (let i = 1; i < K; i++) if (cercanos[i].sim < cercanos[peor].sim) peor = i;
      if (sim > cercanos[peor].sim) cercanos[peor] = { codigo: e.codigo, sim };
    }
  }
  const votos = new Map<string, number>();
  if (!cercanos.length) return { votos, confianza: 0, mejorSimilitud: 0 };
  const mejor = Math.max(...cercanos.map((c) => c.sim));
  let total = 0;
  for (const c of cercanos) {
    const w = Math.exp((c.sim - mejor) / TEMPERATURA);
    votos.set(c.codigo, (votos.get(c.codigo) ?? 0) + w);
    total += w;
  }
  for (const [k, v] of votos) votos.set(k, v / total);
  const confianza = Math.max(0, Math.min(1, (mejor - cal.fondo) / (cal.propio - cal.fondo)));
  return { votos, confianza, mejorSimilitud: mejor };
}

export interface Autoevaluacion {
  /** Ejemplos evaluados (los de tipos con un solo ejemplo no se pueden evaluar) */
  evaluados: number;
  /** La sigla correcta fue la primera */
  siglaPrimera: number;
  /** La familia correcta quedó entre las tres sugerencias */
  familiaEntreTres: number;
}

/** Tres familias distintas, de más a menos votadas. */
function tresFamilias(votos: Map<string, number>): string[] {
  const orden = [...votos.entries()].sort((a, b) => b[1] - a[1]);
  const fams: string[] = [];
  for (const [codigo] of orden) {
    const f = familiaDe(codigo)?.id ?? codigo;
    if (!fams.includes(f)) fams.push(f);
    if (fams.length === 3) break;
  }
  return fams;
}

/**
 * Autoevaluación dejando un ejemplo por fuera a la vez: mide con los propios datos del inspector
 * qué tan seguido el motor habría acertado. Solo cuenta lo aprendido, sin las reglas de respaldo.
 */
export function autoevaluar(ejemplos: EjemploConocimiento[]): Autoevaluacion {
  const porCodigo = new Map<string, number>();
  for (const e of ejemplos) porCodigo.set(e.codigo, (porCodigo.get(e.codigo) ?? 0) + 1);
  const r: Autoevaluacion = { evaluados: 0, siglaPrimera: 0, familiaEntreTres: 0 };
  for (const e of ejemplos) {
    if ((porCodigo.get(e.codigo) ?? 0) < 2) continue;
    const { votos } = leer(e.vector, ejemplos, e.id);
    if (!votos.size) continue;
    r.evaluados++;
    const primera = [...votos.entries()].sort((a, b) => b[1] - a[1])[0][0];
    if (primera === e.codigo) r.siglaPrimera++;
    if (tresFamilias(votos).includes(familiaDe(e.codigo)?.id ?? e.codigo)) r.familiaEntreTres++;
  }
  return r;
}

/** Número de ejemplos por sigla, en el orden del catálogo de familias. */
export function conteoPorCodigo(ejemplos: EjemploConocimiento[]): { codigo: string; n: number }[] {
  const m = new Map<string, number>();
  for (const e of ejemplos) m.set(e.codigo, (m.get(e.codigo) ?? 0) + 1);
  return FAMILIAS.flatMap((f) => f.codigos).filter((c) => m.has(c)).map((codigo) => ({ codigo, n: m.get(codigo)! }));
}

// ── Intercambio de la base de conocimiento entre dispositivos ──

export interface ArchivoConocimiento {
  formato: 'paviflex-conocimiento';
  version: 1;
  modelo: string;
  dimension: number;
  exportado: string;
  ejemplos: { id: string; codigo: string; fecha: string; vector: string }[];
}

function aBase64(v: Float32Array): string {
  const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}
/** Vector desde base64; null si el texto está dañado. */
function deBase64(t: string): Float32Array | null {
  try {
    const s = atob(t);
    if (s.length % 4) return null;
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return new Float32Array(b.buffer);
  } catch {
    return null;
  }
}

export function serializarConocimiento(ejemplos: EjemploConocimiento[]): ArchivoConocimiento {
  return {
    formato: 'paviflex-conocimiento',
    version: 1,
    modelo: MODELO_VISION,
    dimension: DIM_VECTOR,
    exportado: new Date().toISOString(),
    ejemplos: ejemplos.filter((e) => e.modelo === MODELO_VISION).map((e) => ({ id: e.id, codigo: e.codigo, fecha: e.fecha, vector: aBase64(e.vector) })),
  };
}

/** Ejemplos de un archivo de conocimiento. Lanza un error descriptivo si el archivo no sirve. */
export function leerArchivoConocimiento(texto: string): EjemploConocimiento[] {
  let a: ArchivoConocimiento;
  try {
    a = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es una base de conocimiento de PaviFlex.');
  }
  if (a?.formato !== 'paviflex-conocimiento' || !Array.isArray(a.ejemplos)) throw new Error('El archivo no es una base de conocimiento de PaviFlex.');
  if (a.modelo !== MODELO_VISION) throw new Error(`La base se creó con otro modelo de visión (${a.modelo}) y no es compatible con esta versión.`);
  const res: EjemploConocimiento[] = [];
  for (const e of a.ejemplos) {
    if (!e?.id || !familiaDe(e.codigo) || typeof e.vector !== 'string') continue;
    const vector = deBase64(e.vector);
    if (!vector || vector.length !== DIM_VECTOR || !vector.every((x) => Number.isFinite(x))) continue;
    res.push({ id: e.id, codigo: e.codigo, vector, fecha: e.fecha || '', modelo: MODELO_VISION, origen: 'importado' });
  }
  return res;
}
