import { describe, expect, it } from 'vitest';
import { PROVEEDORES, errorPlantilla, planTeselas, urlTesela, anchoVistaMetros } from '../src/domain/teselas';
import { pixelMundo } from '../src/domain/geo';

const esri = PROVEEDORES.find((p) => p.id === 'esri-imagen')!;
const osm = PROVEEDORES.find((p) => p.id === 'osm')!;
const topo = PROVEEDORES.find((p) => p.id === 'opentopomap')!;

describe('teselas del mapa base', () => {
  it('arma las URL de cada proveedor (Esri usa z/y/x)', () => {
    expect(urlTesela(esri, 19, 150488, 260467)).toBe('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/19/260467/150488');
    expect(urlTesela(osm, 18, 75244, 130233)).toBe('https://tile.openstreetmap.org/18/75244/130233.png');
    expect(urlTesela(topo, 15, 9406, 16224)).toBe('https://tile.opentopomap.org/15/9406/16224.png');
    expect(urlTesela({ ...osm, plantilla: 'https://{s}.ejemplo.co/{z}/{x}/{y}.png', subdominios: ['a', 'b'] }, 3, 1, 2)).toBe('https://b.ejemplo.co/3/1/2.png');
  });
  it('las teselas cubren toda la imagen sin huecos ni traslapes', () => {
    for (const [prov, zoom] of [[esri, 19], [osm, 19], [topo, 19], [esri, 14]] as const) {
      const plan = planTeselas(1.1492, -76.6464, zoom, 600, 450, 2, prov);
      expect([plan.ancho, plan.alto]).toEqual([1200, 900]);
      const cubierto = new Uint8Array(plan.ancho * plan.alto);
      for (const t of plan.teselas)
        for (let y = Math.max(0, t.dy); y < Math.min(plan.alto, t.dy + t.dh); y++)
          for (let x = Math.max(0, t.dx); x < Math.min(plan.ancho, t.dx + t.dw); x++) cubierto[y * plan.ancho + x]++;
      expect(cubierto.every((v) => v === 1)).toBe(true);
    }
  });
  it('elige el nivel de detalle según el proveedor y respeta su zoom máximo', () => {
    expect(planTeselas(1.15, -76.65, 18, 600, 450, 2, esri).z).toBe(19); // un nivel más para nitidez
    expect(planTeselas(1.15, -76.65, 19, 600, 450, 2, esri).z).toBe(19); // tope del proveedor
    expect(planTeselas(1.15, -76.65, 19, 600, 450, 2, osm).z).toBe(19); // nivel de la vista
    expect(planTeselas(1.15, -76.65, 19, 600, 450, 2, topo).z).toBe(17); // se amplía desde zoom 17
    expect(planTeselas(1.15, -76.65, 19, 600, 450, 2, osm).teselas.length).toBeLessThanOrEqual(12);
  });
  it('el punto central queda en el centro de la imagen', () => {
    const lat = 4.6, lon = -74.08, zoom = 18;
    const plan = planTeselas(lat, lon, zoom, 600, 450, 2, esri);
    const c = pixelMundo(lat, lon, plan.z);
    const t = plan.teselas.find((q) => q.x === Math.floor(c.x / 256) && q.y === Math.floor(c.y / 256))!;
    const px = t.dx + ((c.x - t.x * 256) / 256) * t.dw;
    const py = t.dy + ((c.y - t.y * 256) / 256) * t.dh;
    expect(Math.abs(px - 600)).toBeLessThan(1.5);
    expect(Math.abs(py - 450)).toBeLessThan(1.5);
  });
  it('ningún proveedor incluido exige clave y todos traen atribución', () => {
    expect(PROVEEDORES.map((p) => p.id)).toEqual(['esri-hibrido', 'esri-imagen', 'osm', 'opentopomap']);
    for (const p of PROVEEDORES) {
      expect(errorPlantilla(p.plantilla)).toBeNull();
      expect(p.plantilla).not.toMatch(/key=|token=|apikey/i);
      expect(p.atribucion.length).toBeGreaterThan(5);
    }
    const hibrido = PROVEEDORES[0];
    expect(urlTesela(hibrido, 18, 75259, 130235, hibrido.superpuesta)).toBe('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/18/130235/75259');
  });
  it('valida plantillas propias y calcula el ancho de la vista', () => {
    expect(errorPlantilla('')).not.toBeNull();
    expect(errorPlantilla('http://x/{z}/{x}/{y}.png')).toMatch(/https/);
    expect(errorPlantilla('https://x/{z}/{x}.png')).toMatch(/\{y\}/);
    expect(errorPlantilla('https://mapas.ejemplo.co/teselas/{z}/{x}/{y}.png')).toBeNull();
    expect(anchoVistaMetros(1.15, 19, 600)).toBeCloseTo(179.1, 0);
  });
});
