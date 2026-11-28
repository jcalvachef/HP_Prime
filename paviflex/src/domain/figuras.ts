/** Figura del manual (fotografía y esquema) que ilustra cada tipo de daño: capítulo 1, figuras 1 a 28. */
export const FIGURA_DE: Record<string, number> = {
  FL: 1, FT: 2, FCL: 3, FCT: 4, FJL: 5, FJT: 5, FML: 6, FBD: 7, FB: 8, PC: 9, FDC: 10, FIN: 11,
  OND: 12, AB: 13, HUN: 14, AHU: 15, DC: 16, BCH: 17, PCH: 18,
  DSU: 19, PA: 20, PU: 21, CD: 22, EX: 23, SU: 24, CVB: 25, SB: 26, AFI: 27, AFA: 28,
};

export interface FiguraManual {
  num: number;
  w: number;
  h: number;
  /** Rectángulos de las fotografías dentro de la figura, en píxeles */
  fotos: { x: number; y: number; w: number; h: number }[];
}
