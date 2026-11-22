/**
 * Procesamiento y análisis de los datos de campo (capítulo 3 del manual):
 * agrupación por tipo de deterioro, severidad y tramo de 100 m; porcentajes de afectación.
 */
import type { Dano, Sector, Severidad } from './types';
import { siglaRegistro, tipoDano, TIPOS_DANO } from './catalogo';
import { fmtPR, magnitud } from './formato';

export type Grupo = 'carriles' | 'superficiales' | 'bermas';

export const TITULO_GRUPO: Record<Grupo, string> = {
  carriles: 'Daños en los carriles',
  superficiales: 'Daños superficiales',
  bermas: 'Daños en bermas',
};

export interface Tramo {
  id: string;
  desde: number;
  hasta: number;
  longitud: number;
  /** Área de calzada (sin bermas) del tramo, m² */
  areaCalzada: number;
  /** Área de bermas construidas del tramo, m² */
  areaBermas: number;
}

export interface Columna {
  /** Sigla de registro (incluye sufijo B en bermas) */
  sigla: string;
  nombre: string;
  sev: Severidad | null;
  clave: string;
}

export interface AnalisisGrupo {
  grupo: Grupo;
  titulo: string;
  tramos: Tramo[];
  /** Área de referencia de cada tramo para el porcentaje (calzada o bermas) */
  areaRefTramo: number[];
  areaRefTotal: number;
  columnas: Columna[];
  /** matriz[tramo][columna] = área afectada (m²) */
  matriz: number[][];
  totalTramo: number[];
  pctTramo: number[];
  totalColumna: number[];
  /** Totales por tipo de daño (todas las severidades) */
  totalTipo: { sigla: string; nombre: string; area: number; pct: number }[];
  areaAfectada: number;
  pctAfectacion: number;
  numRegistros: number;
}

export interface DanoLineal {
  sigla: string;
  nombre: string;
  sev: Severidad | null;
  longitud: number;
  cantidad: number;
  unidad: 'm' | 'n';
}

export interface AnalisisSector {
  tramos: Tramo[];
  anchoCalzada: number;
  longitud: number;
  areaInspeccionada: number;
  areaBermas: number;
  grupos: Record<Grupo, AnalisisGrupo>;
  /** Daños medidos solo en longitud o en número de veces (CVB, SB, AFA, AFI) */
  lineales: DanoLineal[];
  advertencias: string[];
}

export function anchoCalzada(s: Sector): number {
  return Math.max(0, s.totalCarriles) * Math.max(0, s.anchoCarril);
}

/**
 * Tramos de análisis en abscisas cerradas (múltiplos de la longitud de tramo). Los remanentes
 * inicial y final menores que un tramo se unen al tramo vecino, como en el ejemplo del manual
 * (T1: PR64+250 a PR64+400; T29: PR67+100 a PR67+230).
 */
export function calcularTramos(s: Sector): Tramo[] {
  const L = s.longitudTramo > 0 ? s.longitudTramo : 100;
  const ini = Math.min(s.prInicial, s.prFinal);
  const fin = Math.max(s.prInicial, s.prFinal);
  if (!(fin > ini)) return [];
  const cortes: number[] = [];
  for (let x = Math.ceil((ini + 1e-6) / L) * L; x < fin - 1e-6; x += L) cortes.push(x);
  if (cortes.length && cortes[0] - ini < L - 1e-6) cortes.shift();
  if (cortes.length && fin - cortes[cortes.length - 1] < L - 1e-6) cortes.pop();
  const limites = [ini, ...cortes, fin];
  const ac = anchoCalzada(s);
  const ab = Math.max(0, s.anchoBerma) * Math.max(0, s.numBermas);
  const tramos: Tramo[] = [];
  for (let i = 0; i < limites.length - 1; i++) {
    const longitud = limites[i + 1] - limites[i];
    tramos.push({
      id: `T${i + 1}`,
      desde: limites[i],
      hasta: limites[i + 1],
      longitud,
      areaCalzada: longitud * ac,
      areaBermas: longitud * ab,
    });
  }
  return tramos;
}

