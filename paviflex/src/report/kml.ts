/**
 * Exportación de los puntos de inspección a KML y KMZ (Google Earth, QGIS, ArcGIS…).
 * Cada daño con coordenadas es un punto en WGS84 con todos los atributos recolectados, tanto en una
 * tabla legible (descripción) como en campos con tipo (ExtendedData), agrupados por sector.
 * El KMZ incluye además la fotografía anotada de cada punto y sus propios iconos.
 */
import JSZip from 'jszip';
import type { Dano, Proyecto, Sector } from '../domain/types';
import { CATEGORIAS, NOMBRE_SEVERIDAD, nombreCarril, siglaRegistro, tipoDano } from '../domain/catalogo';
import { ordenarDanos } from '../domain/analisis';
import { descripcionAutomatica, fmtFechaHora, fmtNum, fmtPR, magnitud, textoDimensiones } from '../domain/formato';
import { aEpsg9377 } from '../domain/geo';
import { COLOR_SEV } from '../ui/colores';

export interface DatosKml {
  proyecto: Proyecto;
  sectores: { sector: Sector; danos: Dano[] }[];
}

export interface OpcionesKml {
  /** Ruta de la fotografía de cada daño dentro del KMZ (por id del daño) */
  fotos?: Map<string, string>;
  /** Carpeta de iconos propios dentro del KMZ; sin ella se usa el icono estándar de Google Earth */
  iconos?: string;
}

const esc = (s: string) =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
/** Color KML: aabbggrr */
const colorKml = (hex: string) => 'ff' + hex.slice(5, 7) + hex.slice(3, 5) + hex.slice(1, 3);

type Tipo = 'string' | 'int' | 'double';
/** Campos de la tabla de atributos, en orden. */
const CAMPOS: [string, Tipo, string][] = [
  ['proyecto', 'string', 'Proyecto'],
  ['sector', 'string', 'Sector'],
  ['foto', 'int', 'Fotografía No.'],
  ['sigla', 'string', 'Sigla del daño'],
  ['tipo_dano', 'string', 'Tipo de daño'],
  ['categoria', 'string', 'Categoría'],
  ['severidad', 'string', 'Severidad'],
  ['abscisa', 'string', 'Abscisa'],
  ['abscisa_m', 'double', 'Abscisa (m)'],
  ['carril', 'string', 'Carril'],
  ['en_berma', 'string', 'En berma'],
  ['largo_m', 'double', 'Largo (m)'],
  ['ancho_m', 'double', 'Ancho (m)'],
  ['area_m2', 'double', 'Área para el análisis (m²)'],
  ['dimensiones', 'string', 'Dimensiones'],
  ['rep_largo_m', 'double', 'Reparación: largo (m)'],
  ['rep_ancho_m', 'double', 'Reparación: ancho (m)'],
  ['aclaraciones', 'string', 'Aclaraciones'],
  ['descripcion', 'string', 'Descripción'],
  ['fecha_hora', 'string', 'Fecha y hora'],
  ['este_9377', 'double', 'Este EPSG:9377 (m)'],
  ['norte_9377', 'double', 'Norte EPSG:9377 (m)'],
  ['latitud', 'double', 'Latitud'],
  ['longitud', 'double', 'Longitud'],
  ['precision_m', 'double', 'Precisión GNSS (m)'],
  ['altitud_m', 'double', 'Altitud (m)'],
];

function atributos(p: Proyecto, s: Sector, d: Dano): Record<string, string | number | null> {
  const t = tipoDano(d.tipo);
  const en = aEpsg9377(d.gps!.lat, d.gps!.lon);
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    proyecto: p.nombre,
    sector: s.nombre,
    foto: d.numero,
    sigla: d.tipo ? siglaRegistro(d.tipo, d.enBerma) : '',
    tipo_dano: t?.nombre ?? '',
    categoria: t ? CATEGORIAS.find((c) => c.id === t.categoria)?.nombre ?? '' : '',
    severidad: t?.severidades ? (d.severidad ? NOMBRE_SEVERIDAD[d.severidad] : 'Sin asignar') : t ? 'Sin grado' : '',
    abscisa: d.abscisa != null ? fmtPR(d.abscisa) : '',
    abscisa_m: d.abscisa,
    carril: d.carril,
    en_berma: d.enBerma || t?.propioDeBerma ? 'Sí' : 'No',
    largo_m: d.largo,
    ancho_m: d.ancho,
    area_m2: t ? r3(magnitud(d).area) : null,
    dimensiones: t ? textoDimensiones(d) : '',
    rep_largo_m: d.repLargo,
    rep_ancho_m: d.repAncho,
    aclaraciones: d.aclaraciones,
    descripcion: d.descripcion || descripcionAutomatica(d),
    fecha_hora: d.fechaHora,
    este_9377: r3(en.este),
    norte_9377: r3(en.norte),
    latitud: d.gps!.lat,
    longitud: d.gps!.lon,
    precision_m: d.gps!.precision,
    altitud_m: d.gps!.altitud,
  };
}

