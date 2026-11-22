import type { Dano } from './types';
import {
  ANCHO_REF_FISURAS,
  NOMBRE_SEVERIDAD,
  nombreCarril,
  siglaRegistro,
  tipoDano,
} from './catalogo';

/** 63400 → "PR63+400" */
export function fmtPR(m: number | null | undefined, prefijo = true): string {
  if (m == null || !isFinite(m)) return '';
  const total = Math.round(m);
  const km = Math.floor(total / 1000);
  const resto = total - km * 1000;
  return `${prefijo ? 'PR' : ''}${km}+${String(resto).padStart(3, '0')}`;
}

/** Acepta "63+400", "PR63+400", "PR 63 + 400", "63400", "63,4" (km) → metros. null si no es válido. */
export function parsePR(texto: string): number | null {
  const t = texto.trim().toUpperCase().replace(/^PR\s*/, '').replace(/\s+/g, '');
  if (!t) return null;
  const m = /^(\d+)\+(\d+(?:[.,]\d+)?)$/.exec(t);
  if (m) {
    const v = parseInt(m[1], 10) * 1000 + parseFloat(m[2].replace(',', '.'));
    return isFinite(v) ? v : null;
  }
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return null;
}

export function fmtNum(v: number | null | undefined, dec = 2): string {
  if (v == null || !isFinite(v)) return '';
  return v.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: dec });
}

export function fmtFijo(v: number | null | undefined, dec = 2): string {
  if (v == null || !isFinite(v)) return '';
  return v.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function fmtPct(fraccion: number, dec = 1): string {
  if (!isFinite(fraccion)) return '';
  return (fraccion * 100).toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' %';
}

export function parseNum(texto: string): number | null {
  const t = texto.trim().replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  return isFinite(v) ? v : null;
}

export function fmtFecha(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtFechaHora(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return (
    d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
}

export function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Magnitud del daño en su unidad propia y área equivalente para el análisis (m²).
 * Fisuras lineales: longitud × 0,6 m. Daños de área: largo × ancho.
 * Daños de longitud sin área (CVB, SB, AFA) y AFI: área equivalente nula.
 */
export function magnitud(d: Pick<Dano, 'tipo' | 'largo' | 'ancho'>): {
  valor: number;
  unidad: 'm' | 'm2' | 'n';
  area: number;
} {
  const t = tipoDano(d.tipo);
  const largo = d.largo ?? 0;
  const ancho = d.ancho ?? 0;
  if (!t) return { valor: largo * ancho, unidad: 'm2', area: largo * ancho };
  if (t.unidad === 'm2') return { valor: largo * ancho, unidad: 'm2', area: largo * ancho };
  if (t.unidad === 'm') return { valor: largo, unidad: 'm', area: t.lineal ? largo * ANCHO_REF_FISURAS : 0 };
  return { valor: 1, unidad: 'n', area: 0 };
}

export function textoDimensiones(d: Pick<Dano, 'tipo' | 'largo' | 'ancho'>): string {
  const t = tipoDano(d.tipo);
  const mg = magnitud(d);
  if (!t) return '';
  if (t.unidad === 'm2') {
    if (d.largo == null || d.ancho == null) return 'sin dimensiones';
    return `${fmtNum(d.largo)} m × ${fmtNum(d.ancho)} m = ${fmtNum(mg.area)} m²`;
  }
  if (t.unidad === 'm') {
    if (d.largo == null) return 'sin dimensiones';
    return t.lineal
      ? `${fmtNum(d.largo)} m (área equivalente ${fmtNum(mg.area)} m²)`
      : `${fmtNum(d.largo)} m`;
  }
  return '1 vez';
}

/** Descripción técnica generada a partir del registro y de las definiciones del manual. */
export function descripcionAutomatica(d: Dano): string {
  const t = tipoDano(d.tipo);
  if (!t) return '';
  const partes: string[] = [];
  const sigla = siglaRegistro(d.tipo, d.enBerma);
  const donde = d.enBerma && !t.propioDeBerma ? 'en la berma' : `en ${articuloCarril(d.carril)}`;
  let p1 = `${t.nombre} (${sigla})`;
  if (t.severidades && d.severidad) p1 += ` de severidad ${NOMBRE_SEVERIDAD[d.severidad].toLowerCase()}`;
  p1 += `, ${donde}`;
  if (d.abscisa != null) p1 += `, abscisa ${fmtPR(d.abscisa)}`;
  p1 += '.';
  partes.push(p1);

  if (t.unidad === 'm2' && d.largo != null && d.ancho != null) {
    partes.push(
      `Área afectada de ${fmtNum(d.largo * d.ancho)} m² (${fmtNum(d.largo)} m de largo por ${fmtNum(d.ancho)} m de ancho).`,
    );
  } else if (t.unidad === 'm' && d.largo != null) {
    partes.push(
      t.lineal
        ? `Longitud de ${fmtNum(d.largo)} m (área equivalente de ${fmtNum(d.largo * ANCHO_REF_FISURAS)} m² con ancho de referencia de 0,6 m).`
        : `Longitud afectada de ${fmtNum(d.largo)} m.`,
    );
  }
  if (t.severidades && d.severidad) {
    partes.push(`Criterio de severidad: ${minusculaInicial(t.severidades[d.severidad])}`);
  }
  if (t.evolucion) partes.push(`Evolución probable: ${minusculaInicial(t.evolucion)}`);
  return partes.join(' ');
}

function articuloCarril(c: string): string {
  if (c === 'C') return 'toda la calzada';
  if (c === 'E') return 'el eje de la vía';
  if (c === 'D') return 'el carril derecho';
  if (c === 'I') return 'el carril izquierdo';
  return c ? `el ${nombreCarril(c)}` : 'la calzada';
}

function minusculaInicial(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function recortar(texto: string, max: number): string {
  const t = texto.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  const ultimo = corte.lastIndexOf(' ');
  return (ultimo > max * 0.6 ? corte.slice(0, ultimo) : corte).replace(/[,;:.]$/, '') + '…';
}
