/**
 * Interpretación de la fotografía de un daño para sugerir su tipo.
 *
 * De la imagen se extraen rasgos de la estructura del pavimento: trazos oscuros (fisuras), su forma
 * y las celdas que encierran, manchas oscuras compactas, textura y color. Con ellos se hace una
 * lectura por reglas tomadas de las definiciones del manual (fisura aislada, red de fisuras, pérdida
 * de capa, textura superficial). Esa lectura es el respaldo mientras el motor de conocimiento
 * (ver conocimiento.ts) no tiene ejemplos parecidos; cuando los tiene, pesa lo aprendido.
 *
 * No se compara directamente con las fotografías del manual: se midió y no sirve (son vistas
 * oblicuas de la vía, de baja resolución; la familia correcta quedó entre las tres primeras en
 * 11 de 36 fotografías). La lectura por reglas tampoco acierta en esas mismas fotografías (12 de
 * 36): está pensada para fotos cenitales. Las figuras del manual
 * se muestran para que el inspector confirme. La sugerencia es una ayuda: no reemplaza el criterio
 * de quien inspecciona.
 */
import { esNaranja } from './regla';

/** Número de rasgos del descriptor. */
export const DIM = 16;
const ANCHO = 256;

function desenfoque(src: Float32Array, w: number, h: number, r: number): Float32Array {
  // Promedio en ventana cuadrada con imagen integral
  const W = w + 1;
  const integral = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let fila = 0;
    for (let x = 0; x < w; x++) {
      fila += src[y * w + x];
      integral[(y + 1) * W + x + 1] = integral[y * W + x + 1] + fila;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      out[y * w + x] = (integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

interface Componente {
  n: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  tocaBorde: boolean;
}

/** Componentes conexos (8 vecinos) de una máscara binaria. */
function componentes(mascara: Uint8Array, w: number, h: number): Componente[] {
  const visto = new Uint8Array(w * h);
  const pila = new Int32Array(w * h);
  const res: Componente[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!mascara[s] || visto[s]) continue;
    let tope = 0;
    pila[tope++] = s;
    visto[s] = 1;
    const c: Componente = { n: 0, x0: w, y0: h, x1: 0, y1: 0, tocaBorde: false };
    while (tope) {
      const i = pila[--tope];
      const x = i % w, y = (i - x) / w;
      c.n++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c.tocaBorde = true;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (mascara[j] && !visto[j]) {
            visto[j] = 1;
            pila[tope++] = j;
          }
        }
      }
    }
    res.push(c);
  }
  return res;
}

/** Mediana de valores no negativos acotados, por histograma. */
function mediana(valores: Float32Array, max: number): number {
  const N = 512;
  const h = new Uint32Array(N);
  for (let i = 0; i < valores.length; i++) h[Math.min(N - 1, Math.max(0, Math.floor((valores[i] / max) * N)))]++;
  let acum = 0;
  for (let k = 0; k < N; k++) {
    acum += h[k];
    if (acum >= valores.length / 2) return ((k + 0.5) / N) * max;
  }
  return max;
}

const sat = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Descriptor de una imagen RGBA de cualquier tamaño. Se trabaja a 256 px de ancho y se ignoran la
 * regla naranja y la pintura de demarcación, que no son parte del daño.
 */
