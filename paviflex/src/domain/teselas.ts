/**
 * Mapas base por teselas (XYZ, Web Mercator) que no requieren clave de API, y el cálculo de las
 * teselas necesarias para componer una vista centrada en un punto.
 */
import { pixelMundo } from './geo';

export interface ProveedorMapa {
  id: string;
  nombre: string;
  descripcion: string;
  /** Plantilla de URL con {z}, {x}, {y} y opcionalmente {s} (subdominio) */
  plantilla: string;
  /** Capa transparente opcional que se dibuja encima (p. ej. vías y nombres sobre la imagen satelital) */
  superpuesta?: string;
  subdominios?: string[];
  /** Texto de atribución exigido por el proveedor; se imprime sobre el mapa */
  atribucion: string;
  zoomMax: number;
  /**
   * true: se piden teselas un nivel más detallado para que la imagen quede nítida al imprimir.
   * false: se usa el nivel de la vista (menos solicitudes; conviene en servidores comunitarios
   * y deja los rótulos del mapa más legibles).
   */
  nitido: boolean;
  /**
   * El servidor responde con una tesela gris "datos no disponibles" (en vez de un error) donde no
   * tiene imagen a ese nivel de detalle; hay que reconocerla y usar el nivel anterior.
   */
  marcaSinDatos?: boolean;
}

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

/**
 * Proveedores incluidos. Todos se comprobaron sin clave de API contra sus servidores
 * (noviembre de 2026). CARTO se descartó porque ya exige clave.
 */
export const PROVEEDORES: ProveedorMapa[] = [
  {
    id: 'esri-hibrido',
    nombre: 'Satélite con vías (Esri)',
    descripcion: 'Imagen satelital con las vías y sus nombres superpuestos. No requiere clave.',
    plantilla: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    superpuesta: `${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`,
    atribucion: 'Esri, Maxar, Earthstar Geographics, HERE, Garmin',
    zoomMax: 19,
    nitido: true,
    marcaSinDatos: true,
  },
  {
    id: 'esri-imagen',
    nombre: 'Imagen satelital (Esri World Imagery)',
    descripcion: 'Imágenes satelitales y aéreas, sin rótulos. No requiere clave.',
    plantilla: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    atribucion: 'Esri, Maxar, Earthstar Geographics',
    zoomMax: 19,
    nitido: true,
    marcaSinDatos: true,
  },
  {
    id: 'osm',
    nombre: 'Callejero (OpenStreetMap)',
    descripcion: 'Vías, nombres y referencias. No requiere clave.',
    plantilla: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribucion: '© OpenStreetMap contributors',
    zoomMax: 19,
    nitido: false,
  },
  {
    id: 'opentopomap',
    nombre: 'Topográfico (OpenTopoMap)',
    descripcion: 'Curvas de nivel y relieve; detalle hasta zoom 17. No requiere clave.',
    plantilla: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    atribucion: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)',
    zoomMax: 17,
    nitido: false,
  },
];

export const ID_PERSONALIZADO = 'xyz';
export const ID_GOOGLE = 'google';
export const ID_NINGUNO = 'ninguno';
export const PROVEEDOR_POR_DEFECTO = 'esri-hibrido';

/** Valida una plantilla XYZ escrita por el usuario. Devuelve el motivo si no es válida. */
export function errorPlantilla(plantilla: string): string | null {
  const p = plantilla.trim();
  if (!p) return 'Escriba la plantilla de URL del servicio de teselas.';
  if (!/^https:\/\//i.test(p)) return 'La plantilla debe comenzar por https://';
  for (const v of ['{z}', '{x}', '{y}']) if (!p.includes(v)) return `A la plantilla le falta ${v}.`;
  return null;
}

export function proveedorPersonalizado(plantilla: string, atribucion: string): ProveedorMapa {
  return {
    id: ID_PERSONALIZADO,
    nombre: 'Servicio de teselas propio',
    descripcion: '',
    plantilla: plantilla.trim(),
    subdominios: ['a', 'b', 'c'],
    atribucion: atribucion.trim(),
    zoomMax: 20,
    nitido: false,
  };
}

export function urlTesela(p: Pick<ProveedorMapa, 'plantilla' | 'subdominios'>, z: number, x: number, y: number, plantilla = p.plantilla): string {
  const subs = p.subdominios?.length ? p.subdominios : ['a'];
  return plantilla
    .replace('{s}', subs[(x + y) % subs.length])
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

export interface Tesela {
  z: number;
  x: number;
  y: number;
  /** Rectángulo de destino en píxeles de la imagen de salida (bordes enteros, sin costuras) */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export interface PlanTeselas {
  /** Nivel de zoom de las teselas solicitadas */
  z: number;
  /** Tamaño de la imagen de salida en píxeles */
  ancho: number;
  alto: number;
  teselas: Tesela[];
}

/**
 * Teselas que cubren una vista de `w` × `h` píxeles lógicos al zoom `zoom`, centrada en (lat, lon),
 * para una imagen de salida de densidad `escala` (2 = el doble de píxeles).
 */
export function planTeselas(lat: number, lon: number, zoom: number, w: number, h: number, escala: number, p: Pick<ProveedorMapa, 'zoomMax' | 'nitido'>): PlanTeselas {
  const deseado = p.nitido ? zoom + Math.round(Math.log2(escala)) : zoom;
  const z = Math.max(0, Math.min(deseado, p.zoomMax));
  // Píxeles de salida por cada píxel de tesela
  const f = escala * Math.pow(2, zoom - z);
  const ancho = Math.round(w * escala), alto = Math.round(h * escala);
  const c = pixelMundo(lat, lon, z);
  const n = Math.pow(2, z);
  const x0 = Math.floor((c.x - ancho / (2 * f)) / 256), x1 = Math.floor((c.x + ancho / (2 * f) - 1e-9) / 256);
  const y0 = Math.floor((c.y - alto / (2 * f)) / 256), y1 = Math.floor((c.y + alto / (2 * f) - 1e-9) / 256);
  const aX = (px: number) => Math.round((px - c.x) * f + ancho / 2);
  const aY = (py: number) => Math.round((py - c.y) * f + alto / 2);
  const teselas: Tesela[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = x0; tx <= x1; tx++) {
      const dx = aX(tx * 256), dy = aY(ty * 256);
      teselas.push({ z, x: ((tx % n) + n) % n, y: ty, dx, dy, dw: aX((tx + 1) * 256) - dx, dh: aY((ty + 1) * 256) - dy });
    }
  }
  return { z, ancho, alto, teselas };
}

/** Ancho en metros que abarca la vista del mapa (para mostrarlo junto al selector de zoom). */
export function anchoVistaMetros(lat: number, zoom: number, w: number): number {
  return ((156543.03392804097 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom)) * w;
}