export function grupoDe(d: Pick<Dano, 'tipo' | 'enBerma'>): Grupo | 'lineal' {
  const t = tipoDano(d.tipo);
  if (!t) return 'carriles';
  if (t.unidad === 'n') return 'lineal';
  if (t.unidad === 'm' && !t.lineal) return 'lineal';
  if (d.enBerma) return 'bermas';
  if (t.categoria === 'superficiales') return 'superficiales';
  return 'carriles';
}

function indiceTramo(tramos: Tramo[], abscisa: number | null): number {
  if (!tramos.length) return -1;
  if (abscisa == null) return 0;
  if (abscisa <= tramos[0].desde) return 0;
  for (let i = 0; i < tramos.length; i++) {
    if (abscisa < tramos[i].hasta) return i;
  }
  return tramos.length - 1;
}

const ORDEN_TIPO = new Map(TIPOS_DANO.map((t, i) => [t.codigo, i]));
const ORDEN_SEV: Record<string, number> = { B: 0, M: 1, A: 2, '': 3 };

function analizarGrupo(grupo: Grupo, tramos: Tramo[], danos: Dano[]): AnalisisGrupo {
  const areaRefTramo = tramos.map((t) => (grupo === 'bermas' ? t.areaBermas : t.areaCalzada));
  const areaRefTotal = areaRefTramo.reduce((a, b) => a + b, 0);

  const cols = new Map<string, Columna & { orden: number }>();
  for (const d of danos) {
    const t = tipoDano(d.tipo);
    const sev = t?.severidades ? d.severidad : null;
    const sigla = siglaRegistro(d.tipo, d.enBerma);
    const clave = `${sigla}|${sev ?? ''}`;
    if (!cols.has(clave)) {
      cols.set(clave, {
        sigla,
        nombre: t?.nombre ?? d.tipo,
        sev,
        clave,
        orden: (ORDEN_TIPO.get(d.tipo) ?? 99) * 10 + ORDEN_SEV[sev ?? ''],
      });
    }
  }
  const columnas: Columna[] = [...cols.values()]
    .sort((a, b) => a.orden - b.orden)
    .map(({ sigla, nombre, sev, clave }) => ({ sigla, nombre, sev, clave }));
  const idxCol = new Map(columnas.map((c, i) => [c.clave, i]));

  const matriz = tramos.map(() => columnas.map(() => 0));
  for (const d of danos) {
    const t = tipoDano(d.tipo);
    const sev = t?.severidades ? d.severidad : null;
    const clave = `${siglaRegistro(d.tipo, d.enBerma)}|${sev ?? ''}`;
    const i = indiceTramo(tramos, d.abscisa);
    const j = idxCol.get(clave);
    if (i < 0 || j == null) continue;
    matriz[i][j] += magnitud(d).area;
  }
  const totalTramo = matriz.map((fila) => fila.reduce((a, b) => a + b, 0));
  const pctTramo = totalTramo.map((v, i) => (areaRefTramo[i] > 0 ? v / areaRefTramo[i] : 0));
  const totalColumna = columnas.map((_, j) => matriz.reduce((a, fila) => a + fila[j], 0));
  const areaAfectada = totalTramo.reduce((a, b) => a + b, 0);

  const tipos = new Map<string, { sigla: string; nombre: string; area: number; pct: number }>();
  columnas.forEach((c, j) => {
    const e = tipos.get(c.sigla) ?? { sigla: c.sigla, nombre: c.nombre, area: 0, pct: 0 };
    e.area += totalColumna[j];
    tipos.set(c.sigla, e);
  });
  const totalTipo = [...tipos.values()].map((e) => ({ ...e, pct: areaRefTotal > 0 ? e.area / areaRefTotal : 0 }));

  return {
    grupo,
    titulo: TITULO_GRUPO[grupo],
    tramos,
    areaRefTramo,
    areaRefTotal,
    columnas,
    matriz,
    totalTramo,
    pctTramo,
    totalColumna,
    totalTipo,
    areaAfectada,
    pctAfectacion: areaRefTotal > 0 ? areaAfectada / areaRefTotal : 0,
    numRegistros: danos.length,
  };
}

