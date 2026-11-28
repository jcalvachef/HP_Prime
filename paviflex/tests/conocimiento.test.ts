import { describe, expect, it } from 'vitest';
import {
  DIM_VECTOR,
  MODELO_VISION,
  autoevaluar,
  calibrar,
  conteoPorCodigo,
  leer,
  leerArchivoConocimiento,
  normalizar,
  serializarConocimiento,
  similitud,
  type EjemploConocimiento,
} from '../src/domain/conocimiento';

/** Vector de prueba: un "centro" por tipo de daño más ruido determinista. */
function vector(centro: number, ruido: number, semilla: number): Float32Array {
  let s = semilla;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5;
  const v = new Float32Array(DIM_VECTOR);
  for (let i = 0; i < DIM_VECTOR; i++) v[i] = (i % 7 === centro ? 1 : 0.15) + ruido * rnd();
  return normalizar(v);
}
let n = 0;
const ej = (codigo: string, centro: number, ruido = 0.25): EjemploConocimiento => ({ id: 'e' + ++n, codigo, vector: vector(centro, ruido, 100 + n), fecha: '2026-11-28', modelo: MODELO_VISION, origen: 'propio' });

describe('motor de conocimiento', () => {
  it('sin ejemplos no opina', () => {
    const l = leer(vector(0, 0.2, 1), []);
    expect(l.votos.size).toBe(0);
    expect(l.confianza).toBe(0);
  });
  it('propone el tipo de los ejemplos más parecidos y mide cuánto se parecen', () => {
    const base = [ej('PC', 0), ej('PC', 0), ej('PC', 0), ej('BCH', 1), ej('BCH', 1), ej('FL', 2)];
    const l = leer(vector(0, 0.25, 999), base);
    expect([...l.votos.entries()].sort((a, b) => b[1] - a[1])[0][0]).toBe('PC');
    expect(l.confianza).toBeGreaterThan(0.5);
    expect([...l.votos.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    // Una foto que no se parece a nada de lo visto: baja confianza
    const lejos = leer(vector(5, 0.25, 77), base);
    expect(lejos.confianza).toBeLessThan(l.confianza);
    expect(lejos.mejorSimilitud).toBeLessThan(l.mejorSimilitud);
  });
  it('aprende con cada ejemplo nuevo y se corrige si el ejemplo cambia', () => {
    const consulta = vector(3, 0.25, 5);
    const base = [ej('PC', 0), ej('BCH', 1)];
    expect(leer(consulta, base).confianza).toBeLessThan(0.3);
    const nuevo = ej('PCH', 3);
    const l = leer(consulta, [...base, nuevo]);
    expect([...l.votos.entries()].sort((a, b) => b[1] - a[1])[0][0]).toBe('PCH');
    expect(l.confianza).toBeGreaterThan(0.5);
    // El inspector corrige el tipo de ese registro: la lectura cambia con él
    const corregido = leer(consulta, [...base, { ...nuevo, codigo: 'DC' }]);
    expect([...corregido.votos.entries()].sort((a, b) => b[1] - a[1])[0][0]).toBe('DC');
    // Al evaluar un registro no se cuenta a sí mismo
    expect(leer(nuevo.vector, [...base, nuevo], nuevo.id).mejorSimilitud).toBeLessThan(0.99);
  });
  it('no se confía con un solo ejemplo: daños distintos de un mismo inspector ya se parecen', () => {
    // Similitudes como las medidas en fotos reales del flujo: 0,95 mismo tipo, 0,75 a 0,85 distinto
    const [pc] = [ej('PC', 0, 0.2)];
    const otraPc = vector(0, 0.2, 4242);
    const fisura = normalizar(Float32Array.from(pc.vector, (x, i) => x + (i % 2 ? 0.035 : -0.035)));
    expect(similitud(fisura, pc.vector)).toBeGreaterThan(0.7);
    expect(similitud(fisura, pc.vector)).toBeLessThan(0.86);
    expect(leer(fisura, [pc]).confianza).toBeLessThan(0.25);
    expect(leer(otraPc, [pc]).confianza).toBeGreaterThan(0.6);
  });
  it('calibra los niveles de similitud con la propia base', () => {
    expect(calibrar([])).toEqual({ fondo: 0.83, propio: 0.95 });
    const base = [ej('PC', 0), ej('PC', 0), ej('PC', 0), ej('BCH', 1), ej('BCH', 1), ej('BCH', 1), ej('FL', 2), ej('FL', 2)];
    const cal = calibrar(base);
    expect(cal.propio).toBeGreaterThan(cal.fondo);
    // Un daño del mismo tipo supera el nivel propio; uno de otro tipo queda en el fondo
    const propia = leer(vector(1, 0.25, 31), base, undefined, cal);
    const ajena = leer(vector(5, 0.25, 32), base, undefined, cal);
    expect(propia.confianza).toBeGreaterThan(0.6);
    expect(ajena.confianza).toBeLessThan(0.2);
  });
  it('se autoevalúa dejando un ejemplo por fuera a la vez', () => {
    const base = [ej('PC', 0), ej('PC', 0), ej('PC', 0), ej('BCH', 1), ej('BCH', 1), ej('BCH', 1), ej('FL', 2), ej('FL', 2), ej('DSU', 4)];
    const r = autoevaluar(base);
    expect(r.evaluados).toBe(8); // el único DSU no se puede evaluar
    expect(r.siglaPrimera).toBe(8);
    expect(r.familiaEntreTres).toBe(8);
    // Con etiquetas al azar el acierto cae: la medición no es complaciente
    const revuelto = base.map((e, i) => ({ ...e, codigo: ['PC', 'BCH', 'FL'][i % 3] }));
    expect(autoevaluar(revuelto).siglaPrimera).toBeLessThan(6);
    expect(conteoPorCodigo(base)).toEqual([{ codigo: 'FL', n: 2 }, { codigo: 'PC', n: 3 }, { codigo: 'BCH', n: 3 }, { codigo: 'DSU', n: 1 }]);
  });
  it('exporta e importa la base sin perder precisión, y rechaza archivos ajenos', () => {
    const base = [ej('PC', 0), ej('CVB', 6)];
    const texto = JSON.stringify(serializarConocimiento(base));
    const leidos = leerArchivoConocimiento(texto);
    expect(leidos.length).toBe(2);
    expect(leidos[0].origen).toBe('importado');
    expect(leidos[1].codigo).toBe('CVB');
    expect(similitud(leidos[0].vector, base[0].vector)).toBeCloseTo(1, 6);
    expect(() => leerArchivoConocimiento('{"formato":"otro"}')).toThrow(/no es una base de conocimiento/);
    expect(() => leerArchivoConocimiento('no es json')).toThrow();
    const otroModelo = JSON.stringify({ ...serializarConocimiento(base), modelo: 'otro_modelo' });
    expect(() => leerArchivoConocimiento(otroModelo)).toThrow(/otro modelo/);
    // Entradas dañadas se descartan sin tumbar la importación
    const conBasura = JSON.parse(texto);
    conBasura.ejemplos.push({ id: 'x', codigo: 'NOEXISTE', vector: 'AAAA' }, { id: 'y', codigo: 'PC', vector: 'AAAA' });
    expect(leerArchivoConocimiento(JSON.stringify(conBasura)).length).toBe(2);
  });
});
