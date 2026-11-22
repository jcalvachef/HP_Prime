/**
 * Construye el informe de inspección visual a partir de los datos del proyecto, siguiendo los
 * capítulos 2 y 3 del manual: formato de evaluación, reporte de daños, hoja de cálculo por tramos,
 * gráficas y registro fotográfico (una ficha de máximo media página por fotografía).
 */
import type { Ajustes, Dano, Proyecto, Sector } from '../domain/types';
import {
  CATEGORIAS,
  NOMBRE_SEVERIDAD,
  TIPOS_DANO,
  etiquetaUnidad,
  nombreCarril,
  siglaRegistro,
  tipoDano,
} from '../domain/catalogo';
import {
  analizarSector,
  ordenarDanos,
  ranking,
  tramosMasAfectados,
  type AnalisisGrupo,
  type AnalisisSector,
  type Grupo,
} from '../domain/analisis';
import {
  descripcionAutomatica,
  fmtFecha,
  fmtFechaHora,
  fmtFijo,
  fmtNum,
  fmtPct,
  fmtPR,
  recortar,
  textoDimensiones,
} from '../domain/formato';
import { aEpsg9377, fmtCoord } from '../domain/geo';
import { obtenerBlob } from '../data/db';
import { fotoParaInforme } from '../services/fotoAnotada';
import { componerPlano, descargarMapa, encuadre, MAPA_ESCALA, MAPA_H, MAPA_W, type Marcador } from '../services/mapa';
import { COLOR_SEV } from '../ui/colores';
import { graficaSeveridades, graficaTramos } from './graficas';
import {
  ANCHO_UTIL,
  GRIS_CABECERA,
  GRIS_SUAVE,
  type Bloque,
  type Celda,
  type ImagenInforme,
  type Informe,
} from './modelo';

export interface DatosInforme {
  proyecto: Proyecto;
  ajustes: Ajustes;
  sectores: { sector: Sector; danos: Dano[] }[];
}

export interface OpcionesInforme {
  alProgreso?: (mensaje: string, fraccion: number) => void;
  /** Intentar descargar de Google Maps el plano general de cada sector */
  planosGenerales?: boolean;
}

const cab = (texto: string, extra: Partial<Celda> = {}): Celda => ({ texto, b: true, fill: GRIS_CABECERA, align: 'center', vAlign: 'middle', ...extra });
const cel = (texto: string, extra: Partial<Celda> = {}): Celda => ({ texto, ...extra });
const num = (v: number, dec = 2): Celda => ({ texto: v > 0 ? fmtNum(v, dec) : '', align: 'right' });

function marcadorDe(d: Dano, principal: boolean): Marcador | null {
  if (!d.gps) return null;
  const t = tipoDano(d.tipo);
  const c = COLOR_SEV[t?.severidades && d.severidad ? d.severidad : 'N'];
  return { lat: d.gps.lat, lon: d.gps.lon, etiqueta: String(d.numero), color: c.fondo, colorTexto: c.texto, principal };
}

function textoSeveridad(d: Dano): string {
  const t = tipoDano(d.tipo);
  if (!t?.severidades) return 'Sin grado';
  return d.severidad ? NOMBRE_SEVERIDAD[d.severidad] : 'Sin asignar';
}

// ───────────── Formato de evaluación (capítulo 2) ─────────────

