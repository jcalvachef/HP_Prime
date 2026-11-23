export type Severidad = 'B' | 'M' | 'A';

export type Administracion = '' | 'concesion' | 'mtto' | 'amv';

export interface Proyecto {
  id: string;
  nombre: string;
  entidad: string;
  contrato: string;
  territorial: string;
  codigoVia: string;
  nombreVia: string;
  localizacion: string;
  administracion: Administracion;
  levantadoPor: string;
  observaciones: string;
  creado: string;
  actualizado: string;
}

export interface Sector {
  id: string;
  proyectoId: string;
  nombre: string;
  /** Abscisas en metros: PR63+400 = 63400 */
  prInicial: number;
  prFinal: number;
  fecha: string;
  levantadoPor: string;
  numCalzadas: number;
  /** Texto libre del formato, p. ej. "2" o "C1 = 2, C2 = 3" */
  carrilesPorCalzada: string;
  /** Total de carriles de la sección (para el área inspeccionada) */
  totalCarriles: number;
  anchoCarril: number;
  anchoBerma: number;
  numBermas: number;
  descBerma: string;
  comentarios: string;
  /** Longitud del tramo de análisis (100 m según el manual) */
  longitudTramo: number;
  creado: string;
}

export interface Pt {
  x: number;
  y: number;
}

export type ClaseTrazo = 'largo' | 'ancho' | 'area';

export interface Trazo {
  id: string;
  clase: ClaseTrazo;
  /** Puntos en píxeles de la fotografía almacenada */
  puntos: Pt[];
}

export interface Medicion {
  /** Extremos de la regla naranja de referencia en píxeles de la fotografía */
  regla: { a: Pt; b: Pt } | null;
  /** Longitud real de la regla en metros (1,00 m) */
  longitudRegla: number;
  trazos: Trazo[];
}

export interface PosGps {
  lat: number;
  lon: number;
  precision: number | null;
  altitud: number | null;
  ts: string;
}

export type TipoMapa = 'hybrid' | 'satellite' | 'roadmap';

export interface MapaDano {
  blobId: string;
  zoom: number;
  tipo: TipoMapa;
  /** Tamaño lógico solicitado (px) y factor de escala de la imagen */
  w: number;
  h: number;
  escala: number;
  lat: number;
  lon: number;
  /** Identificador del proveedor del mapa base con que se descargó */
  proveedor?: string;
}

export interface Dano {
  id: string;
  sectorId: string;
  proyectoId: string;
  /** Número consecutivo de fotografía dentro del sector */
  numero: number;
  abscisa: number | null;
  carril: string;
  tipo: string;
  enBerma: boolean;
  severidad: Severidad | null;
  largo: number | null;
  ancho: number | null;
  repLargo: number | null;
  repAncho: number | null;
  aclaraciones: string;
  descripcion: string;
  /** true mientras la descripción sea la generada automáticamente */
  descripcionAuto: boolean;
  fechaHora: string;
  gps: PosGps | null;
  /** Fotografía almacenada y su miniatura para listados */
  foto: { blobId: string; miniId: string; w: number; h: number } | null;
  medicion: Medicion | null;
  mapa: MapaDano | null;
}

export interface Ajustes {
  /** Proveedor del mapa base: uno de los de teselas sin clave, 'xyz' (propio), 'google' o 'ninguno' */
  proveedorMapa: string;
  /** Plantilla y atribución del servicio de teselas propio */
  plantillaXYZ: string;
  atribucionXYZ: string;
  /** Solo para el proveedor opcional Google Maps (Maps Static API) */
  claveGoogleMaps: string;
  tipoMapa: TipoMapa;
  zoomMapa: number;
  consultorNombre: string;
  /** Líneas de títulos profesionales bajo el nombre en la portada */
  consultorTitulos: string;
  ciudadInforme: string;
  /** Datos de contacto del pie del rótulo (una línea por renglón), para el PDF */
  pieRotulo: string;
}

export const AJUSTES_POR_DEFECTO: Ajustes = {
  proveedorMapa: 'esri-hibrido',
  plantillaXYZ: '',
  atribucionXYZ: '',
  claveGoogleMaps: '',
  tipoMapa: 'hybrid',
  zoomMapa: 18,
  consultorNombre: 'Jhimmy Calvache-Fajardo',
  consultorTitulos:
    'Ingeniero Civil | Ingeniero Agrícola\nEspecialista en Hidroinformática\nEspecialista en Estructuras\nEspecialista en Sistemas de Información Geográfica',
  ciudadInforme: 'Mocoa – Putumayo',
  pieRotulo: 'Calle 9 No. 8-32\nMocoa – Putumayo, COL\nhidrogeomàtica@gmail.com\nTel. 3133746944',
};
