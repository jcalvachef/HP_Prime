import type { Celda } from './modelo';

/** Celda de la rejilla expandida: real, continuación horizontal (h) o vertical (v) de una combinación. */
export type CeldaRejilla =
  | { tipo: 'real'; celda: Celda; colSpan: number; rowSpan: number }
  | { tipo: 'h' }
  | { tipo: 'v'; colSpan: number };

/** Expande las filas del modelo (solo celdas reales) a una matriz completa filas × columnas. */
export function expandirRejilla(filas: Celda[][], nCols: number): CeldaRejilla[][] {
  const pendiente: { filas: number; colSpan: number }[] = Array.from({ length: nCols }, () => ({ filas: 0, colSpan: 1 }));
  return filas.map((fila) => {
    const salida: CeldaRejilla[] = [];
    let i = 0;
    let c = 0;
    while (c < nCols) {
      if (pendiente[c].filas > 0) {
        const span = pendiente[c].colSpan;
        pendiente[c].filas--;
        salida.push({ tipo: 'v', colSpan: span });
        for (let q = 1; q < span; q++) salida.push({ tipo: 'h' });
        c += span;
        continue;
      }
      const celda = fila[i++] ?? {};
      const colSpan = Math.max(1, Math.min(celda.colSpan ?? 1, nCols - c));
      const rowSpan = Math.max(1, celda.rowSpan ?? 1);
      salida.push({ tipo: 'real', celda, colSpan, rowSpan });
      for (let q = 1; q < colSpan; q++) salida.push({ tipo: 'h' });
      if (rowSpan > 1) pendiente[c] = { filas: rowSpan - 1, colSpan };
      c += colSpan;
    }
    return salida;
  });
}