function bloquesFormato(p: Proyecto, s: Sector, danos: Dano[]): Bloque[] {
  const x = (v: boolean) => (v ? 'X' : '');
  const a4 = [78, 143, 78, 142.9];
  const info: Bloque = {
    k: 'tabla',
    anchos: a4,
    size: 7.5,
    filas: [
      [cab('FORMATO PARA LA EVALUACIÓN DEL PAVIMENTO FLEXIBLE', { colSpan: 4, size: 8.5 })],
      [cel('TERRITORIAL:', { b: true }), cel(p.territorial), cel('FECHA:', { b: true }), cel(fmtFecha(s.fecha))],
      [cel('CÓDIGO DE LA VÍA:', { b: true }), cel(p.codigoVia), cel('CONTRATO No.:', { b: true }), cel(p.contrato)],
      [cel('NOMBRE DE LA VÍA:', { b: true }), cel(p.nombreVia), cel('LEVANTADO POR:', { b: true }), cel(s.levantadoPor || p.levantadoPor)],
      [cel('PR INICIAL:', { b: true }), cel(fmtPR(s.prInicial)), cel('PR FINAL:', { b: true }), cel(fmtPR(s.prFinal))],
      [
        cel('ADMINISTRACIÓN:', { b: true }),
        cel(`Concesión [${x(p.administracion === 'concesion')}]   Mtto. integral [${x(p.administracion === 'mtto')}]   A.M.V. [${x(p.administracion === 'amv')}]`, { colSpan: 3 }),
      ],
    ],
  };

  const anchos = [48, 28, 32, 29, 32, 32, 32, 32, 26, 150.9];
  const filas: Celda[][] = [
    [
      cab('PATOLOGÍA', { colSpan: 9 }),
      cab('Aclaraciones', { rowSpan: 3 }),
    ],
    [
      cab('Abscisa', { rowSpan: 2 }),
      cab('Carril', { rowSpan: 2 }),
      cab('Tipo', { rowSpan: 2 }),
      cab('Sever', { rowSpan: 2 }),
      cab('Daño', { colSpan: 2 }),
      cab('Reparación', { colSpan: 2 }),
      cab('Foto', { rowSpan: 2 }),
    ],
    [cab('Largo (m)'), cab('Ancho (m)'), cab('Largo (m)'), cab('Ancho (m)')],
  ];
  const L = s.longitudTramo > 0 ? s.longitudTramo : 100;
  const ini = Math.min(s.prInicial, s.prFinal), fin = Math.max(s.prInicial, s.prFinal);
  const filaPR = (m: number): Celda[] => [cel(fmtPR(m), { b: true, colSpan: 10, fill: GRIS_SUAVE })];
  const ordenados = ordenarDanos(danos);
  let siguiente = ini;
  filas.push(filaPR(ini));
  siguiente = Math.floor(ini / L + 1e-9) * L + L;
  for (const d of ordenados) {
    while (d.abscisa != null && d.abscisa >= siguiente - 1e-6 && siguiente < fin) {
      filas.push(filaPR(siguiente));
      siguiente += L;
    }
    const t = tipoDano(d.tipo);
    filas.push([
      cel(d.abscisa != null ? fmtPR(d.abscisa, false) : '', { align: 'center' }),
      cel(d.carril, { align: 'center' }),
      cel(siglaRegistro(d.tipo, d.enBerma), { align: 'center', b: true }),
      cel(t?.severidades ? d.severidad ?? '' : '', { align: 'center' }),
      cel(fmtNum(d.largo), { align: 'center' }),
      cel(t?.unidad === 'm2' || d.ancho != null ? fmtNum(d.ancho) : '', { align: 'center' }),
      cel(fmtNum(d.repLargo), { align: 'center' }),
      cel(fmtNum(d.repAncho), { align: 'center' }),
      cel(d.foto ? String(d.numero) : '', { align: 'center' }),
      cel(d.aclaraciones),
    ]);
  }
  while (siguiente < fin - 1e-6) {
    filas.push(filaPR(siguiente));
    siguiente += L;
  }
  filas.push(filaPR(fin));

  const geom: Bloque = {
    k: 'tabla',
    anchos: [140, 80, ANCHO_UTIL - 220],
    size: 7.5,
    filas: [
      [cel('Número de calzadas:', { b: true }), cel(String(s.numCalzadas)), cel('COMENTARIOS:', { b: true, fill: GRIS_SUAVE })],
      [cel('Número de carriles por calzada:', { b: true }), cel(s.carrilesPorCalzada), cel(s.comentarios, { rowSpan: 3 })],
      [cel('Ancho de carril:', { b: true }), cel(`${fmtNum(s.anchoCarril)} m`)],
      [cel('Ancho de berma:', { b: true }), cel(s.anchoBerma > 0 ? `${fmtNum(s.anchoBerma)} m${s.descBerma ? ' ' + s.descBerma : ''}` : s.descBerma || 'Sin berma')],
    ],
  };
  return [
    info,
    { k: 'espacio', h: 6 },
    { k: 'tabla', anchos, filas, cabeceras: 3, size: 7.5 },
    { k: 'espacio', h: 6 },
    geom,
    {
      k: 'pie',
      texto:
        'Formato adaptado del Manual para la inspección visual de pavimentos flexibles (INVIAS – Universidad Nacional de Colombia, 2006). Los registros se listan en el sentido del abscisado; las filas sombreadas indican las abscisas cerradas de cada tramo.',
    },
  ];
}

// ───────────── Reporte de daños (capítulo 3) ─────────────