export function describir(rgba: Uint8ClampedArray | Uint8Array, anchoOrigen: number, altoOrigen: number): number[] {
  // 1. Reducción por promedio de área
  const w = Math.min(ANCHO, anchoOrigen);
  const h = Math.max(40, Math.min(384, Math.round((altoOrigen * w) / anchoOrigen)));
  const n = w * h;
  const gris = new Float32Array(n);
  const valido = new Uint8Array(n);
  let sumaSat = 0, nValidos = 0;
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor((y * altoOrigen) / h), sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * altoOrigen) / h));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * anchoOrigen) / w), sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * anchoOrigen) / w));
      let r = 0, g = 0, b = 0, c = 0;
      for (let sy = sy0; sy < sy1; sy++)
        for (let sx = sx0; sx < sx1; sx++) {
          const p = (sy * anchoOrigen + sx) * 4;
          r += rgba[p]; g += rgba[p + 1]; b += rgba[p + 2]; c++;
        }
      r /= c; g /= c; b /= c;
      const i = y * w + x;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const s = max > 0 ? (max - min) / max : 0;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      gris[i] = lum;
      // Fuera del análisis: regla naranja, pintura amarilla o roja saturada, pintura blanca
      const pintura = (s > 0.5 && max > 110 && r >= b) || (lum > 228 && s < 0.16);
      if (!(esNaranja(r, g, b) || pintura)) {
        valido[i] = 1;
        nValidos++;
        sumaSat += s;
      }
    }
  }
  if (nValidos < n * 0.2) {
    valido.fill(1);
    nValidos = n;
  }
  // Los píxeles excluidos y su contorno toman el promedio para no crear bordes artificiales
  let media = 0;
  for (let i = 0; i < n; i++) if (valido[i]) media += gris[i];
  media /= nValidos;
  const excluido = new Uint8Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (valido[i]) continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) excluido[yy * w + xx] = 1;
        }
    }
  for (let i = 0; i < n; i++) if (excluido[i]) gris[i] = media;
  let varianza = 0;
  for (let i = 0; i < n; i++) varianza += (gris[i] - media) ** 2;
  const sigma = Math.sqrt(varianza / n);

  // 2. Escalas
  const b1 = desenfoque(gris, w, h, 1), b4 = desenfoque(gris, w, h, 4), b12 = desenfoque(gris, w, h, 12), b40 = desenfoque(gris, w, h, 40);
  let fina = 0, mediaEsc = 0;
  const local = new Float32Array(n), absLocal = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    fina += Math.abs(gris[i] - b1[i]);
    mediaEsc += Math.abs(b1[i] - b4[i]);
    local[i] = b1[i] - b12[i];
    absLocal[i] = Math.abs(local[i]);
  }
  fina /= n; mediaEsc /= n;

  // 3. Mapa de fisuras: trazos mucho más oscuros que su entorno. El umbral parte del ruido propio
  // de la textura (desviación robusta), de modo que un pavimento sano casi no marca píxeles.
  const ruido = 1.4826 * mediana(absLocal, 128);
  const umbral = Math.max(3 * ruido, 7);
  const cruda = new Uint8Array(n);
  for (let i = 0; i < n; i++) cruda[i] = !excluido[i] && local[i] < -umbral ? 1 : 0;
  const fis = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!cruda[i]) continue;
      const vecinos = cruda[i - 1] + cruda[i + 1] + cruda[i - w] + cruda[i + w] + cruda[i - w - 1] + cruda[i - w + 1] + cruda[i + w - 1] + cruda[i + w + 1];
      if (vecinos >= 2) fis[i] = 1;
    }
  // Solo cuentan los trazos de cierto tamaño: descarta poros y agregados sueltos
  const minTrazo = Math.max(12, Math.round(n / 4000));
  const trazos = componentes(fis, w, h).filter((c) => c.n >= minTrazo).sort((a, b) => b.n - a.n);
  const nFis = trazos.reduce((s, c) => s + c.n, 0);

  // 4. Orientación de las fisuras (tensor de estructura sobre el gradiente)
  let jxx = 0, jyy = 0, jxy = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!fis[i]) continue;
      const gx = b1[i + 1] - b1[i - 1], gy = b1[i + w] - b1[i - w];
      jxx += gx * gx; jyy += gy * gy; jxy += gx * gy;
    }
  const coherencia = jxx + jyy > 0 ? Math.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy) / (jxx + jyy) : 0;

  // 5. Forma del trazo principal
  const mayor = trazos[0];
  const diag = Math.hypot(w, h);
  const mayorFrac = mayor && nFis ? mayor.n / nFis : 0;
  const mayorExt = mayor ? Math.hypot(mayor.x1 - mayor.x0 + 1, mayor.y1 - mayor.y0 + 1) / diag : 0;
  // Grosor medio del trazo principal en píxeles: una fisura es fina; una mancha, ancha
  const mayorGrosor = mayor ? mayor.n / Math.hypot(mayor.x1 - mayor.x0 + 1, mayor.y1 - mayor.y0 + 1) : 0;

  // 6. Celdas encerradas por las fisuras (piel de cocodrilo: muchas; bloques: pocas y grandes)
  const libre = new Uint8Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let cerca = 0;
      for (let dy = -1; dy <= 1 && !cerca; dy++)
        for (let dx = -1; dx <= 1 && !cerca; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && fis[yy * w + xx]) cerca = 1;
        }
      libre[i] = cerca ? 0 : 1;
    }
  const celdas = componentes(libre, w, h).filter((c) => !c.tocaBorde && c.n >= 25);
  const areaCeldas = celdas.reduce((s, c) => s + c.n, 0);

  // 7. Mancha oscura compacta (bache, descascaramiento, humedad): más oscura que su entorno amplio
  const oscura = new Uint8Array(n);
  let nOsc = 0;
  const umbralMancha = Math.max(0.9 * sigma, 14);
  for (let i = 0; i < n; i++)
    if (!excluido[i] && b4[i] < b40[i] - umbralMancha) {
      oscura[i] = 1;
      nOsc++;
    }
  const mancha = componentes(oscura, w, h).sort((a, b) => b.n - a.n)[0];
  const manchaFrac = mancha ? mancha.n / n : 0;
  const manchaRelleno = mancha && mancha.n >= n * 0.01 ? mancha.n / ((mancha.x1 - mancha.x0 + 1) * (mancha.y1 - mancha.y0 + 1)) : 0;

  const m = Math.max(media, 1);
  return [
    sat(Math.sqrt(nFis / n) / 0.3), // 0 densidad de fisuras
    sat(trazos.length / 12), // 1 número de trazos
    mayorFrac, // 2 peso del trazo principal
    sat(mayorExt), // 3 longitud del trazo principal
    sat(mayorGrosor / 20), // 4 grosor del trazo principal: fisura fina (bajo) o mancha (alto)
    coherencia, // 5 una dirección dominante
    sat(celdas.length / 12), // 6 número de celdas encerradas
    sat(Math.sqrt(areaCeldas / n) / 0.6), // 7 área encerrada por fisuras
    celdas.length ? sat(Math.sqrt(areaCeldas / celdas.length / n) / 0.25) : 0, // 8 tamaño medio de celda
    sat(Math.sqrt(manchaFrac) / 0.5), // 9 mancha oscura principal
    manchaRelleno, // 10 compacidad de la mancha
    sat(Math.sqrt(nOsc / n) / 0.5), // 11 área oscura total
    sat(fina / m / 0.08), // 12 textura fina
    sat(mediaEsc / m / 0.08), // 13 textura media
    sat(sigma / m / 0.4), // 14 contraste global
    sat(sumaSat / nValidos / 0.4), // 15 saturación (granular expuesto, vegetación)
  ];
}

