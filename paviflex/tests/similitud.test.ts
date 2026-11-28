import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import { TIPOS_DANO } from '../src/domain/catalogo';
import { FIGURA_DE, type FiguraManual } from '../src/domain/figuras';
import { DIM, FAMILIAS, describir, familiaDe, sugerir } from '../src/domain/similitud';

const DIR = join(__dirname, '../src/assets/manual');
const figuras: FiguraManual[] = JSON.parse(readFileSync(join(DIR, 'figuras.json'), 'utf8'));

/** Fotografía cenital sintética de pavimento, con textura determinista y la regla naranja. */
function pavimento(dibujar: (x: number, y: number) => number | null, semilla = 1, w = 480, h = 360) {
  const d = new Uint8ClampedArray(w * h * 4);
  let s = semilla;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      let g = 105 + (rnd() - 0.5) * 34;
      const marca = dibujar(x, y);
      if (marca != null) g = marca + (rnd() - 0.5) * 10;
      d[p] = g; d[p + 1] = g; d[p + 2] = g + 3; d[p + 3] = 255;
      if (y > h - 34 && y < h - 24 && x > 60 && x < 300) { d[p] = 255; d[p + 1] = 106; d[p + 2] = 19; } // regla
    }
  return { d, w, h };
}
const fisura = (desfase = 0) => pavimento((x, y) => (Math.abs(y - (150 + desfase + 18 * Math.sin(x / 55))) < 2.2 ? 28 : null), 3 + desfase);
const red = (paso = 46, semilla = 5) => pavimento((x, y) => {
  const u = x + 9 * Math.sin(y / 23), v = y + 9 * Math.sin(x / 19);
  return x > 50 && x < 430 && y > 30 && y < 300 && (u % paso < 2.6 || v % paso < 2.6) ? 30 : null;
}, semilla);
const bache = (cx = 240, semilla = 7) => pavimento((x, y) => (((x - cx) / 95) ** 2 + ((y - 160) / 62) ** 2 < 1 ? 38 : null), semilla);
const sano = () => pavimento(() => null, 11);
const desc = (f: { d: Uint8ClampedArray; w: number; h: number }) => describir(f.d, f.w, f.h);
const familias = (d: number[], propios = [] as { codigo: string; descriptor: number[] }[]) => sugerir(d, propios).map((s) => familiaDe(s.codigo)!.id);

describe('sugerencia del tipo de daño a partir de la fotografía', () => {
  it('cada tipo de daño tiene su figura del manual y su familia visual', () => {
    expect(figuras.length).toBe(28);
    for (const t of TIPOS_DANO) {
      expect(FIGURA_DE[t.codigo], t.codigo).toBeGreaterThan(0);
      expect(familiaDe(t.codigo), t.codigo).toBeDefined();
    }
    expect(FAMILIAS.flatMap((f) => f.codigos).sort()).toEqual(TIPOS_DANO.map((t) => t.codigo).sort());
    for (const f of figuras) for (const r of f.fotos) expect(r.x + r.w <= f.w && r.y + r.h <= f.h).toBe(true);
  });
  it('el descriptor tiene la dimensión esperada y valores entre 0 y 1', () => {
    for (const f of [fisura(), red(), bache(), sano()]) {
      const d = desc(f);
      expect(d.length).toBe(DIM);
      expect(d.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
    }
  });
  it('lee la estructura de fotografías cenitales claras', () => {
    expect(familias(desc(fisura()))[0]).toBe('lineal');
    expect(familias(desc(red()))[0]).toBe('red');
    expect(familias(desc(bache()))[0]).toBe('perdida');
    expect(familias(desc(sano()))[0]).toBe('textura');
  });
  it('entrega tres sugerencias de familias distintas, con sus variantes', () => {
    const s = sugerir(desc(red()));
    expect(s.length).toBe(3);
    expect(s[0].codigo).toBe('PC');
    expect(s[0].variantes.sort()).toEqual(['FB', 'FIN']);
    expect(new Set(s.map((x) => familiaDe(x.codigo)!.id)).size).toBe(3);
  });
  it('aprende de los registros que el inspector ya clasificó', () => {
    // Sin ejemplos, una mancha oscura se propone como bache
    expect(sugerir(desc(bache(240, 7)))[0].codigo).toBe('BCH');
    // El inspector clasificó una mancha así como parche; la siguiente parecida se propone como parche
    const propios = [{ codigo: 'PCH', descriptor: desc(bache(240, 7)) }];
    const s = sugerir(desc(bache(250, 9)), propios);
    expect(s[0].codigo).toBe('PCH');
    expect(s[0].porEjemploPropio).toBe(true);
    // ...sin alterar la lectura de fotografías distintas
    expect(sugerir(desc(fisura()), propios)[0].codigo).toBe('FL');
    // Dentro de una misma familia, el ejemplo propio decide la sigla
    const transversal = [{ codigo: 'FT', descriptor: desc(fisura(0)) }];
    expect(sugerir(desc(fisura(6)), transversal)[0].codigo).toBe('FT');
  });
  it('medición sobre las fotografías del manual (referencia, no garantía)', () => {
    // Las fotografías del manual son vistas oblicuas de la vía, no cenitales: sirven para saber
    // cuánto se puede esperar de la lectura por reglas antes de que el inspector aporte ejemplos.
    const leer = (r: string) => jpeg.decode(readFileSync(r), { useTArray: true });
    let total = 0, primera = 0, entreTres = 0;
    const evaluar = (rgba: Uint8Array, w: number, h: number, codigo: string) => {
      const fams = familias(describir(rgba, w, h));
      const pos = fams.indexOf(familiaDe(codigo)!.id);
      total++;
      if (pos === 0) primera++;
      if (pos >= 0) entreTres++;
    };
    for (const f of figuras) {
      const img = leer(join(DIR, `fig${String(f.num).padStart(2, '0')}.jpg`));
      const codigo = Object.entries(FIGURA_DE).find(([, n]) => n === f.num)![0];
      for (const r of f.fotos) {
        const rec = new Uint8Array(r.w * r.h * 4);
        for (let y = 0; y < r.h; y++) rec.set(img.data.subarray(((r.y + y) * img.width + r.x) * 4, ((r.y + y) * img.width + r.x + r.w) * 4), y * r.w * 4);
        evaluar(rec, r.w, r.h, codigo);
      }
    }
    for (const [archivo, codigo] of [['val2_DC.jpg', 'DC'], ['val3_CVB.jpg', 'CVB'], ['val4_PC.jpg', 'PC']]) {
      const img = leer(join(__dirname, 'fotos', archivo));
      evaluar(img.data, img.width, img.height, codigo);
    }
    console.log(`\nFotografías del manual: familia correcta primera en ${primera}/${total}, entre las tres en ${entreTres}/${total}`);
    expect(total).toBe(36);
  });
});