function textoRanking(g: AnalisisGrupo): { mas: string; menos: string } {
  const r = ranking(g);
  const f = (x: (typeof r)[number]) =>
    `${x.col.nombre.toLowerCase()} (${x.col.sigla})${x.col.sev ? ' de severidad ' + NOMBRE_SEVERIDAD[x.col.sev].toLowerCase() : ''}, con ${fmtNum(x.area)} m² (${fmtPct(x.pct, 2)})`;
  const mas = r.slice(0, 3).map(f).join('; ');
  const menos = r.length > 3 ? r.slice(-Math.min(3, r.length - 3)).reverse().map(f).join('; ') : '';
  return { mas, menos };
}

function hojaDeCalculo(g: AnalisisGrupo): Bloque[] {
  if (!g.columnas.length) return [];
  const bloques: Bloque[] = [];
  const MAX_COLS = 9;
  const wTramo = 28, wAbs = 45, wArea = 38, wTotal = 38, wPct = 36;
  for (let c0 = 0; c0 < g.columnas.length; c0 += MAX_COLS) {
    const cols = g.columnas.slice(c0, c0 + MAX_COLS);
    const ultimo = c0 + MAX_COLS >= g.columnas.length;
    const fijo = wTramo + 2 * wAbs + wArea + (ultimo ? wTotal + wPct : 0);
    const wCol = Math.min(34, (ANCHO_UTIL - fijo) / cols.length);
    const anchos = [wTramo, wAbs, wAbs, wArea, ...cols.map(() => wCol), ...(ultimo ? [wTotal, wPct] : [])];
    // Encabezado en dos filas: sigla (agrupando severidades) y severidad
    const f1: Celda[] = [
      cab('Tramo', { rowSpan: 2 }),
      cab('Desde', { rowSpan: 2 }),
      cab('Hasta', { rowSpan: 2 }),
      cab('Área tramo (m²)', { rowSpan: 2 }),
    ];
    const f2: Celda[] = [];
    for (let j = 0; j < cols.length; ) {
      let n = 1;
      while (j + n < cols.length && cols[j + n].sigla === cols[j].sigla) n++;
      f1.push(cab(cols[j].sigla, { colSpan: n }));
      for (let q = 0; q < n; q++) f2.push(cab(cols[j + q].sev ?? '–'));
      j += n;
    }
    if (ultimo) f1.push(cab('Total (m²)', { rowSpan: 2 }), cab('% afect. tramo', { rowSpan: 2 }));
    const filas: Celda[][] = [f1, f2];
    g.tramos.forEach((t, i) => {
      filas.push([
        cel(t.id, { align: 'center' }),
        cel(fmtPR(t.desde), { align: 'center' }),
        cel(fmtPR(t.hasta), { align: 'center' }),
        num(g.areaRefTramo[i], 1),
        ...cols.map((_, j) => num(g.matriz[i][c0 + j])),
        ...(ultimo ? [num(g.totalTramo[i]), cel(fmtPct(g.pctTramo[i]), { align: 'right' })] : []),
      ]);
    });
    filas.push([
      cel('Área total por severidad y daño (m²)', { b: true, colSpan: 3, fill: GRIS_SUAVE }),
      { ...num(g.areaRefTotal, 1), b: true, fill: GRIS_SUAVE },
      ...cols.map((_, j) => ({ ...num(g.totalColumna[c0 + j]), b: true, fill: GRIS_SUAVE })),
      ...(ultimo
        ? [
            { ...num(g.areaAfectada), b: true, fill: GRIS_SUAVE },
            cel(fmtPct(g.pctAfectacion), { align: 'right', b: true, fill: GRIS_SUAVE }),
          ]
        : []),
    ]);
    filas.push([
      cel('Peso dentro del área de referencia (%)', { colSpan: 4 }),
      ...cols.map((_, j) =>
        cel(g.areaRefTotal > 0 ? fmtPct(g.totalColumna[c0 + j] / g.areaRefTotal, 2).replace(' %', '') : '', { align: 'right' }),
      ),
      ...(ultimo ? [cel(''), cel('')] : []),
    ]);
    bloques.push({ k: 'tabla', anchos, filas, cabeceras: 2, size: 6.5, relleno: 1.5, noPartir: filas.length <= 34 });
    if (!ultimo) bloques.push({ k: 'espacio', h: 6 });
  }
  return bloques;
}