/**
 * Familias de aspecto parecido. Dentro de una familia la fotografía sola no alcanza para decidir
 * (una fisura longitudinal y una transversal se ven igual sin saber hacia dónde va la vía), por eso
 * las tres sugerencias se toman de familias distintas y las demás siglas de la familia se ofrecen
 * como variantes. La primera sigla de cada familia es la que se propone si no hay más información.
 */
export const FAMILIAS: { id: string; nombre: string; codigos: string[] }[] = [
  { id: 'lineal', nombre: 'Fisura aislada', codigos: ['FL', 'FT', 'FCL', 'FCT', 'FJL', 'FJT', 'FBD'] },
  { id: 'curva', nombre: 'Fisuras curvas', codigos: ['FML', 'FDC'] },
  { id: 'red', nombre: 'Red de fisuras', codigos: ['PC', 'FB', 'FIN'] },
  { id: 'deformacion', nombre: 'Deformación', codigos: ['AHU', 'HUN', 'OND', 'AB'] },
  { id: 'perdida', nombre: 'Pérdida de capa', codigos: ['BCH', 'DC'] },
  { id: 'parche', nombre: 'Parche', codigos: ['PCH'] },
  { id: 'textura', nombre: 'Textura superficial', codigos: ['DSU', 'PA', 'PU', 'CD', 'SU'] },
  { id: 'humedad', nombre: 'Exudación y afloramientos', codigos: ['EX', 'AFA', 'AFI'] },
  { id: 'berma', nombre: 'Junta con la berma', codigos: ['CVB', 'SB'] },
];
const FAMILIA_DE = new Map(FAMILIAS.flatMap((f) => f.codigos.map((c) => [c, f] as const)));

export function familiaDe(codigo: string) {
  return FAMILIA_DE.get(codigo);
}

