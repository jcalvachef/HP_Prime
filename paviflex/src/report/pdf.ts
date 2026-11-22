/** Representación del informe en PDF (pdfmake) sobre el fondo del rótulo. */
import fondoUrl from '../assets/rotulo-fondo.jpg';
import { blobADataUrl } from '../services/imagen';
import { ANCHO_UTIL, PAGINA, type Bloque, type Celda, type Informe, type Run } from './modelo';
import { expandirRejilla } from './rejilla';

type Nodo = Record<string, unknown>;

const BORDE = '#9a9993';

function runs(rs: Run[]): Nodo[] {
  return rs.map((r) => ({ text: r.t, bold: r.b, italics: r.i, color: r.color }));
}

function contenidoCelda(c: Celda, size: number): Nodo {
  const base: Nodo = {
    fillColor: c.fill,
    alignment: c.align ?? 'left',
    verticalAlignment: c.vAlign === 'middle' ? 'middle' : undefined,
  };
  if (c.img) return { ...base, image: c.img, width: c.imgW, height: c.imgH };
  return {
    ...base,
    text: c.runs ? runs(c.runs) : c.texto ?? '',
    bold: c.b,
    color: c.color,
    fontSize: c.size ?? size,
  };
}

function tabla(b: Extract<Bloque, { k: 'tabla' }>): Nodo {
  const size = b.size ?? 8;
  const rejilla = expandirRejilla(b.filas, b.anchos.length);
  const body = rejilla.map((fila) =>
    fila.map((x) => {
      if (x.tipo !== 'real') return {};
      const n = contenidoCelda(x.celda, size);
      if (x.colSpan > 1) n.colSpan = x.colSpan;
      if (x.rowSpan > 1) n.rowSpan = x.rowSpan;
      return n;
    }),
  );
  const pv = b.relleno ?? 2.5;
  // pdfmake suma el relleno horizontal y las líneas al ancho de cada columna
  const ph = 3;
  const anchos = b.anchos.map((w) => Math.max(4, w - 2 * ph - 0.5));
  return {
    table: {
      widths: anchos,
      body,
      headerRows: b.cabeceras ?? 0,
      keepWithHeaderRows: b.cabeceras ? 1 : 0,
      dontBreakRows: true,
      heights: b.altos ? (i: number) => b.altos![i] ?? 0 : undefined,
    },
    unbreakable: b.noPartir || undefined,
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => BORDE,
      vLineColor: () => BORDE,
      paddingLeft: () => ph,
      paddingRight: () => ph,
      paddingTop: () => pv,
      paddingBottom: () => pv,
    },
  };
}