function bloquesGrupo(
  g: AnalisisGrupo,
  grupo: Grupo,
  imagenes: Record<string, ImagenInforme>,
  prefijo: string,
  contador: { tabla: number; figura: number },
): Bloque[] {
  if (!g.numRegistros) return [];
  const b: Bloque[] = [{ k: 'titulo', nivel: 3, texto: g.titulo }];
  const ref = grupo === 'bermas' ? 'área de bermas construidas' : 'área total inspeccionada';
  const { mas, menos } = textoRanking(g);
  const tr = tramosMasAfectados(g);
  const partes: string[] = [];
  partes.push(
    `El área de referencia (${ref}) es de ${fmtNum(g.areaRefTotal, 1)} m². El área afectada es de ${fmtNum(g.areaAfectada)} m², equivalente a un porcentaje de afectación de ${fmtPct(g.pctAfectacion, 2)}.`,
  );
  if (mas) partes.push(`Los deterioros más frecuentes son: ${mas}.`);
  if (menos) partes.push(`Los deterioros menos frecuentes son: ${menos}.`);
  if (tr.length)
    partes.push(
      `Los tramos más afectados son: ${tr
        .map((x) => `${x.tramo.id} (${fmtPR(x.tramo.desde)} a ${fmtPR(x.tramo.hasta)}) con ${fmtNum(x.area)} m² (${fmtPct(x.pct)})`)
        .join('; ')}.`,
    );
  if (grupo === 'superficiales')
    partes.push('Los daños superficiales se analizan de manera independiente para evitar la superposición de áreas con otros daños.');
  b.push({ k: 'parrafo', runs: [{ t: partes.join(' ') }] });

  contador.tabla++;
  b.push({ k: 'pie', texto: `Tabla ${contador.tabla}. Hoja de cálculo para el procesamiento y análisis de los datos – ${g.titulo.toLowerCase()}` });
  b.push(...hojaDeCalculo(g));

  const gt = graficaTramos(g);
  imagenes[`${prefijo}-tramos`] = gt;
  contador.figura++;
  const wG = ANCHO_UTIL;
  b.push({ k: 'espacio', h: 8 });
  b.push({ k: 'imagen', id: `${prefijo}-tramos`, w: wG, h: (wG * gt.h) / gt.w });
  b.push({ k: 'pie', texto: `Figura ${contador.figura}. Área afectada por tramos – ${g.titulo.toLowerCase()}` });

  const gs = graficaSeveridades(g);
  if (gs) {
    imagenes[`${prefijo}-sev`] = gs;
    contador.figura++;
    b.push({ k: 'imagen', id: `${prefijo}-sev`, w: wG, h: (wG * gs.h) / gs.w });
    b.push({ k: 'pie', texto: `Figura ${contador.figura}. Distribución de los daños por tipo y severidad – ${g.titulo.toLowerCase()}` });
  }
  return b;
}

