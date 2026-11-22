/**
 * Representación del informe en Word (.docx) usando el archivo del rótulo como plantilla:
 * se conservan encabezado, pie de página, estilos y márgenes, y se reemplaza el cuerpo.
 */
import JSZip from 'jszip';
import plantillaUrl from '../assets/rotulo.docx?url';
import { dataUrlABytes } from '../services/imagen';
import type { Bloque, Celda, Informe, Run } from './modelo';
import { expandirRejilla } from './rejilla';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const tw = (pt: number) => Math.round(pt * 20); // puntos → twips
const emu = (pt: number) => Math.round(pt * 12700); // puntos → EMU
const hex = (c?: string) => (c ? c.replace('#', '').toUpperCase() : undefined);

interface PropsRun {
  b?: boolean;
  i?: boolean;
  color?: string;
  size?: number;
}

function rPr(p: PropsRun): string {
  let x = '';
  if (p.b) x += '<w:b/><w:bCs/>';
  if (p.i) x += '<w:i/><w:iCs/>';
  if (p.color) x += `<w:color w:val="${hex(p.color)}"/>`;
  if (p.size) x += `<w:sz w:val="${Math.round(p.size * 2)}"/><w:szCs w:val="${Math.round(p.size * 2)}"/>`;
  return x ? `<w:rPr>${x}</w:rPr>` : '';
}

function run(texto: string, p: PropsRun = {}): string {
  return `<w:r>${rPr(p)}<w:t xml:space="preserve">${esc(texto)}</w:t></w:r>`;
}

interface PropsParrafo {
  estilo?: string;
  jc?: 'left' | 'center' | 'right' | 'both';
  antes?: number;
  despues?: number;
  saltoAntes?: boolean;
  mantener?: boolean;
  sinNumero?: boolean;
}

function parrafo(contenido: string, p: PropsParrafo = {}): string {
  let pr = '';
  if (p.estilo) pr += `<w:pStyle w:val="${p.estilo}"/>`;
  if (p.mantener) pr += '<w:keepNext/>';
  if (p.saltoAntes) pr += '<w:pageBreakBefore/>';
  if (p.sinNumero) pr += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr>';
  if (p.antes != null || p.despues != null) pr += `<w:spacing w:before="${tw(p.antes ?? 0)}" w:after="${tw(p.despues ?? 0)}"/>`;
  if (p.jc) pr += `<w:jc w:val="${p.jc}"/>`;
  return `<w:p>${pr ? `<w:pPr>${pr}</w:pPr>` : ''}${contenido}</w:p>`;
}

const JC = { left: 'left', center: 'center', right: 'right', justify: 'both' } as const;

class Medios {
  archivos: { nombre: string; bytes: Uint8Array }[] = [];
  rels: string[] = [];
  private porId = new Map<string, string>();
  private n = 0;
  constructor(private inf: Informe) {}
  /** Devuelve el rId de la imagen, registrándola la primera vez. */
  rid(id: string): string {
    const ya = this.porId.get(id);
    if (ya) return ya;
    const im = this.inf.imagenes[id];
    const png = im.dataUrl.startsWith('data:image/png');
    this.n++;
    const nombre = `informe${this.n}.${png ? 'png' : 'jpeg'}`;
    const rid = `rIdInf${this.n}`;
    this.archivos.push({ nombre, bytes: dataUrlABytes(im.dataUrl) });
    this.rels.push(
      `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${nombre}"/>`,
    );
    this.porId.set(id, rid);
    return rid;
  }
  get cuenta() {
    return this.n;
  }
}

