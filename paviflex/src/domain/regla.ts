/**
 * Escala fotográfica con la regla naranja de 1,00 m y geometría de las mediciones.
 * La escala es válida en el plano del pavimento y en la vecindad de la regla; la fotografía
 * debe tomarse lo más perpendicular posible a la superficie, con la regla junto al daño.
 */
import type { Medicion, Pt, Trazo } from './types';

export function distancia(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Píxeles por metro según los extremos marcados de la regla. */
export function pxPorMetro(m: Medicion | null): number | null {
  if (!m?.regla) return null;
  const px = distancia(m.regla.a, m.regla.b);
  if (!(px > 1) || !(m.longitudRegla > 0)) return null;
  return px / m.longitudRegla;
}

export function longitudPolilinea(p: Pt[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += distancia(p[i - 1], p[i]);
  return s;
}

/** Área de un polígono simple (fórmula del área de Gauss), en px². */
export function areaPoligono(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Valor real del trazo: metros para largo/ancho, m² para área. */
export function valorTrazo(t: Trazo, ppm: number): number {
  if (t.clase === 'area') return t.puntos.length >= 3 ? areaPoligono(t.puntos) / (ppm * ppm) : 0;
  return longitudPolilinea(t.puntos) / ppm;
}

export interface ResumenMedicion {
  largo: number | null;
  ancho: number | null;
  area: number | null;
}

/** Suma de trazos por clase (varios trazos de "largo" se acumulan, p. ej. fisuras ramificadas). */
export function resumenMedicion(m: Medicion | null): ResumenMedicion {
  const ppm = pxPorMetro(m);
  const r: ResumenMedicion = { largo: null, ancho: null, area: null };
  if (!m || !ppm) return r;
  for (const t of m.trazos) {
    const v = valorTrazo(t, ppm);
    if (!(v > 0)) continue;
    r[t.clase] = (r[t.clase] ?? 0) + v;
  }
  return r;
}

export interface DeteccionRegla {
  a: Pt;
  b: Pt;
  /** 0–1: qué tan alargada y definida es la mancha naranja detectada */
  confianza: number;
}

/**
 * Detección automática de la regla naranja en una imagen RGBA.
 * Segmenta píxeles de tono naranja saturado, toma el componente conexo más alargado
 * y devuelve los extremos sobre su eje principal. El resultado es una propuesta que
 * el usuario confirma o ajusta arrastrando los extremos.
 */
export function detectarReglaNaranja(datos: Uint8ClampedArray, ancho: number, alto: number): DeteccionRegla | null {
  const n = ancho * alto;
  const mascara = new Uint8Array(n);
  let cuenta = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (esNaranja(datos[p], datos[p + 1], datos[p + 2])) {
      mascara[i] = 1;
      cuenta++;
    }
  }
  if (cuenta < 12) return null;

  // Dilatación de DIL píxeles: une los segmentos de la regla separados por sus marcas de graduación.
  // Los extremos detectados se recortan luego en la misma cantidad.
  const DIL = 2;
  for (let paso = 0; paso < DIL; paso++) {
    const copia = mascara.slice();
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < ancho; x++) {
        const i = y * ancho + x;
        if (copia[i]) continue;
        if ((x > 0 && copia[i - 1]) || (x < ancho - 1 && copia[i + 1]) || (y > 0 && copia[i - ancho]) || (y < alto - 1 && copia[i + ancho])) mascara[i] = 1;
      }
    }
  }

  // Componentes conexos (8-vecinos) con pila explícita
  const etiqueta = new Int32Array(n);
  const pila = new Int32Array(n);
  let mejor: { puntaje: number; a: Pt; b: Pt; confianza: number } | null = null;
  let actual = 0;
  for (let inicio = 0; inicio < n; inicio++) {
    if (!mascara[inicio] || etiqueta[inicio]) continue;
    actual++;
    let tope = 0;
    pila[tope++] = inicio;
    etiqueta[inicio] = actual;
    let cnt = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    const miembros: number[] = [];
    while (tope > 0) {
      const i = pila[--tope];
      const x = i % ancho;
      const y = (i - x) / ancho;
      cnt++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      miembros.push(i);
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= alto) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= ancho) continue;
          const j = yy * ancho + xx;
          if (mascara[j] && !etiqueta[j]) {
            etiqueta[j] = actual;
            pila[tope++] = j;
          }
        }
      }
    }
    if (cnt < 12) continue;
    const mx = sx / cnt, my = sy / cnt;
    const cxx = sxx / cnt - mx * mx, cyy = syy / cnt - my * my, cxy = sxy / cnt - mx * my;
    // Autovalores de la matriz de covarianza → eje principal
    const tr = cxx + cyy;
    const det = cxx * cyy - cxy * cxy;
    const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    const l1 = tr / 2 + disc;
    const l2 = Math.max(1e-6, tr / 2 - disc);
    const ang = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    const ux = Math.cos(ang), uy = Math.sin(ang);
    let tmin = Infinity, tmax = -Infinity;
    for (const i of miembros) {
      const x = i % ancho;
      const y = (i - x) / ancho;
      const t = (x - mx) * ux + (y - my) * uy;
      if (t < tmin) tmin = t;
      if (t > tmax) tmax = t;
    }
    tmin += DIL;
    tmax -= DIL;
    const largo = tmax - tmin;
    const grosor = Math.max(1, Math.sqrt(l2) * 2 * Math.sqrt(3) - 2 * DIL); // ancho de una barra uniforme
    const alargamiento = largo / Math.max(1, grosor);
    if (alargamiento < 5 || largo < Math.max(ancho, alto) * 0.08) continue;
    // Una regla llena su caja orientada: densidad cercana a 1
    const densidad = Math.min(1, cnt / Math.max(1, (largo + 2 * DIL) * (grosor + 2 * DIL)));
    const puntaje = largo * Math.min(1, alargamiento / 12) * (0.4 + 0.6 * densidad);
    if (!mejor || puntaje > mejor.puntaje) {
      mejor = {
        puntaje,
        a: { x: mx + ux * tmin, y: my + uy * tmin },
        b: { x: mx + ux * tmax, y: my + uy * tmax },
        confianza: Math.min(1, alargamiento / 15) * densidad * Math.min(1, Math.sqrt(l1 / l2) / 8),
      };
    }
  }
  if (!mejor) return null;
  return { a: mejor.a, b: mejor.b, confianza: mejor.confianza };
}

/** Naranja de seguridad: tono 8°–38°, alta saturación y brillo suficiente. */
export function esNaranja(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (max < 110 || d < 70) return false;
  if (d / max < 0.5) return false;
  if (max !== r) return false;
  let h = ((g - b) / d) * 60;
  if (h < 0) h += 360;
  return h >= 8 && h <= 38;
}