function bloquesReporte(
  s: Sector,
  a: AnalisisSector,
  imagenes: Record<string, ImagenInforme>,
  prefijo: string,
  contador: { tabla: number; figura: number },
): Bloque[] {
  const b: Bloque[] = [];
  contador.tabla++;
  b.push({ k: 'pie', texto: `Tabla ${contador.tabla}. Resumen de la inspección del sector` });
  const fila = (k: string, v: string): Celda[] => [cel(k, { b: true, fill: GRIS_SUAVE }), cel(v)];
  b.push({
    k: 'tabla',
    anchos: [200, ANCHO_UTIL - 200],
    size: 8.5,
    filas: [
      fila('Abscisa inicial y final', `${fmtPR(s.prInicial)} a ${fmtPR(s.prFinal)} (${fmtNum(a.longitud, 1)} m)`),
      fila('Ancho de calzada (sin bermas)', `${fmtNum(a.anchoCalzada)} m (${s.totalCarriles} carriles de ${fmtNum(s.anchoCarril)} m)`),
      fila('Área total inspeccionada', `${fmtNum(a.areaInspeccionada, 1)} m²`),
      fila('Área afectada en carriles', `${fmtNum(a.grupos.carriles.areaAfectada)} m² (${fmtPct(a.grupos.carriles.pctAfectacion, 2)})`),
      fila('Área afectada por daños superficiales', `${fmtNum(a.grupos.superficiales.areaAfectada)} m² (${fmtPct(a.grupos.superficiales.pctAfectacion, 2)})`),
      fila(
        'Área afectada en bermas',
        a.areaBermas > 0
          ? `${fmtNum(a.grupos.bermas.areaAfectada)} m² de ${fmtNum(a.areaBermas, 1)} m² (${fmtPct(a.grupos.bermas.pctAfectacion, 2)})`
          : a.grupos.bermas.numRegistros
            ? `${fmtNum(a.grupos.bermas.areaAfectada)} m² (sin área de bermas definida)`
            : 'Sin bermas o sin daños registrados',
      ),
      fila('Tramos de análisis', `${a.tramos.length} tramos de ${fmtNum(s.longitudTramo)} m en abscisas cerradas`),
    ],
  });
  b.push({
    k: 'parrafo',
    size: 8,
    runs: [
      {
        t: 'El área de cada tramo es el ancho total de la calzada (sin bermas) por su longitud. Para fisuras longitudinales, transversales, en juntas de construcción, por reflexión de juntas y de borde, la longitud registrada se multiplica por un ancho de referencia de 0,6 m. Los daños en bermas se analizan por separado respecto al área de bermas construidas.',
        i: true,
      },
    ],
  });
  for (const g of ['carriles', 'superficiales', 'bermas'] as Grupo[]) {
    b.push(...bloquesGrupo(a.grupos[g], g, imagenes, `${prefijo}-${g}`, contador));
  }
  if (a.lineales.length) {
    b.push({ k: 'titulo', nivel: 3, texto: 'Otros daños medidos en longitud' });
    contador.tabla++;
    b.push({ k: 'pie', texto: `Tabla ${contador.tabla}. Daños de la junta calzada–berma y afloramientos` });
    b.push({
      k: 'tabla',
      anchos: [60, ANCHO_UTIL - 260, 70, 60, 70],
      size: 8,
      cabeceras: 1,
      filas: [
        [cab('Sigla'), cab('Tipo de daño'), cab('Severidad'), cab('Registros'), cab('Longitud (m)')],
        ...a.lineales.map((l) => [
          cel(l.sigla, { align: 'center', b: true }),
          cel(l.nombre),
          cel(l.sev ? NOMBRE_SEVERIDAD[l.sev] : 'Sin grado', { align: 'center' }),
          cel(String(l.cantidad), { align: 'center' }),
          cel(l.unidad === 'm' ? fmtNum(l.longitud) : '–', { align: 'right' }),
        ]),
      ],
    });
  }
  return b;
}

// ───────────── Registro fotográfico: fichas de media página ─────────────

// Con esta altura de imagen la ficha más larga (4 renglones de descripción y 2 de aclaraciones)
// mide menos de 306 pt: caben siempre dos por página y ninguna supera media hoja carta.
const FOTO_W = 198, FOTO_H = 148;