let idDibujo = 100;
function imagen(rid: string, wPt: number, hPt: number): string {
  const id = ++idDibujo;
  const cx = emu(wPt), cy = emu(hPt);
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${id}" name="Imagen ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="Imagen ${id}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

function runsXml(rs: Run[], size?: number): string {
  return rs.map((r) => run(r.t, { b: r.b, i: r.i, color: r.color, size })).join('');
}

function tabla(b: Extract<Bloque, { k: 'tabla' }>, medios: Medios): string {
  const size = b.size ?? 8;
  const n = b.anchos.length;
  const rejilla = expandirRejilla(b.filas, n);
  const total = b.anchos.reduce((a, x) => a + x, 0);
  const pv = tw(b.relleno ?? 2.5);
  let x =
    `<w:tbl><w:tblPr><w:tblW w:w="${tw(total)}" w:type="dxa"/><w:jc w:val="center"/>` +
    `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((l) => `<w:${l} w:val="single" w:sz="4" w:space="0" w:color="9A9993"/>`).join('')}</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="${pv}" w:type="dxa"/><w:left w:w="40" w:type="dxa"/><w:bottom w:w="${pv}" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar>` +
    `</w:tblPr><w:tblGrid>${b.anchos.map((w) => `<w:gridCol w:w="${tw(w)}"/>`).join('')}</w:tblGrid>`;
  rejilla.forEach((fila, fi) => {
    let trPr = '<w:cantSplit/>';
    const alto = b.altos?.[fi];
    if (alto) trPr += `<w:trHeight w:val="${tw(alto)}" w:hRule="atLeast"/>`;
    if (fi < (b.cabeceras ?? 0)) trPr += '<w:tblHeader/>';
    x += `<w:tr><w:trPr>${trPr}</w:trPr>`;
    fila.forEach((c, ci) => {
      if (c.tipo === 'h') return;
      const span = c.colSpan;
      const ancho = b.anchos.slice(ci, ci + span).reduce((a, w) => a + w, 0);
      let tcPr = `<w:tcW w:w="${tw(ancho)}" w:type="dxa"/>`;
      if (span > 1) tcPr += `<w:gridSpan w:val="${span}"/>`;
      if (c.tipo === 'v') {
        x += `<w:tc><w:tcPr>${tcPr}<w:vMerge/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p></w:tc>`;
        return;
      }
      const cel: Celda = c.celda;
      if (c.rowSpan > 1) tcPr += '<w:vMerge w:val="restart"/>';
      if (cel.fill) tcPr += `<w:shd w:val="clear" w:color="auto" w:fill="${hex(cel.fill)}"/>`;
      if (cel.vAlign === 'middle') tcPr += '<w:vAlign w:val="center"/>';
      const jc = JC[cel.align ?? 'left'];
      let dentro: string;
      if (cel.img) dentro = imagen(medios.rid(cel.img), cel.imgW ?? 100, cel.imgH ?? 100);
      else if (cel.runs) dentro = runsXml(cel.runs, cel.size ?? size);
      else dentro = run(cel.texto ?? '', { b: cel.b, color: cel.color, size: cel.size ?? size });
      // En la última fila de una tabla indivisible no se encadena con el párrafo siguiente
      const mantener = b.noPartir && fi < rejilla.length - 1;
      x += `<w:tc><w:tcPr>${tcPr}</w:tcPr>${parrafo(dentro, { jc, antes: 0, despues: 0, mantener })}</w:tc>`;
    });
    x += '</w:tr>';
  });
  return x + '</w:tbl>';
}

function cuerpo(inf: Informe, medios: Medios): string {
  let x = '';
  let salto = false;
  const p = (contenido: string, props: PropsParrafo = {}) => {
    x += parrafo(contenido, { ...props, saltoAntes: props.saltoAntes || salto });
    salto = false;
  };
  for (const b of inf.bloques) {
    switch (b.k) {
      case 'portada': {
        for (let i = 0; i < 13; i++) p('');
        p(run(b.titulo, { b: true, size: 14 }), { jc: 'center', despues: 10 });
        b.subtitulos.forEach((t, i) => p(run(t, { b: i === 0, size: i === 0 ? 12 : 10.5 }), { jc: 'center', despues: 4 }));
        for (let i = 0; i < 4; i++) p('');
        p(run('Consultor:', { size: 9 }), { jc: 'center' });
        p(run(b.consultor, { b: true }), { jc: 'center' });
        b.titulosConsultor.forEach((t) => p(run(t, { size: 9 }), { jc: 'center' }));
        for (let i = 0; i < 5; i++) p('');
        p(run(b.pie, { size: 9 }), { jc: 'center' });
        salto = true;
        break;
      }
      case 'titulo': {
        const anexo = /^Anexo/i.test(b.texto);
        p(run(b.nivel === 1 ? b.texto.toUpperCase() : b.texto, b.nivel === 2 ? { b: true } : {}), {
          estilo: `Ttulo${b.nivel}`,
          saltoAntes: b.saltoAntes,
          antes: b.nivel === 1 ? 4 : 10,
          despues: 6,
          sinNumero: anexo,
        });
        break;
      }
      case 'parrafo':
        p(runsXml(b.runs, b.size), { jc: JC[b.align ?? 'justify'], antes: 2, despues: 6 });
        break;
      case 'lista':
        for (const t of b.items) {
          x += `<w:p><w:pPr>${salto ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="0" w:after="60"/><w:ind w:left="284" w:hanging="170"/><w:jc w:val="both"/></w:pPr>${run('•  ' + t)}</w:p>`;
          salto = false;
        }
        break;
      case 'tabla':
        if (salto) p('', { antes: 0, despues: 0 });
        x += tabla(b, medios);
        // Word exige un párrafo entre tablas consecutivas
        x += '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>';
        break;
      case 'imagen':
        p(imagen(medios.rid(b.id), b.w, b.h), { jc: 'center', antes: 2, despues: 2, mantener: true });
        break;
      case 'pie':
        p(run(b.texto, { size: 8 }), { jc: 'center', antes: 4, despues: 5 });
        break;
      case 'salto':
        salto = true;
        break;
      case 'espacio':
        x += `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${tw(b.h)}" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>`;
        break;
    }
  }
  return x;
}

/** Arma el .docx a partir de los bytes de la plantilla (separado de la descarga para poder probarlo). */
export async function armarDocx(inf: Informe, plantilla: ArrayBuffer | Uint8Array): Promise<Blob> {
  const zip = await JSZip.loadAsync(plantilla);
  const doc = await zip.file('word/document.xml')!.async('string');
  const iniCuerpo = doc.indexOf('<w:body>') + '<w:body>'.length;
  const iniSect = doc.lastIndexOf('<w:sectPr');
  const finSect = doc.indexOf('</w:sectPr>', iniSect) + '</w:sectPr>'.length;
  if (iniCuerpo < 8 || iniSect < 0) throw new Error('La plantilla del rótulo no tiene la estructura esperada.');
  const medios = new Medios(inf);
  const xml = doc.slice(0, iniCuerpo) + cuerpo(inf, medios) + doc.slice(iniSect, finSect) + '</w:body></w:document>';
  zip.file('word/document.xml', xml);

  for (const a of medios.archivos) zip.file(`word/media/${a.nombre}`, a.bytes);
  const rutaRels = 'word/_rels/document.xml.rels';
  const rels = await zip.file(rutaRels)!.async('string');
  zip.file(rutaRels, rels.replace('</Relationships>', medios.rels.join('') + '</Relationships>'));

  const rutaTipos = '[Content_Types].xml';
  let tipos = await zip.file(rutaTipos)!.async('string');
  for (const [ext, mime] of [['png', 'image/png'], ['jpeg', 'image/jpeg']]) {
    if (!new RegExp(`Extension="${ext}"`, 'i').test(tipos))
      tipos = tipos.replace('<Default ', `<Default Extension="${ext}" ContentType="${mime}"/><Default `);
  }
  zip.file(rutaTipos, tipos);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

export async function generarDocx(inf: Informe): Promise<Blob> {
  const plantilla = await (await fetch(plantillaUrl)).arrayBuffer();
  return armarDocx(inf, plantilla);
}