export function analizarSector(sector: Sector, danos: Dano[]): AnalisisSector {
  const tramos = calcularTramos(sector);
  const advertencias: string[] = [];
  const ini = Math.min(sector.prInicial, sector.prFinal);
  const fin = Math.max(sector.prInicial, sector.prFinal);
  if (!tramos.length) advertencias.push('El sector no tiene abscisas inicial y final válidas (PR final debe ser mayor que PR inicial).');
  if (anchoCalzada(sector) <= 0) advertencias.push('Falta el ancho de carril o el número de carriles: no se puede calcular el área inspeccionada.');

  const porGrupo: Record<Grupo, Dano[]> = { carriles: [], superficiales: [], bermas: [] };
  const lin = new Map<string, DanoLineal>();
  for (const d of danos) {
    const t = tipoDano(d.tipo);
    if (!t) {
      advertencias.push(`Foto ${d.numero}: sin tipo de daño asignado.`);
      continue;
    }
    if (d.abscisa == null) advertencias.push(`Foto ${d.numero} (${d.tipo}): sin abscisa; se asigna al primer tramo.`);
    else if (d.abscisa < ini - 1e-6 || d.abscisa > fin + 1e-6)
      advertencias.push(`Foto ${d.numero} (${d.tipo}): la abscisa ${fmtPR(d.abscisa)} está fuera del sector.`);
    if (t.severidades && !d.severidad) advertencias.push(`Foto ${d.numero} (${d.tipo}): sin severidad asignada.`);
    if (t.unidad === 'm2' && (d.largo == null || d.ancho == null))
      advertencias.push(`Foto ${d.numero} (${d.tipo}): faltan dimensiones (largo y ancho).`);
    if (t.unidad === 'm' && d.largo == null) advertencias.push(`Foto ${d.numero} (${d.tipo}): falta la longitud.`);

    const g = grupoDe(d);
    if (g === 'lineal') {
      const sev = t.severidades ? d.severidad : null;
      const sigla = siglaRegistro(d.tipo, d.enBerma);
      const clave = `${sigla}|${sev ?? ''}`;
      const e =
        lin.get(clave) ??
        ({ sigla, nombre: t.nombre, sev, longitud: 0, cantidad: 0, unidad: t.unidad === 'n' ? 'n' : 'm' } as DanoLineal);
      e.cantidad += 1;
      if (t.unidad === 'm') e.longitud += d.largo ?? 0;
      lin.set(clave, e);
    } else {
      porGrupo[g].push(d);
    }
  }
  if (porGrupo.bermas.length && !(sector.anchoBerma > 0 && sector.numBermas > 0))
    advertencias.push('Hay daños en berma pero el sector no tiene ancho ni número de bermas definidos.');

  const grupos = {
    carriles: analizarGrupo('carriles', tramos, porGrupo.carriles),
    superficiales: analizarGrupo('superficiales', tramos, porGrupo.superficiales),
    bermas: analizarGrupo('bermas', tramos, porGrupo.bermas),
  };
  return {
    tramos,
    anchoCalzada: anchoCalzada(sector),
    longitud: fin - ini,
    areaInspeccionada: tramos.reduce((a, t) => a + t.areaCalzada, 0),
    areaBermas: tramos.reduce((a, t) => a + t.areaBermas, 0),
    grupos,
    lineales: [...lin.values()],
    advertencias,
  };
}

/** Columnas ordenadas de mayor a menor área afectada (deterioros más frecuentes). */
export function ranking(a: AnalisisGrupo): { col: Columna; area: number; pct: number }[] {
  return a.columnas
    .map((col, j) => ({ col, area: a.totalColumna[j], pct: a.areaRefTotal > 0 ? a.totalColumna[j] / a.areaRefTotal : 0 }))
    .filter((x) => x.area > 0)
    .sort((x, y) => y.area - x.area);
}

/** Tramos ordenados de mayor a menor afectación. */
export function tramosMasAfectados(a: AnalisisGrupo, n = 3): { tramo: Tramo; area: number; pct: number }[] {
  return a.tramos
    .map((tramo, i) => ({ tramo, area: a.totalTramo[i], pct: a.pctTramo[i] }))
    .filter((x) => x.area > 0)
    .sort((x, y) => y.pct - x.pct)
    .slice(0, n);
}

/** Orden del formato de campo: por abscisa ascendente y luego por número de foto. */
export function ordenarDanos(danos: Dano[]): Dano[] {
  return [...danos].sort((a, b) => {
    const xa = a.abscisa ?? -Infinity;
    const xb = b.abscisa ?? -Infinity;
    return xa !== xb ? xa - xb : a.numero - b.numero;
  });
}