function ficha(s: Sector, d: Dano, idFoto: string | null, idMapa: string | null, imagenes: Record<string, ImagenInforme>): Bloque {
  const t = tipoDano(d.tipo);
  const sevClave = t?.severidades && d.severidad ? d.severidad : 'N';
  const col = COLOR_SEV[sevClave];
  const en = d.gps ? aEpsg9377(d.gps.lat, d.gps.lon) : null;
  const ajustar = (id: string | null, maxW: number, maxH: number): Partial<Celda> => {
    if (!id) return {};
    const im = imagenes[id];
    const f = Math.min(maxW / im.w, maxH / im.h);
    return { img: id, imgW: im.w * f, imgH: im.h * f };
  };
  const mitad = ANCHO_UTIL / 2;
  const a = [62, mitad - 62, 62, mitad - 62];
  const et = (x: string): Celda => cel(x, { b: true, fill: GRIS_SUAVE });
  const descripcion = recortar(d.descripcion || descripcionAutomatica(d), 400);
  const filas: Celda[][] = [
    [
      cel(`FOTO ${d.numero}  ·  ${siglaRegistro(d.tipo, d.enBerma)} – ${t?.nombre ?? 'Sin tipo'}${d.enBerma && !t?.propioDeBerma ? ' (en berma)' : ''}`, {
        b: true, colSpan: 3, fill: GRIS_CABECERA, size: 9, vAlign: 'middle',
      }),
      cel(`SEVERIDAD: ${textoSeveridad(d).toUpperCase()}`, { b: true, fill: col.fondo, color: col.texto, align: 'center', size: 9, vAlign: 'middle' }),
    ],
    [
      idFoto
        ? { ...ajustar(idFoto, FOTO_W, FOTO_H), colSpan: 2, align: 'center', vAlign: 'middle' }
        : cel('Sin fotografía', { colSpan: 2, align: 'center', vAlign: 'middle', color: '#898781' }),
      idMapa
        ? { ...ajustar(idMapa, FOTO_W, FOTO_H), colSpan: 2, align: 'center', vAlign: 'middle' }
        : cel('Sin coordenadas', { colSpan: 2, align: 'center', vAlign: 'middle', color: '#898781' }),
    ],
    [et('Sector'), cel(recortar(s.nombre, 38)), et('Abscisa'), cel(d.abscisa != null ? fmtPR(d.abscisa) : 'Sin abscisa')],
    [et('Localización'), cel(d.enBerma && !t?.propioDeBerma ? `Berma, ${nombreCarril(d.carril)}` : recortar(nombreCarril(d.carril), 40)), et('Fecha y hora'), cel(fmtFechaHora(d.fechaHora))],
    [et('Dimensiones'), cel(textoDimensiones(d)), et('Reparación'), cel(d.repLargo != null && d.repAncho != null ? `${fmtNum(d.repLargo)} m × ${fmtNum(d.repAncho)} m` : 'Igual al área del daño')],
    [
      et('EPSG:9377'),
      cel(en ? `E ${fmtCoord(en.este)} m   N ${fmtCoord(en.norte)} m` : 'Sin coordenadas', { b: true }),
      et('Geográficas'),
      cel(d.gps ? `${d.gps.lat.toFixed(6)}°, ${d.gps.lon.toFixed(6)}°${d.gps.precision != null ? `  (± ${fmtFijo(d.gps.precision, 1)} m)` : ''}` : '–'),
    ],
    [et('Descripción'), cel(descripcion, { colSpan: 3, align: 'justify' })],
    [et('Aclaraciones'), cel(recortar(d.aclaraciones || 'Sin aclaraciones adicionales.', 190), { colSpan: 3 })],
  ];
  return {
    k: 'tabla',
    anchos: a,
    filas,
    size: 7.5,
    noPartir: true,
    relleno: 2,
    altos: [16, FOTO_H + 6, null, null, null, null, null, null],
  };
}

// ───────────── Anexo: convenciones ─────────────

function anexoConvenciones(): Bloque[] {
  const filas: Celda[][] = [[cab('Tipo de daño'), cab('Conv.'), cab('Baja'), cab('Media'), cab('Alta')]];
  for (const c of CATEGORIAS) {
    filas.push([cel(c.nombre.toUpperCase(), { b: true, colSpan: 5, fill: GRIS_SUAVE })]);
    for (const t of TIPOS_DANO.filter((x) => x.categoria === c.id)) {
      const nombre = `${t.nombre} (${etiquetaUnidad(t.unidad)})`;
      if (t.severidades)
        filas.push([cel(nombre), cel(t.codigo, { align: 'center', b: true }), cel(t.severidades.B), cel(t.severidades.M), cel(t.severidades.A)]);
      else filas.push([cel(nombre), cel(t.codigo, { align: 'center', b: true }), cel('Sin grados de severidad asociados.', { colSpan: 3, align: 'center' })]);
    }
  }
  return [
    { k: 'titulo', nivel: 1, texto: 'Anexo. Tipos de daño, convenciones y severidades', saltoAntes: true },
    { k: 'tabla', anchos: [92, 30, 106, 107, 106.9], filas, cabeceras: 1, size: 6.5, relleno: 1.5 },
    {
      k: 'pie',
      texto:
        'Los daños en bermas se registran con la misma convención adicionando una "B" al final, excepto la separación (SB) y el corrimiento vertical de la berma (CVB). Los afloramientos de finos y de agua asociados a otro daño se anotan en las aclaraciones de ese daño.',
    },
  ];
}

// ───────────── Informe completo ─────────────

