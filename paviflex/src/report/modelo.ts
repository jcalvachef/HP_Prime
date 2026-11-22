/**
 * Modelo intermedio del informe: una lista de bloques que se representa igual en PDF
 * (listo para imprimir) y en Word (editable, sobre la plantilla del rótulo).
 */

/** Geometría de la plantilla del rótulo: carta, márgenes 3 cm (sup., izq., der.) y 2,5 cm (inf.). */
export const PAGINA = {
  ancho: 612,
  alto: 792,
  margenSup: 85.05,
  margenInf: 70.9,
  margenIzq: 85.05,
  margenDer: 85.05,
};
export const ANCHO_UTIL = PAGINA.ancho - PAGINA.margenIzq - PAGINA.margenDer; // 441,9 pt
export const ALTO_UTIL = PAGINA.alto - PAGINA.margenSup - PAGINA.margenInf; // 636 pt
/** Altura máxima de una ficha de registro: media página carta (396 pt) con holgura. */
export const ALTO_MAX_FICHA = 300;

export interface Run {
  t: string;
  b?: boolean;
  i?: boolean;
  color?: string;
}

export interface Celda {
  texto?: string;
  runs?: Run[];
  /** Identificador de imagen y tamaño de dibujo en puntos */
  img?: string;
  imgW?: number;
  imgH?: number;
  b?: boolean;
  fill?: string;
  color?: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  vAlign?: 'top' | 'middle';
  colSpan?: number;
  rowSpan?: number;
  size?: number;
}

export type Bloque =
  | { k: 'portada'; titulo: string; subtitulos: string[]; consultor: string; titulosConsultor: string[]; pie: string }
  | { k: 'titulo'; nivel: 1 | 2 | 3; texto: string; saltoAntes?: boolean }
  | { k: 'parrafo'; runs: Run[]; align?: 'left' | 'center' | 'justify'; size?: number }
  | { k: 'lista'; items: string[] }
  | {
      k: 'tabla';
      /** Anchos de columna en puntos (suman como máximo ANCHO_UTIL) */
      anchos: number[];
      filas: Celda[][];
      /** Número de filas de encabezado que se repiten al cambiar de página */
      cabeceras?: number;
      size?: number;
      /** Mantener la tabla completa en una página (fichas de registro) */
      noPartir?: boolean;
      /** Altura mínima de cada fila en puntos (null = automática) */
      altos?: (number | null)[];
      /** Relleno vertical de celda en puntos */
      relleno?: number;
    }
  | { k: 'imagen'; id: string; w: number; h: number }
  | { k: 'pie'; texto: string }
  | { k: 'salto' }
  | { k: 'espacio'; h: number };

export interface ImagenInforme {
  dataUrl: string;
  w: number;
  h: number;
}

export interface Informe {
  titulo: string;
  nombreArchivo: string;
  bloques: Bloque[];
  imagenes: Record<string, ImagenInforme>;
  /** Líneas de contacto del pie del rótulo */
  pieRotulo: string[];
  /** Advertencias de datos incompletos para mostrar al usuario */
  advertencias: string[];
}

export const GRIS_CABECERA = '#e9e8e3';
export const GRIS_SUAVE = '#f5f4f0';
