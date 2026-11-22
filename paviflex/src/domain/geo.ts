/**
 * Coordenadas: WGS84/MAGNA-SIRGAS geográficas → EPSG:9377 (MAGNA-SIRGAS 2018 / Origen-Nacional, CTM12).
 * Proyección Transversa de Mercator: lat0 = 4° N, lon0 = 73° W, k0 = 0,9992,
 * falso este = 5 000 000 m, falso norte = 2 000 000 m, elipsoide GRS80.
 */
import proj4 from 'proj4';

export const EPSG_9377 =
  '+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

const aOrigenNacional = proj4('EPSG:4326', EPSG_9377);

export interface EsteNorte {
  este: number;
  norte: number;
}

export function aEpsg9377(lat: number, lon: number): EsteNorte {
  const [este, norte] = aOrigenNacional.forward([lon, lat]);
  return { este, norte };
}

export function desdeEpsg9377(este: number, norte: number): { lat: number; lon: number } {
  const [lon, lat] = aOrigenNacional.inverse([este, norte]);
  return { lat, lon };
}

/** Metros por píxel lógico de un mapa Web Mercator (Google Maps) en una latitud y zoom dados. */
export function metrosPorPixel(lat: number, zoom: number): number {
  return (156543.03392804097 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

/** Posición en píxeles "mundo" de Web Mercator (tesela de 256 px) para un zoom dado. */
export function pixelMundo(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = 256 * Math.pow(2, zoom);
  const s = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * n,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n,
  };
}

export function fmtCoord(v: number): string {
  return v.toLocaleString('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function fmtGrados(v: number): string {
  return v.toFixed(7) + '°';
}