export async function construirInforme(datos: DatosInforme, op: OpcionesInforme = {}): Promise<Informe> {
  const { proyecto: p, ajustes, sectores } = datos;
  const imagenes: Record<string, ImagenInforme> = {};
  const advertencias: string[] = [];
  const bloques: Bloque[] = [];
  const contador = { tabla: 0, figura: 0 };
  const totalFotos = sectores.reduce((n, s) => n + s.danos.length, 0);
  let hechas = 0;
  const progreso = (m: string) => op.alProgreso?.(m, totalFotos ? hechas / totalFotos : 0);

  bloques.push({
    k: 'portada',
    titulo: 'INFORME DE INSPECCIÓN VISUAL DE PAVIMENTOS FLEXIBLES',
    subtitulos: [p.nombre, [p.nombreVia, p.codigoVia ? `Código ${p.codigoVia}` : ''].filter(Boolean).join(' – '), p.entidad, p.contrato ? `Contrato No. ${p.contrato}` : ''].filter(Boolean),
    consultor: ajustes.consultorNombre,
    titulosConsultor: ajustes.consultorTitulos.split('\n').map((x) => x.trim()).filter(Boolean),
    pie: [ajustes.ciudadInforme, new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })].filter(Boolean).join(', '),
  });

  // 1. Generalidades
  bloques.push({ k: 'titulo', nivel: 1, texto: 'Generalidades' });
  bloques.push({
    k: 'parrafo',
    runs: [
      {
        t: `El presente informe consigna los resultados de la inspección visual de pavimentos flexibles del proyecto "${p.nombre}". El levantamiento, la clasificación de los daños, la asignación de severidades y el procesamiento de la información siguen el Manual para la inspección visual de pavimentos flexibles (Convenio Interadministrativo 0587-03, Universidad Nacional de Colombia – Instituto Nacional de Vías, 2006).`,
      },
    ],
  });
  contador.tabla++;
  bloques.push({ k: 'pie', texto: `Tabla ${contador.tabla}. Información general del proyecto` });
  const fg = (k: string, v: string): Celda[] => [cel(k, { b: true, fill: GRIS_SUAVE }), cel(v || '–')];
  const admin = { '': '–', concesion: 'Concesión', mtto: 'Mantenimiento integral', amv: 'Administradores viales (A.M.V.)' }[p.administracion];
  bloques.push({
    k: 'tabla',
    anchos: [150, ANCHO_UTIL - 150],
    size: 8.5,
    filas: [
      fg('Proyecto', p.nombre),
      fg('Entidad contratante', p.entidad),
      fg('Contrato No.', p.contrato),
      fg('Territorial', p.territorial),
      fg('Vía', [p.nombreVia, p.codigoVia ? `código ${p.codigoVia}` : ''].filter(Boolean).join(', ')),
      fg('Localización', p.localizacion),
      fg('Administración', admin),
      fg('Levantado por', p.levantadoPor),
      fg('Sectores inspeccionados', sectores.map(({ sector: s }) => `${s.nombre} (${fmtPR(s.prInicial)} a ${fmtPR(s.prFinal)})`).join('; ')),
      fg('Registros de daño', String(totalFotos)),
      ...(p.observaciones ? [fg('Observaciones', p.observaciones)] : []),
    ],
  });
  bloques.push({ k: 'titulo', nivel: 2, texto: 'Metodología' });
  bloques.push({
    k: 'lista',
    items: [
      'Cada daño se registró con fotografía tomada desde la aplicación, tipo de daño, severidad (baja, media o alta), carril, abscisa y dimensiones características (largo y ancho, o longitud).',
      'Las dimensiones se escalaron sobre la fotografía tomando como referencia una regla de color naranja de 1,00 m de longitud colocada junto al daño, en el plano del pavimento.',
      'La posición de cada daño se capturó con el receptor GNSS del dispositivo y se expresa en el sistema MAGNA-SIRGAS / Origen-Nacional (EPSG:9377): proyección Transversa de Mercator, origen 4° N y 73° W, factor de escala 0,9992, falso este 5 000 000 m y falso norte 2 000 000 m. La precisión reportada es la estimada por el receptor.',
      'La vista en planta de cada registro se presenta sobre fondo de Google Maps cuando se dispone de conexión; en caso contrario se presenta un croquis con cuadrícula de coordenadas.',
      'El análisis agrupa los daños por tipo, severidad y tramos de 100 m, separando los daños en carriles, los daños superficiales y los daños en bermas, y calcula los porcentajes de afectación respecto al área inspeccionada.',
    ],
  });

  // Sectores
  for (let si = 0; si < sectores.length; si++) {
    const { sector: s, danos } = sectores[si];
    const pref = `s${si}`;
    const a = analizarSector(s, danos);
    for (const adv of a.advertencias) advertencias.push(`${s.nombre}: ${adv}`);
    bloques.push({ k: 'titulo', nivel: 1, texto: `${/^sector/i.test(s.nombre) ? '' : 'Sector '}${s.nombre} (${fmtPR(s.prInicial)} a ${fmtPR(s.prFinal)})`, saltoAntes: true });
    bloques.push({ k: 'titulo', nivel: 2, texto: 'Formato para la evaluación del pavimento flexible' });
    bloques.push(...bloquesFormato(p, s, danos));

    bloques.push({ k: 'titulo', nivel: 2, texto: 'Reporte de daños', saltoAntes: true });
    if (!danos.length) {
      bloques.push({ k: 'parrafo', runs: [{ t: 'No se registraron daños en este sector.' }] });
      continue;
    }
    bloques.push(...bloquesReporte(s, a, imagenes, pref, contador));

    // Plano general del sector
    const conGps = danos.filter((d) => d.gps);
    if (conGps.length) {
      progreso(`Plano general del sector ${s.nombre}`);
      const marcadores = conGps.map((d) => marcadorDe(d, false)!).filter(Boolean);
      const vista = { ...encuadre(conGps.map((d) => ({ lat: d.gps!.lat, lon: d.gps!.lon }))), w: MAPA_W, h: MAPA_H, escala: MAPA_ESCALA };
      let fondo: Blob | null = null;
      if (op.planosGenerales !== false && ajustes.claveGoogleMaps.trim()) {
        try {
          fondo = (await descargarMapa(vista.lat, vista.lon, ajustes, vista.zoom)).blob;
        } catch {
          fondo = null;
        }
      }
      const plano = await componerPlano(fondo, vista, marcadores);
      imagenes[`${pref}-plano`] = plano;
      contador.figura++;
      const wP = 330;
      bloques.push({ k: 'titulo', nivel: 3, texto: 'Localización de los daños' });
      bloques.push({ k: 'imagen', id: `${pref}-plano`, w: wP, h: (wP * plano.h) / plano.w });
      bloques.push({
        k: 'pie',
        texto: `Figura ${contador.figura}. Localización general de los daños del sector (el número corresponde a la fotografía; color según severidad: verde baja, amarillo media, rojo alta, gris sin grado)`,
      });
    }

    // Fichas
    bloques.push({ k: 'titulo', nivel: 2, texto: 'Registro fotográfico y descripción de los daños', saltoAntes: true });
    const ordenados = ordenarDanos(danos);
    for (let i = 0; i < ordenados.length; i++) {
      const d = ordenados[i];
      progreso(`Foto ${d.numero} de ${s.nombre}`);
      let idFoto: string | null = null;
      if (d.foto) {
        const blob = await obtenerBlob(d.foto.blobId);
        if (blob) {
          idFoto = `${pref}-f${d.id}`;
          imagenes[idFoto] = await fotoParaInforme(blob, d.medicion, `Foto ${d.numero} · ${fmtFechaHora(d.fechaHora)}`);
        }
      }
      let idMapa: string | null = null;
      if (d.gps) {
        const propio = marcadorDe(d, true)!;
        const vecinos = conGps.filter((o) => o.id !== d.id).map((o) => marcadorDe(o, false)!);
        const fondo = d.mapa ? (await obtenerBlob(d.mapa.blobId)) ?? null : null;
        const vista = d.mapa
          ? { lat: d.mapa.lat, lon: d.mapa.lon, zoom: d.mapa.zoom, w: d.mapa.w, h: d.mapa.h, escala: d.mapa.escala }
          : { lat: d.gps.lat, lon: d.gps.lon, zoom: ajustes.zoomMapa, w: MAPA_W, h: MAPA_H, escala: MAPA_ESCALA };
        idMapa = `${pref}-m${d.id}`;
        imagenes[idMapa] = await componerPlano(fondo, vista, [propio, ...vecinos]);
      }
      if (i > 0) bloques.push({ k: 'espacio', h: 6 });
      bloques.push(ficha(s, d, idFoto, idMapa, imagenes));
      hechas++;
    }
  }

  bloques.push(...anexoConvenciones());
  op.alProgreso?.('Componiendo documento', 1);

  const limpio = (p.nombre || 'proyecto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  const f = new Date();
  const sello = `${f.getFullYear()}${String(f.getMonth() + 1).padStart(2, '0')}${String(f.getDate()).padStart(2, '0')}`;
  return {
    titulo: `Informe de inspección visual – ${p.nombre}`,
    nombreArchivo: `Informe_pavimentos_${limpio}_${sello}`,
    bloques,
    imagenes,
    pieRotulo: ajustes.pieRotulo.split('\n').map((x) => x.trim()).filter(Boolean),
    advertencias,
  };
}
