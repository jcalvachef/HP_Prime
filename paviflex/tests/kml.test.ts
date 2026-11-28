import { describe, expect, it } from 'vitest';
import { contarPuntos, generarKml } from '../src/report/kml';
import type { Dano, Proyecto, Sector } from '../src/domain/types';

const proyecto = { id: 'p', nombre: 'Vía Mocoa <San Francisco> & otros', entidad: 'INVIAS', contrato: '', territorial: '', codigoVia: '1003', nombreVia: 'Mocoa – San Francisco', localizacion: '', administracion: '', levantadoPor: '', observaciones: '', creado: '', actualizado: '' } as Proyecto;
const sector = { id: 's', proyectoId: 'p', nombre: 'Sector 1', prInicial: 63350, prFinal: 63820, fecha: '2026-11-22', levantadoPor: '', numCalzadas: 1, carrilesPorCalzada: '2', totalCarriles: 2, anchoCarril: 3.5, anchoBerma: 1, numBermas: 2, descBerma: '', comentarios: '', longitudTramo: 100, creado: '' } as Sector;
function dano(n: number, extra: Partial<Dano>): Dano {
  return {
    id: 'd' + n, sectorId: 's', proyectoId: 'p', numero: n, abscisa: 63372, carril: 'D', tipo: 'PC', enBerma: false, severidad: 'M', largo: 4, ancho: 3.5,
    repLargo: null, repAncho: null, aclaraciones: 'Con "ahuellamiento" <leve> & bombeo', descripcion: '', descripcionAuto: true, fechaHora: '2026-11-22T15:28:00.000Z',
    gps: { lat: 1.1492, lon: -76.6464, precision: 4, altitud: 604.2, ts: '' }, foto: null, medicion: null, mapa: null, ...extra,
  };
}
const datos = { proyecto, sectores: [{ sector, danos: [dano(2, { tipo: 'FL', severidad: 'A', largo: 8, ancho: null, abscisa: 63415 }), dano(1, {}), dano(3, { gps: null }), dano(4, { tipo: 'CD', severidad: null, gps: { lat: 1.15, lon: -76.64, precision: null, altitud: null, ts: '' } })] }] };

describe('exportación KML', () => {
  const kml = generarKml(datos);
  it('exporta un punto por daño con coordenadas, en orden de abscisa', () => {
    expect(contarPuntos(datos)).toEqual({ conPunto: 3, sinCoordenadas: 1 });
    expect(kml.match(/<Placemark>/g)!.length).toBe(3);
    const nombres = [...kml.matchAll(/<Placemark>\n<name>([^<]*)<\/name>/g)].map((m) => m[1]);
    expect(nombres).toEqual(['1 · PC', '4 · CD', '2 · FL']);
    expect(kml).toContain('1 registros sin coordenadas no se exportan');
  });
  it('escribe las coordenadas como longitud,latitud[,altitud] en WGS84', () => {
    expect(kml).toContain('<Point><coordinates>-76.64640000,1.14920000,604.20</coordinates></Point>');
    expect(kml).toContain('<Point><coordinates>-76.64000000,1.15000000</coordinates></Point>');
  });
  it('incluye los atributos recolectados con su tipo, y EPSG:9377', () => {
    expect(kml).toContain('<SimpleField name="este_9377" type="double">');
    expect(kml).toContain('<SimpleData name="sigla">PC</SimpleData>');
    expect(kml).toContain('<SimpleData name="severidad">Media</SimpleData>');
    expect(kml).toContain('<SimpleData name="abscisa">PR63+372</SimpleData>');
    expect(kml).toContain('<SimpleData name="area_m2">14</SimpleData>');
    expect(kml).toContain('<SimpleData name="area_m2">4.8</SimpleData>'); // fisura: 8 m × 0,6 m
    expect(kml).toContain('<SimpleData name="este_9377">4594214.734</SimpleData>');
    expect(kml).toContain('<SimpleData name="norte_9377">1685279.241</SimpleData>');
    expect(kml).toContain('<SimpleData name="severidad">Sin grado</SimpleData>');
    expect(kml).not.toContain('<SimpleData name="altitud_m"></SimpleData>');
  });
  it('escapa los caracteres especiales y asigna el estilo por severidad', () => {
    expect(kml).toContain('<name>Vía Mocoa &lt;San Francisco&gt; &amp; otros</name>');
    expect(kml).toContain('Con &quot;ahuellamiento&quot; &lt;leve&gt; &amp; bombeo</SimpleData>');
    expect(kml).toContain('<styleUrl>#sev-M</styleUrl>');
    expect(kml).toContain('<styleUrl>#sev-A</styleUrl>');
    expect(kml).toContain('<styleUrl>#sev-N</styleUrl>');
    expect(kml).toContain('<color>ff3b3bd0</color>'); // rojo #d03b3b en orden aabbggrr
    expect(kml.match(/<Folder>/g)!.length).toBe(kml.match(/<\/Folder>/g)!.length);
  });
  it('en el KMZ enlaza la fotografía y los iconos propios', () => {
    const conFotos = generarKml(datos, { fotos: new Map([['d1', 'fotos/foto_001_d1.jpg']]), iconos: 'iconos' });
    expect(conFotos).toContain('<img src="fotos/foto_001_d1.jpg"');
    expect(conFotos).toContain('<href>iconos/sev-M.png</href>');
    expect(conFotos).not.toContain('maps.google.com');
  });
});