function descripcionHtml(p: Proyecto, s: Sector, d: Dano, foto?: string): string {
  const t = tipoDano(d.tipo);
  const a = atributos(p, s, d);
  const fila = (k: string, v: string) => (v ? `<tr><td style="padding:2px 8px 2px 0;color:#555;vertical-align:top">${esc(k)}</td><td style="padding:2px 0"><b>${esc(v)}</b></td></tr>` : '');
  return (
    `<div style="font-family:Arial,sans-serif;font-size:13px;max-width:480px">` +
    (foto ? `<img src="${esc(foto)}" width="460" style="max-width:100%;border-radius:4px"/><br/>` : '') +
    `<table style="border-collapse:collapse;margin-top:6px">` +
    fila('Daño', `${a.sigla} · ${a.tipo_dano}`) +
    fila('Severidad', String(a.severidad)) +
    fila('Sector', s.nombre) +
    fila('Abscisa', String(a.abscisa)) +
    fila('Localización', d.enBerma && !t?.propioDeBerma ? `Berma, ${nombreCarril(d.carril)}` : nombreCarril(d.carril)) +
    fila('Dimensiones', String(a.dimensiones)) +
    fila('Reparación', d.repLargo != null && d.repAncho != null ? `${fmtNum(d.repLargo)} m × ${fmtNum(d.repAncho)} m` : '') +
    fila('EPSG:9377', `E ${fmtNum(a.este_9377 as number, 3)} m · N ${fmtNum(a.norte_9377 as number, 3)} m`) +
    fila('Geográficas', `${d.gps!.lat.toFixed(6)}°, ${d.gps!.lon.toFixed(6)}°${d.gps!.precision != null ? ` (± ${fmtNum(d.gps!.precision, 1)} m)` : ''}`) +
    fila('Fecha y hora', fmtFechaHora(d.fechaHora)) +
    fila('Aclaraciones', d.aclaraciones) +
    `</table><p style="margin:6px 0 0">${esc(String(a.descripcion))}</p></div>`
  );
}

const CLAVES_ESTILO = ['B', 'M', 'A', 'N'] as const;
const ICONO_GOOGLE = 'http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png';

/** Puntos exportables: los daños con coordenadas. */
export function contarPuntos(datos: DatosKml): { conPunto: number; sinCoordenadas: number } {
  const todos = datos.sectores.flatMap((s) => s.danos);
  const conPunto = todos.filter((d) => d.gps).length;
  return { conPunto, sinCoordenadas: todos.length - conPunto };
}