export function definicionPdf(inf: Informe, fondo: string): Nodo {
  const contenido: Nodo[] = [];
  const cuenta = [0, 0, 0];
  let salto = false;
  const agregar = (n: Nodo) => {
    if (salto) {
      n.pageBreak = 'before';
      salto = false;
    }
    contenido.push(n);
  };
  const pie = (texto: string, titulo: boolean): Nodo => ({ text: texto, fontSize: 8, alignment: 'center', color: '#262626', margin: [0, 5, 0, 5], headlineLevel: titulo ? 9 : undefined });
  for (let i = 0; i < inf.bloques.length; i++) {
    const b = inf.bloques[i];
    switch (b.k) {
      case 'portada':
        agregar({
          stack: [
            { text: b.titulo, fontSize: 14, bold: true, alignment: 'center', margin: [0, 150, 0, 14] },
            ...b.subtitulos.map((t, i) => ({ text: t, fontSize: i === 0 ? 12 : 10.5, bold: i === 0, alignment: 'center', margin: [0, 0, 0, 5] })),
            { text: 'Consultor:', fontSize: 9, alignment: 'center', margin: [0, 58, 0, 2] },
            { text: b.consultor, fontSize: 10, bold: true, alignment: 'center' },
            ...b.titulosConsultor.map((t) => ({ text: t, fontSize: 9, alignment: 'center' })),
            { text: b.pie, fontSize: 9, alignment: 'center', margin: [0, 70, 0, 0] },
          ],
        });
        salto = true;
        break;
      case 'titulo': {
        cuenta[b.nivel - 1]++;
        for (let i = b.nivel; i < 3; i++) cuenta[i] = 0;
        const esAnexo = /^Anexo/i.test(b.texto);
        if (esAnexo) cuenta[0]--;
        const numero = esAnexo ? '' : cuenta.slice(0, b.nivel).join('.') + (b.nivel === 1 ? '.' : '') + '  ';
        if (b.saltoAntes) salto = true;
        agregar({
          text: numero + (b.nivel === 1 ? b.texto.toUpperCase() : b.texto),
          fontSize: b.nivel === 1 ? 11 : 10,
          bold: b.nivel <= 2,
          color: b.nivel === 1 ? '#000000' : '#262626',
          margin: [0, b.nivel === 1 || b.saltoAntes ? 2 : 10, 0, 6],
          headlineLevel: b.nivel,
        });
        break;
      }
      case 'parrafo':
        agregar({ text: runs(b.runs), fontSize: b.size ?? 10, alignment: b.align ?? 'justify', margin: [0, 2, 0, 6], lineHeight: 1.15 });
        break;
      case 'lista':
        agregar({ ul: b.items.map((t) => ({ text: t, alignment: 'justify', margin: [0, 0, 0, 3] })), fontSize: 10, margin: [4, 0, 0, 6], lineHeight: 1.12 });
        break;
      case 'tabla':
        agregar(tabla(b));
        break;
      case 'imagen': {
        const img: Nodo = { image: b.id, width: Math.min(b.w, ANCHO_UTIL), height: b.h * Math.min(1, ANCHO_UTIL / b.w), alignment: 'center', margin: [0, 2, 0, 2] };
        const sig = inf.bloques[i + 1];
        if (sig?.k === 'pie') {
          // La figura y su pie se mantienen en la misma página
          agregar({ unbreakable: true, stack: [img, pie(sig.texto, false)] });
          i++;
        } else agregar(img);
        break;
      }
      case 'pie':
        // Un pie que antecede a una tabla actúa como su título: no debe quedar huérfano
        agregar(pie(b.texto, inf.bloques[i + 1]?.k === 'tabla'));
        break;
      case 'salto':
        salto = true;
        break;
      case 'espacio':
        agregar({ text: '', margin: [0, 0, 0, b.h] });
        break;
    }
  }
  const imagenes: Record<string, string> = { fondo };
  for (const [id, im] of Object.entries(inf.imagenes)) imagenes[id] = im.dataUrl;
  return {
    pageSize: 'LETTER',
    pageMargins: [PAGINA.margenIzq, PAGINA.margenSup, PAGINA.margenDer, PAGINA.margenInf],
    info: { title: inf.titulo, subject: 'Inspección visual de pavimentos flexibles', creator: 'PaviFlex' },
    background: () => ({ image: 'fondo', width: PAGINA.ancho, height: PAGINA.alto }),
    // Pie como en la plantilla Word: número de página y datos de contacto a la derecha
    footer: (pagina: number) => ({
      columns: [
        { width: 246.7, text: '' },
        { width: 102, text: `pág. ${pagina}`, alignment: 'center', fontSize: 9, margin: [0, 41, 0, 0] },
        { width: 96, text: '' },
        { width: 160, stack: inf.pieRotulo.map((t) => ({ text: t, fontSize: 9, lineHeight: 1.05 })), margin: [0, 16, 0, 0] },
      ],
    }),
    // Un título o un pie de tabla no puede quedar solo al final de la página
    pageBreakBefore: (nodo: { headlineLevel?: number }, consultas: { getFollowingNodesOnPage(): { headlineLevel?: number }[] }) =>
      !!nodo.headlineLevel && consultas.getFollowingNodesOnPage().every((n) => !!n.headlineLevel),
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#0b0b0b' },
    content: contenido,
    images: imagenes,
  };
}

let fondoCache: Promise<string> | null = null;
function cargarFondo(): Promise<string> {
  if (!fondoCache) fondoCache = fetch(fondoUrl).then((r) => r.blob()).then(blobADataUrl);
  return fondoCache;
}

export async function generarPdf(inf: Informe): Promise<Blob> {
  const [{ default: pdfMake }, { default: vfs }, fondo] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
    cargarFondo(),
  ]);
  const pm = pdfMake as unknown as {
    addVirtualFileSystem(v: unknown): void;
    addFonts(f: unknown): void;
    createPdf(d: unknown): { getBlob(): Promise<Blob> };
  };
  pm.addVirtualFileSystem(vfs);
  pm.addFonts({
    Roboto: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf',
      bolditalics: 'Roboto-MediumItalic.ttf',
    },
  });
  return pm.createPdf(definicionPdf(inf, fondo)).getBlob();
}
