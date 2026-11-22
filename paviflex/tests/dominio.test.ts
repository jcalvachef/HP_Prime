import { describe, expect, it } from 'vitest';
import { aEpsg9377, desdeEpsg9377, metrosPorPixel } from '../src/domain/geo';
import { fmtPR, parsePR, magnitud, descripcionAutomatica } from '../src/domain/formato';
import { analizarSector, calcularTramos } from '../src/domain/analisis';
import { TIPOS_DANO, siglaRegistro } from '../src/domain/catalogo';
import type { Dano, Sector } from '../src/domain/types';

function sector(p: Partial<Sector> = {}): Sector {
  return {
    id: 's', proyectoId: 'p', nombre: 'S1', prInicial: 64250, prFinal: 67230, fecha: '2006-06-01', levantadoPor: '',
    numCalzadas: 1, carrilesPorCalzada: '2', totalCarriles: 2, anchoCarril: 3, anchoBerma: 0.8, numBermas: 2,
    descBerma: '', comentarios: '', longitudTramo: 100, creado: '', ...p,
  };
}
let n = 0;
function dano(tipo: string, sev: 'B' | 'M' | 'A' | null, abscisa: number, largo: number, ancho: number | null = null, enBerma = false): Dano {
  n++;
  return {
    id: 'd' + n, sectorId: 's', proyectoId: 'p', numero: n, abscisa, carril: 'D', tipo, enBerma, severidad: sev, largo, ancho,
    repLargo: null, repAncho: null, aclaraciones: '', descripcion: '', descripcionAuto: true, fechaHora: '', gps: null,
    foto: null, medicion: null, mapa: null,
  };
}

describe('EPSG:9377 (MAGNA-SIRGAS / Origen-Nacional)', () => {
  it('el origen de la proyección cae en el falso este y falso norte', () => {
    const { este, norte } = aEpsg9377(4, -73);
    expect(este).toBeCloseTo(5000000, 3);
    expect(norte).toBeCloseTo(2000000, 3);
  });
  it('coincide con valores de referencia calculados con PROJ (pyproj)', () => {
    // Referencias: pyproj Transformer EPSG:4326 → EPSG:9377
    const casos: [number, number, number, number][] = REFERENCIAS_PROJ;
    for (const [lat, lon, e, nn] of casos) {
      const r = aEpsg9377(lat, lon);
      expect(Math.abs(r.este - e)).toBeLessThan(0.002);
      expect(Math.abs(r.norte - nn)).toBeLessThan(0.002);
    }
  });
  it('la transformación inversa recupera la posición', () => {
    const r = aEpsg9377(1.1492, -76.6464);
    const g = desdeEpsg9377(r.este, r.norte);
    expect(g.lat).toBeCloseTo(1.1492, 8);
    expect(g.lon).toBeCloseTo(-76.6464, 8);
  });
  it('escala de mapa Web Mercator', () => {
    expect(metrosPorPixel(0, 0)).toBeCloseTo(156543.034, 2);
    expect(metrosPorPixel(4.6, 19)).toBeCloseTo(0.2976, 3);
  });
});

// Bogotá, Mocoa, Barranquilla, Leticia, San Andrés, Medellín
const REFERENCIAS_PROJ: [number, number, number, number][] = [
  [4.598889, -74.080833, 4880155.8936, 2066263.1218],
  [1.1492, -76.6464, 4594214.7340, 1685279.2407],
  [10.9685, -74.7813, 4805431.9170, 2770636.4165],
  [-4.2153, -69.9406, 5339544.7059, 1091643.4216],
  [12.5847, -81.7006, 4052005.0226, 2964475.1987],
  [6.2442, -75.5812, 4714489.0672, 2248672.2843],
];

describe('abscisas', () => {
  it('formatea y analiza PR', () => {
    expect(fmtPR(63400)).toBe('PR63+400');
    expect(fmtPR(66005)).toBe('PR66+005');
    expect(parsePR('PR63+400')).toBe(63400);
    expect(parsePR('63+050')).toBe(63050);
    expect(parsePR(' pr 0 + 100 ')).toBe(100);
    expect(parsePR('abc')).toBeNull();
  });
});