/**
 * Lectura por reglas: qué tanto se parece la estructura de la fotografía a cada familia (0 a 1).
 * Las deformaciones, los parches, la humedad y los daños de la berma casi no dejan huella en una
 * fotografía cenital, así que reciben un puntaje bajo y fijo: aparecen como alternativa solo cuando
 * nada más encaja.
 */
export function puntajeFamilias(d: number[]): Record<string, number> {
  const [dens, nTrazos, mayorFrac, mayorExt, mayorGrosor, coherencia, nCeldas, areaCeldas, , mancha, manchaComp] = d;
  const hayFisuras = sat(dens / 0.25);
  // Red de fisuras: celdas cerradas o, si las fisuras no llegan a cerrarse en la imagen, muchos
  // trazos densos y en varias direcciones
  const porCeldas = sat(0.75 * sat(nCeldas / 0.35) + 0.25 * sat(areaCeldas / 0.4) + 0.15 * sat((nTrazos - 0.3) / 0.5));
  const porDispersion = 0.8 * sat((dens - 0.45) / 0.2) * sat((nTrazos - 0.4) / 0.4) * Math.sqrt(1 - coherencia);
  const red = hayFisuras * Math.max(porCeldas, porDispersion);
  const lineal = sat(dens / 0.12) * sat(mayorFrac / 0.6) * sat(mayorExt / 0.3) * (1 - sat(nCeldas / 0.3)) * (1 - 0.8 * sat((mayorGrosor - 0.25) / 0.4));
  const perdida = sat((mancha - 0.25) / 0.35) * sat(manchaComp / 0.45);
  const estructura = Math.max(red, lineal, perdida);
  // El pequeño valor fijo de cada familia ordena las alternativas cuando la fotografía no da más
  // pistas: primero las familias más frecuentes en una inspección.
  return {
    red: red + 0.06,
    lineal: lineal + 0.055,
    perdida: perdida + 0.05,
    textura: 0.85 * (1 - estructura) + 0.045,
    parche: 0.15 * (1 - estructura) + 0.2 * perdida + 0.04,
    deformacion: 0.3 * (1 - estructura) + 0.035,
    curva: 0.6 * lineal + 0.03,
    humedad: 0.2 * (1 - estructura) + 0.25 * perdida + 0.025,
    berma: 0.02,
  };
}

export interface Sugerencia {
  codigo: string;
  puntaje: number;
  /** La sugerencia viene de lo aprendido con los registros del inspector, no solo de las reglas */
  porConocimiento: boolean;
  /** Otras siglas de la misma familia visual */
  variantes: string[];
}

/** Lo que aporta el motor de conocimiento: voto de cada sigla y cuánto se parece la foto a algo ya visto. */
export interface AporteConocimiento {
  votos: Map<string, number>;
  confianza: number;
}

/**
 * La sugerencia más probable y dos alternativas, cada una de una familia visual distinta.
 * Combina lo aprendido (si la fotografía se parece a ejemplos ya clasificados) con la lectura por
 * reglas, que es la que pesa mientras no hay ejemplos parecidos.
 */
export function sugerir(descriptor: number[], conocimiento?: AporteConocimiento, cuantas = 3): Sugerencia[] {
  const reglas = puntajeFamilias(descriptor);
  const g = conocimiento?.confianza ?? 0;
  const candidatos: { codigo: string; familia: string; puntaje: number; aprendido: boolean }[] = [];
  for (const f of FAMILIAS)
    f.codigos.forEach((codigo, i) => {
      const base = (1 - g) * 0.6 * (reglas[f.id] ?? 0) * (i === 0 ? 1 : 0.85);
      const aprendido = g * (conocimiento?.votos.get(codigo) ?? 0);
      candidatos.push({ codigo, familia: f.id, puntaje: base + aprendido, aprendido: aprendido > base && aprendido > 0.1 });
    });
  candidatos.sort((a, b) => b.puntaje - a.puntaje);
  const usadas = new Set<string>();
  const res: Sugerencia[] = [];
  for (const c of candidatos) {
    if (usadas.has(c.familia)) continue;
    usadas.add(c.familia);
    res.push({
      codigo: c.codigo,
      puntaje: c.puntaje,
      porConocimiento: c.aprendido,
      variantes: candidatos.filter((x) => x.familia === c.familia && x.codigo !== c.codigo).map((x) => x.codigo),
    });
    if (res.length >= cuantas) break;
  }
  return res;
}
