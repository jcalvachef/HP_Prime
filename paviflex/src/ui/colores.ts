import type { Severidad } from '../domain/types';

/** Colores de estado para la severidad; siempre acompañados de la etiqueta textual. */
export const COLOR_SEV: Record<Severidad | 'N', { fondo: string; texto: string }> = {
  B: { fondo: '#0ca30c', texto: '#ffffff' },
  M: { fondo: '#fab219', texto: '#0b0b0b' },
  A: { fondo: '#d03b3b', texto: '#ffffff' },
  N: { fondo: '#898781', texto: '#ffffff' },
};

export const TINTA = {
  primaria: '#0b0b0b',
  secundaria: '#52514e',
  tenue: '#898781',
  rejilla: '#e1e0d9',
  eje: '#c3c2b7',
  superficie: '#ffffff',
  serie: '#2a78d6',
  naranja: '#f26a1b',
};