describe('catálogo', () => {
  it('contiene los daños del manual con siglas únicas', () => {
    const codigos = TIPOS_DANO.map((t) => t.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    for (const c of ['FL', 'FT', 'FCL', 'FCT', 'FJL', 'FJT', 'FML', 'FBD', 'FB', 'PC', 'FDC', 'FIN', 'OND', 'AB', 'HUN', 'AHU', 'DC', 'BCH', 'PCH', 'DSU', 'PA', 'PU', 'CD', 'EX', 'SU', 'CVB', 'SB', 'AFI', 'AFA'])
      expect(codigos).toContain(c);
  });
  it('agrega B a daños en berma excepto CVB y SB', () => {
    expect(siglaRegistro('PC', true)).toBe('PCB');
    expect(siglaRegistro('CVB', true)).toBe('CVB');
    expect(siglaRegistro('SB', true)).toBe('SB');
    expect(siglaRegistro('PC', false)).toBe('PC');
  });
});

describe('análisis por tramos (ejemplo del manual, Figura 42)', () => {
  it('une los remanentes inicial y final al tramo vecino', () => {
    const t = calcularTramos(sector());
    expect(t.length).toBe(29);
    expect([t[0].desde, t[0].hasta]).toEqual([64250, 64400]);
    expect(t[0].areaCalzada).toBe(900);
    expect([t[28].desde, t[28].hasta]).toEqual([67100, 67230]);
    expect(t[28].areaCalzada).toBe(780);
    expect(t.reduce((a, x) => a + x.areaCalzada, 0)).toBe(17880);
  });
  it('tramo T19: fisuras × 0,6 m y áreas largo × ancho', () => {
    const danos = [
      dano('FL', 'M', 66110, 0.4),
      dano('PC', 'B', 66120, 5, 1),
      dano('FL', 'A', 66130, 0.5),
      dano('PCH', 'A', 66140, 7, 2),
      dano('PC', 'A', 66150, 0.7, 0.7),
      dano('CD', null, 66300, 100, 6), // superficial: no entra en el análisis de carriles
      dano('PC', 'M', 66160, 2, 1, true), // berma
      dano('CVB', 'A', 66170, 3.5, 0.1),
    ];
    const a = analizarSector(sector(), danos);
    const g = a.grupos.carriles;
    const i = g.tramos.findIndex((t) => t.id === 'T19');
    expect([g.tramos[i].desde, g.tramos[i].hasta]).toEqual([66100, 66200]);
    expect(g.totalTramo[i]).toBeCloseTo(20.03, 6);
    expect(g.pctTramo[i]).toBeCloseTo(0.0334, 4);
    expect(g.areaAfectada).toBeCloseTo(20.03, 6);
    expect(a.areaInspeccionada).toBe(17880);
    expect(a.grupos.superficiales.areaAfectada).toBe(600);
    expect(a.grupos.bermas.areaAfectada).toBe(2);
    expect(a.grupos.bermas.columnas[0].sigla).toBe('PCB');
    expect(a.lineales).toEqual([{ sigla: 'CVB', nombre: 'Corrimiento vertical de la berma', sev: 'A', longitud: 3.5, cantidad: 1, unidad: 'm' }]);
  });
  it('magnitud y descripción automática', () => {
    expect(magnitud({ tipo: 'FL', largo: 10, ancho: null }).area).toBeCloseTo(6);
    expect(magnitud({ tipo: 'PC', largo: 4, ancho: 3.5 }).area).toBeCloseTo(14);
    const d = dano('PC', 'M', 63450, 4, 3.5);
    const txt = descripcionAutomatica(d);
    expect(txt).toContain('Piel de cocodrilo (PC) de severidad media');
    expect(txt).toContain('PR63+450');
    expect(txt).toContain('14 m²');
  });
});