export function generarKml(datos: DatosKml, op: OpcionesKml = {}): string {
  const { proyecto: p } = datos;
  const x: string[] = [];
  x.push('<?xml version="1.0" encoding="UTF-8"?>');
  x.push('<kml xmlns="http://www.opengis.net/kml/2.2">');
  x.push('<Document>');
  x.push(`<name>${esc(p.nombre || 'Inspección de pavimentos')}</name>`);
  x.push(
    `<description>${cdata(
      `Puntos de inspección visual de pavimentos flexibles. ${[p.nombreVia, p.codigoVia ? `código ${p.codigoVia}` : '', p.entidad].filter(Boolean).join(' · ')}. ` +
        'Coordenadas WGS84 (equivalentes a MAGNA-SIRGAS); los campos este_9377 y norte_9377 están en EPSG:9377. Generado con PaviFlex.',
    )}</description>`,
  );
  x.push('<Schema name="DanoPavimento" id="DanoPavimento">');
  for (const [nombre, tipo, rotulo] of CAMPOS) x.push(`<SimpleField name="${nombre}" type="${tipo}"><displayName>${esc(rotulo)}</displayName></SimpleField>`);
  x.push('</Schema>');
  for (const k of CLAVES_ESTILO) {
    const c = COLOR_SEV[k].fondo;
    // Con icono propio (KMZ) el color ya viene en la imagen; con el icono estándar se tiñe
    const icono = op.iconos ? `<Icon><href>${op.iconos}/sev-${k}.png</href></Icon>` : `<color>${colorKml(c)}</color><Icon><href>${ICONO_GOOGLE}</href></Icon>`;
    x.push(`<Style id="sev-${k}"><IconStyle><scale>1.2</scale>${icono}</IconStyle><LabelStyle><scale>0.85</scale></LabelStyle><BalloonStyle><text>${cdata('<b>$[name]</b><br/>$[description]')}</text></BalloonStyle></Style>`);
  }
  for (const { sector: s, danos } of datos.sectores) {
    const puntos = ordenarDanos(danos).filter((d) => d.gps);
    x.push('<Folder>');
    x.push(`<name>${esc(s.nombre)}</name>`);
    x.push(`<description>${cdata(`${fmtPR(s.prInicial)} a ${fmtPR(s.prFinal)} · ${puntos.length} puntos${danos.length > puntos.length ? ` (${danos.length - puntos.length} registros sin coordenadas no se exportan)` : ''}`)}</description>`);
    for (const d of puntos) {
      const t = tipoDano(d.tipo);
      const estilo = t?.severidades && d.severidad ? d.severidad : 'N';
      const a = atributos(p, s, d);
      x.push('<Placemark>');
      x.push(`<name>${esc(`${d.numero} · ${a.sigla || 'sin tipo'}`)}</name>`);
      x.push(`<description>${cdata(descripcionHtml(p, s, d, op.fotos?.get(d.id)))}</description>`);
      if (d.fechaHora) x.push(`<TimeStamp><when>${esc(d.fechaHora)}</when></TimeStamp>`);
      x.push(`<styleUrl>#sev-${estilo}</styleUrl>`);
      x.push('<ExtendedData><SchemaData schemaUrl="#DanoPavimento">');
      for (const [nombre] of CAMPOS) {
        const v = a[nombre];
        if (v == null || v === '') continue;
        x.push(`<SimpleData name="${nombre}">${esc(String(v))}</SimpleData>`);
      }
      x.push('</SchemaData></ExtendedData>');
      const alt = d.gps!.altitud;
      x.push(`<Point><coordinates>${d.gps!.lon.toFixed(8)},${d.gps!.lat.toFixed(8)}${alt != null ? ',' + alt.toFixed(2) : ''}</coordinates></Point>`);
      x.push('</Placemark>');
    }
    x.push('</Folder>');
  }
  x.push('</Document>');
  x.push('</kml>');
  return x.join('\n');
}

export const MIME_KML = 'application/vnd.google-earth.kml+xml';
export const MIME_KMZ = 'application/vnd.google-earth.kmz';

export function nombreArchivoKml(p: Proyecto, sector?: Sector): string {
  const limpio = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 36);
  const f = new Date();
  const sello = `${f.getFullYear()}${String(f.getMonth() + 1).padStart(2, '0')}${String(f.getDate()).padStart(2, '0')}`;
  return `Puntos_${limpio(p.nombre) || 'proyecto'}${sector ? '_' + limpio(sector.nombre) : ''}_${sello}`;
}

/**
 * KMZ: el KML más la fotografía anotada de cada punto y los iconos por severidad.
 * `fotoDe` entrega la fotografía (JPEG) de un daño, o null si no tiene.
 */
export async function generarKmz(
  datos: DatosKml,
  fotoDe: (d: Dano) => Promise<Uint8Array | null>,
  iconoDe: (color: string) => Promise<Uint8Array>,
  alProgreso?: (hechos: number, total: number) => void,
): Promise<Blob> {
  const zip = new JSZip();
  const fotos = new Map<string, string>();
  const puntos = datos.sectores.flatMap((s) => s.danos.filter((d) => d.gps));
  let hechos = 0;
  for (const d of puntos) {
    const bytes = await fotoDe(d);
    if (bytes) {
      const ruta = `fotos/foto_${String(d.numero).padStart(3, '0')}_${d.id.slice(0, 8)}.jpg`;
      zip.file(ruta, bytes);
      fotos.set(d.id, ruta);
    }
    alProgreso?.(++hechos, puntos.length);
  }
  for (const k of CLAVES_ESTILO) zip.file(`iconos/sev-${k}.png`, await iconoDe(COLOR_SEV[k].fondo));
  // El KML principal debe ser el primer archivo .kml en la raíz del KMZ
  zip.file('doc.kml', generarKml(datos, { fotos, iconos: 'iconos' }));
  return zip.generateAsync({ type: 'blob', mimeType: MIME_KMZ, compression: 'DEFLATE' });
}
