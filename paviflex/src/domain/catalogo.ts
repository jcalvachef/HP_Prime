/**
 * Catálogo de daños en pavimentos flexibles.
 * Fuente: "Manual para la inspección visual de pavimentos flexibles",
 * Convenio Interadministrativo 0587-03, Universidad Nacional de Colombia – INVIAS (octubre de 2006).
 */
import type { Severidad } from './types';

export type Categoria = 'fisuras' | 'deformaciones' | 'capas' | 'superficiales' | 'otros';

/** m: longitud · m2: área (largo × ancho) · n: número de veces */
export type Unidad = 'm' | 'm2' | 'n';

export interface TipoDano {
  codigo: string;
  nombre: string;
  categoria: Categoria;
  unidad: Unidad;
  /** Numeral del manual donde se define */
  numeral: string;
  definicion: string;
  causas: string[];
  /** null cuando el daño no tiene grados de severidad asociados */
  severidades: Record<Severidad, string> | null;
  /** Magnitud que define la severidad (para mostrar junto al selector) */
  criterio?: string;
  medicion: string;
  /** Evolución probable; vacío cuando el manual no la define */
  evolucion: string;
  /** Daños propios de la junta calzada–berma: no llevan sufijo "B" */
  propioDeBerma?: boolean;
  /** Fisuras lineales: el área se calcula con el ancho de referencia de 0,6 m */
  lineal?: boolean;
}

export const CATEGORIAS: { id: Categoria; nombre: string }[] = [
  { id: 'fisuras', nombre: 'Fisuras' },
  { id: 'deformaciones', nombre: 'Deformaciones' },
  { id: 'capas', nombre: 'Pérdida de las capas de la estructura' },
  { id: 'superficiales', nombre: 'Daños superficiales' },
  { id: 'otros', nombre: 'Otros daños' },
];

/** Ancho de referencia para convertir longitud de fisuras en área (numeral 1.1.1 y 3.1.1). */
export const ANCHO_REF_FISURAS = 0.6;

const SEV_FISURA: Record<Severidad, string> = {
  B: 'Abertura de la fisura menor que 1 mm, cerrada o con sello en buen estado.',
  M: 'Abertura entre 1 mm y 3 mm; pueden existir fisuras de patrón irregular de severidad baja en los bordes y desportillamientos leves; alta probabilidad de infiltración de agua.',
  A: 'Abertura mayor que 3 mm; desportillamientos considerables y fisuras de patrón irregular de severidad media o alta en los bordes; puede causar movimientos bruscos a los vehículos.',
};

const CAUSAS_FL_FT = [
  'Rigidización de la mezcla asfáltica por pérdida de flexibilidad (exceso de filler o envejecimiento del asfalto), ante bajas temperaturas o gradientes térmicos altos.',
  'Reflexión de grietas de capas inferiores (materiales estabilizados o juntas de placas de concreto hidráulico subyacentes).',
];

const MED_FISURA =
  'Se mide la longitud en metros (m). Para el análisis de área afectada la longitud se multiplica por un ancho de referencia de 0,6 m. Si hay varias severidades en una fisura se reporta la longitud de cada una o, en su defecto, la total con la mayor severidad.';

const SEV_OND: Record<Severidad, string> = {
  B: 'Profundidad máxima menor que 10 mm; causa poca vibración al vehículo, sin incomodidad al conductor.',
  M: 'Profundidad máxima entre 10 mm y 20 mm; causa mayor vibración al vehículo generando incomodidad.',
  A: 'Profundidad máxima mayor que 20 mm; vibración excesiva, obliga a reducir la velocidad por seguridad.',
};

export const TIPOS_DANO: TipoDano[] = [
  // ───────────── 1.1 FISURAS ─────────────
  {
    codigo: 'FL',
    nombre: 'Fisura longitudinal',
    categoria: 'fisuras',
    unidad: 'm',
    lineal: true,
    numeral: '1.1.1',
    definicion:
      'Discontinuidad en la carpeta asfáltica en la misma dirección del tránsito. Indica esfuerzos de tensión que han superado la resistencia del material; su localización dentro del carril orienta sobre la causa (las ubicadas en zonas de carga pueden relacionarse con fatiga).',
    causas: [...CAUSAS_FL_FT, 'Fatiga de la estructura; usualmente se presenta en las huellas del tránsito.'],
    severidades: SEV_FISURA,
    criterio: 'Abertura de la fisura',
    medicion: MED_FISURA,
    evolucion: 'Piel de cocodrilo, desintegración, descascaramientos, asentamientos longitudinales o transversales, fisuras en bloque.',
  },
  {
    codigo: 'FT',
    nombre: 'Fisura transversal',
    categoria: 'fisuras',
    unidad: 'm',
    lineal: true,
    numeral: '1.1.1',
    definicion:
      'Discontinuidad en la carpeta asfáltica transversal a la dirección del tránsito. Las fisuras diagonales se clasifican dentro de esta categoría.',
    causas: [
      ...CAUSAS_FL_FT,
      'Zonas de contacto entre corte y terraplén por diferencia de rigidez de la subrasante.',
      'Riego de liga insuficiente o ausente.',
      'Espesor insuficiente de la capa de rodadura.',
    ],
    severidades: SEV_FISURA,
    criterio: 'Abertura de la fisura',
    medicion: MED_FISURA,
    evolucion: 'Piel de cocodrilo, desintegración, descascaramientos, asentamientos longitudinales o transversales, fisuras en bloque.',
  },
  {
    codigo: 'FCL',
    nombre: 'Fisura longitudinal en junta de construcción',
    categoria: 'fisuras',
    unidad: 'm',
    lineal: true,
    numeral: '1.1.2',
    definicion:
      'Fisura longitudinal generada por la mala ejecución de las juntas de construcción de la carpeta asfáltica o de las juntas en zonas de ampliación. Se localiza generalmente en el eje de la vía, coincidiendo con el ancho de los carriles o en zonas de ensanche.',
    causas: [
      'Carencia de ligante en las paredes de la junta.',
      'Deficiencia en el corte vertical de las franjas construidas con anterioridad.',
      'Deficiencias de compactación en la zona de la junta.',
      'Unión entre materiales de diferente rigidez.',
    ],
    severidades: SEV_FISURA,
    criterio: 'Abertura de la fisura',
    medicion: MED_FISURA,
    evolucion: 'Pérdida de agregado, descascaramientos, asentamientos longitudinales o transversales, piel de cocodrilo, desportillamientos.',
  },
  {
    codigo: 'FCT',
    nombre: 'Fisura transversal en junta de construcción',
    categoria: 'fisuras',
    unidad: 'm',
    lineal: true,
    numeral: '1.1.2',
    definicion:
      'Fisura transversal generada por la mala ejecución de las juntas de construcción, en zonas de unión entre dos etapas de colocación del pavimento asfáltico.',
    causas: [
      'Carencia de ligante en las paredes de la junta.',
      'Deficiencia en el corte vertical de las franjas construidas con anterioridad.',
      'Deficiencias de compactación en la zona de la junta.',
      'Unión entre materiales de diferente rigidez.',
    ],
    severidades: SEV_FISURA,
    criterio: 'Abertura de la fisura',
    medicion: MED_FISURA,
    evolucion: 'Pérdida de agregado, descascaramientos, asentamientos longitudinales o transversales, piel de cocodrilo, desportillamientos.',
  },
  {
    codigo: 'FJL',
    nombre: 'Fisura longitudinal por reflexión de juntas o grietas de placas de concreto',
    categoria: 'fisuras',
    unidad: 'm',
    lineal: true,
    numeral: '1.1.3',
    definicion:
      'Se presenta cuando existe una capa asfáltica sobre placas de concreto rígido: aparece por la proyección en superficie de las juntas longitudinales (patrón regular) o de grietas de las placas (patrón irregular).',
    causas: [
      'Movimientos de las juntas entre placas de concreto rígido, o de los bloques formados por sus grietas, por cambios de temperatura y humedad.',
      'Generalmente no se atribuye a las cargas de tránsito, aunque éstas pueden incrementar la severidad.',
    ],
    severidades: SEV_FISURA,
    criterio: 'Abertura de la fisura',
    medicion: MED_FISURA,
    evolucion: 'Fisuras en bloque, descascaramientos, baches.',
  },
  {
    codigo: 'FJT',
    nombre: 'Fisura transversal por reflexión de juntas o grietas de placas de concreto',
    categoria: 'fisuras',
    unidad: 'm',
    lineal: true,
    numeral: '1.1.3',
    definicion:
      'Se presenta cuando existe una capa asfáltica sobre placas de concreto rígido: aparece por la proyección en superficie de las juntas transversales (patrón regular) o de grietas de las placas (patrón irregular).',
    causas: [
      'Movimientos de las juntas entre placas de concreto rígido, o de los bloques formados por sus grietas, por cambios de temperatura y humedad.',
      'Generalmente no se atribuye a las cargas de tránsito, aunque éstas pueden incrementar la severidad.',
    ],
    severidades: SEV_FISURA,
    criterio: 'Abertura de la fisura',
    medicion: MED_FISURA,
    evolucion: 'Fisuras en bloque, descascaramientos, baches.',
  },
  {
    codigo: 'FML',
    nombre: 'Fisura en medialuna',
    categoria: 'fisuras',
    unidad: 'm2',
    numeral: '1.1.4',
    definicion:
      'Fisuras de forma parabólica asociadas al movimiento de la banca, por lo que usualmente se presentan acompañadas de hundimientos.',
    causas: [
      'Inestabilidad de la banca o efectos locales de desecación.',
      'Falla lateral del talud en zonas de terraplén o del talud en corte a media ladera.',
      'Ausencia o falla de obras de contención de la banca.',
      'Desecación producida por árboles muy cerca del borde de la vía.',
      'Consolidación de los rellenos que acompañan las obras de contención.',
    ],
    severidades: SEV_FISURA,
    criterio: 'Abertura de la fisura',
    medicion:
      'Se registra el área que abarca la medialuna en m² (longitud de vía afectada × ancho de afectación). Si hay hundimiento se reporta su flecha máxima en las aclaraciones, y si afecta la berma o la cuneta.',
    evolucion: 'Ampliación del proceso (aumento del área afectada), aumento del hundimiento, pérdida de la banca.',
  },
  {
    codigo: 'FBD',
    nombre: 'Fisura de borde',
    categoria: 'fisuras',
    unidad: 'm',
    lineal: true,
    numeral: '1.1.5',
    definicion:
      'Fisuras con tendencia longitudinal a semicircular localizadas cerca del borde de la calzada, dentro de una franja paralela al borde de hasta 0,6 m de ancho. Se presentan por ausencia de berma o por diferencia de nivel entre berma y calzada.',
    causas: [
      'Falta de confinamiento lateral de la estructura (carencia de bordillos, anchos de berma insuficientes o sobrecarpetas en desnivel con la berma) cuando el tránsito circula muy cerca del borde.',
    ],
    severidades: SEV_FISURA,
    criterio: 'Abertura de la fisura',
    medicion: MED_FISURA,
    evolucion: 'Desprendimiento del borde o descascaramiento.',
  },
  {
    codigo: 'FB',
    nombre: 'Fisuras en bloque',
    categoria: 'fisuras',
    unidad: 'm2',
    numeral: '1.1.6',
    definicion:
      'La superficie del asfalto queda dividida en bloques de forma aproximadamente rectangular, de lado promedio mayor que 0,30 m. A diferencia de la piel de cocodrilo, aparece usualmente en áreas no cargadas.',
    causas: [
      'Contracción del concreto asfáltico por variación diaria de temperatura (asfalto endurecido por envejecimiento o inadecuado para el clima).',
      'Reflejo de grietas de contracción de materiales estabilizados utilizados como base.',
      'Cambio volumétrico del agregado fino de la mezcla con asfalto de baja penetración.',
    ],
    severidades: {
      B: 'Los bloques se han comenzado a formar pero no están claramente definidos; fisuras de abertura menor que 1 mm, cerradas o con sello, sin desportillamiento en los bordes.',
      M: 'Bloques definidos por fisuras de abertura entre 1 mm y 3 mm, o con sello fallado; pueden o no presentar desportillamiento en los bordes.',
      A: 'Bloques bien definidos por fisuras de abertura mayor que 3 mm, que pueden presentar alto desportillamiento en los bordes.',
    },
    criterio: 'Definición de los bloques y abertura de las fisuras',
    medicion:
      'Área de superficie afectada en m². Con varias severidades se registra el área de cada una o, en su defecto, toda el área con la mayor severidad. Si se combina con piel de cocodrilo se registra cada daño por separado.',
    evolucion: 'Piel de cocodrilo, descascaramientos.',
  },
  {
    codigo: 'PC',
    nombre: 'Piel de cocodrilo',
    categoria: 'fisuras',
    unidad: 'm2',
    numeral: '1.1.7',
    definicion:
      'Serie de fisuras interconectadas con patrones irregulares, generalmente en zonas sujetas a repeticiones de carga, que forman piezas angulares de diámetro promedio menor que 30 cm, con un patrón semejante a la piel de un cocodrilo.',
    causas: [
      'Falla por fatiga de la estructura o de la carpeta asfáltica.',
      'Espesor de estructura insuficiente o deformaciones de la subrasante.',
      'Rigidización de la mezcla asfáltica en zonas de carga (oxidación o envejecimiento).',
      'Problemas de drenaje que afectan los materiales granulares.',
      'Compactación deficiente de las capas granulares o asfálticas.',
      'Deficiencias en la elaboración de la mezcla asfáltica.',
      'Reparaciones mal ejecutadas, juntas mal elaboradas.',
    ],
    severidades: {
      B: 'Serie de fisuras longitudinales paralelas (aberturas hasta de 3 mm), principalmente en la huella, sin desportillamiento, con pocas o ninguna conexión entre ellas y sin evidencia de bombeo.',
      M: 'Las fisuras forman un patrón de polígonos pequeños y angulosos, con ligero desgaste en los bordes y aberturas entre 1 mm y 3 mm, sin evidencia de bombeo.',
      A: 'Fisuras evolucionadas (abertura mayor que 3 mm) con desgaste o desportillamiento en los bordes; bloques sueltos o que se mueven ante el tránsito; puede haber descascaramientos y bombeo.',
    },
    criterio: 'Patrón de fisuración, abertura y estado de los bordes',
    medicion:
      'Área afectada en m². Cuando se combinan varias severidades y no es fácil diferenciarlas, se reporta el área completa con la mayor severidad presente.',
    evolucion: 'Deformaciones, descascaramientos, baches.',
  },
  {
    codigo: 'FDC',
    nombre: 'Fisuración por deslizamiento de capas',
    categoria: 'fisuras',
    unidad: 'm2',
    numeral: '1.1.8',
    definicion:
      'Fisuras en forma de semicírculo o medialuna generadas por la fuerza de tracción de las llantas al acelerar o frenar, que hace que la superficie del pavimento se deslice y se deforme. Usual en zonas montañosas, curvas o intersecciones.',
    causas: [
      'Mezcla superficial de baja resistencia o escasa adherencia entre las capas superficiales.',
      'Tránsito muy pesado y muy lento en zonas de frenado y aceleración.',
      'Espesores de carpeta muy bajos.',
      'Alto contenido de arena en la mezcla asfáltica.',
      'Exceso de ligante o presencia de polvo durante el riego de liga.',
      'Carencia de penetración de la imprimación en bases granulares.',
    ],
    severidades: {
      B: 'Abertura máxima de las fisuras menor que 1 mm.',
      M: 'Abertura máxima entre 1 mm y 3 mm; pueden existir agrietamientos alrededor de las fisuras con aberturas menores a 1 mm.',
      A: 'Abertura máxima mayor que 3 mm; pueden existir agrietamientos entre las fisuras y en la zona aledaña con aberturas mayores que 1 mm.',
    },
    criterio: 'Abertura máxima de las fisuras',
    medicion: 'Área afectada en m² con la mayor severidad presente.',
    evolucion: 'Descascaramientos, baches, hundimientos, abultamientos.',
  },
  {
    codigo: 'FIN',
    nombre: 'Fisuración incipiente',
    categoria: 'fisuras',
    unidad: 'm2',
    numeral: '1.1.9',
    definicion:
      'Serie de fisuras contiguas y cerradas que generalmente no se interceptan y afectan el concreto asfáltico de manera superficial. Por ser daños muy leves no poseen niveles de severidad.',
    causas: [
      'Diferencia de temperatura entre la mezcla y el ambiente en el momento de la colocación (temperatura ambiente baja).',
      'Lluvia durante la colocación del concreto asfáltico.',
    ],
    severidades: null,
    medicion: 'Área afectada en m²; no tiene grados de severidad asociados.',
    evolucion: 'Piel de cocodrilo de pequeños bloques, pérdida de agregados, fisuras en bloque.',
  },

  // ───────────── 1.2 DEFORMACIONES ─────────────
  {
    codigo: 'OND',
    nombre: 'Ondulación',
    categoria: 'deformaciones',
    unidad: 'm2',
    numeral: '1.2.1',
    definicion:
      'También llamada corrugación o rizado: ondas en la superficie del pavimento, generalmente perpendiculares a la dirección del tránsito, con longitudes entre crestas usualmente menores que 1,0 m.',
    causas: [
      'Pérdida de estabilidad de la mezcla asfáltica (mala dosificación, ligantes blandos, agregados redondeados).',
      'Exceso de compactación de la carpeta o exceso/mala calidad del asfalto.',
      'Insuficiencia de triturados (caras fracturadas) o falta de curado de las mezclas.',
      'Acción del tránsito en zonas de frenado y estacionamiento.',
      'Deslizamiento de la capa de rodadura por exceso de riego de liga.',
      'Exceso de humedad en la subrasante.',
    ],
    severidades: SEV_OND,
    criterio: 'Profundidad máxima',
    medicion: 'Área afectada en m².',
    evolucion: 'Exudación, ahuellamiento.',
  },
  {
    codigo: 'AB',
    nombre: 'Abultamiento',
    categoria: 'deformaciones',
    unidad: 'm2',
    numeral: '1.2.2',
    definicion:
      'Abombamientos o prominencias en la superficie del pavimento; pueden presentarse bruscamente en áreas pequeñas o gradualmente en áreas grandes, a veces acompañados de fisuras.',
    causas: [
      'Expansión de la subrasante.',
      'Deformación de capas asfálticas sobre placas de concreto rígido por presiones bajo la capa (p. ej. bombeo).',
      'Ondulación localizada por las mismas causas de la ondulación.',
    ],
    severidades: SEV_OND,
    criterio: 'Altura máxima',
    medicion: 'Área afectada en m².',
    evolucion: 'Fisuración, desprendimientos, exudación, ahuellamiento.',
  },
  {
    codigo: 'HUN',
    nombre: 'Hundimiento',
    categoria: 'deformaciones',
    unidad: 'm2',
    numeral: '1.2.3',
    definicion:
      'Depresión localizada en el pavimento con respecto al nivel de la rasante. Puede generar problemas de seguridad (hidroplaneo). Se debe anotar en las aclaraciones su orientación o forma (longitudinal, transversal o medialuna).',
    causas: [
      'Asentamientos de la subrasante.',
      'Deficiencia de compactación de capas inferiores, del terraplén o de accesos a obras de arte o puentes.',
      'Deficiencias de drenaje que afectan los materiales granulares.',
      'Diferencia de rigidez en transiciones corte–terraplén.',
      'Deficiencias de compactación de rellenos en zanjas que atraviesan la calzada.',
      'Inestabilidad de la banca.',
      'Circulación de tránsito muy pesado.',
    ],
    severidades: {
      B: 'Profundidad menor que 20 mm; causa poca vibración al vehículo, sin incomodidad al conductor.',
      M: 'Profundidad entre 20 mm y 40 mm; causa mayor vibración al vehículo generando incomodidad.',
      A: 'Profundidad mayor que 40 mm; vibración excesiva, obliga a reducir la velocidad por seguridad.',
    },
    criterio: 'Profundidad',
    medicion: 'Área afectada en m².',
    evolucion: 'Fisuración, desprendimientos, movimientos en masa.',
  },
  {
    codigo: 'AHU',
    nombre: 'Ahuellamiento',
    categoria: 'deformaciones',
    unidad: 'm2',
    numeral: '1.2.4',
    definicion:
      'Depresión de la zona localizada sobre la trayectoria de las llantas, con frecuencia acompañada de elevación de las áreas adyacentes y de fisuración. Puede llevar a la falla estructural y posibilitar el hidroplaneo.',
    causas: [
      'Deformación permanente de alguna capa del pavimento o de la subrasante.',
      'Deformación plástica del concreto asfáltico (climas cálidos, compactación inadecuada, asfaltos blandos, agregados redondeados).',
      'Fatiga de la estructura por repetición de cargas o deficiencia de diseño.',
    ],
    severidades: {
      B: 'Profundidad menor que 10 mm.',
      M: 'Profundidad entre 10 mm y 25 mm.',
      A: 'Profundidad mayor que 25 mm.',
    },
    criterio: 'Profundidad',
    medicion: 'Área afectada en m², asignando la severidad de acuerdo con la zona de mayor profundidad.',
    evolucion: 'Piel de cocodrilo, desprendimientos.',
  },

  // ───────────── 1.3 PÉRDIDA DE LAS CAPAS DE LA ESTRUCTURA ─────────────
  {
    codigo: 'DC',
    nombre: 'Descascaramiento',
    categoria: 'capas',
    unidad: 'm2',
    numeral: '1.3.1',
    definicion:
      'Desprendimiento de parte de la capa asfáltica superficial, sin llegar a afectar las capas asfálticas subyacentes.',
    causas: [
      'Limpieza insuficiente previa a tratamientos superficiales.',
      'Espesor insuficiente de la capa de rodadura asfáltica.',
      'Riego de liga deficiente.',
      'Mezcla asfáltica muy permeable.',
    ],
    severidades: {
      B: 'Profundidad menor que 10 mm.',
      M: 'Profundidad entre 10 mm y 25 mm.',
      A: 'Profundidad mayor que 25 mm.',
    },
    criterio: 'Profundidad',
    medicion: 'Área afectada para cada severidad en m².',
    evolucion: 'Piel de cocodrilo, bache.',
  },
  {
    codigo: 'BCH',
    nombre: 'Bache',
    categoria: 'capas',
    unidad: 'm2',
    numeral: '1.3.2',
    definicion:
      'Desintegración total de la carpeta asfáltica que deja expuestos los materiales granulares, con aumento del área afectada y de la profundidad por acción del tránsito. Incluye los ojos de pescado (baches redondeados de bordes bien definidos).',
    causas: [
      'Retención de agua en zonas fisuradas; evolución de otros daños, especialmente piel de cocodrilo.',
      'Defectos constructivos (p. ej. carencia de penetración de la imprimación en bases granulares).',
      'Deficiencia de espesores de capas estructurales.',
      'Pavimento o subrasante débiles.',
    ],
    severidades: {
      B: 'Profundidad de afectación menor o igual que 25 mm; desprendimiento de tratamientos superficiales o capas delgadas.',
      M: 'Profundidad de afectación entre 25 mm y 50 mm; deja expuesta la base.',
      A: 'Profundidad de afectación mayor que 50 mm; llega a afectar la base granular.',
    },
    criterio: 'Profundidad de afectación',
    medicion: 'Área afectada en m², registrando la mayor severidad existente.',
    evolucion: 'Destrucción de la estructura.',
  },
  {
    codigo: 'PCH',
    nombre: 'Parche',
    categoria: 'capas',
    unidad: 'm2',
    numeral: '1.3.3',
    definicion:
      'Área donde el pavimento original fue removido y reemplazado para reparar la estructura o instalar/reparar redes de servicios. Se reporta aunque no presente daños, porque indica un deterioro anterior (parcheo: reemplazo de concreto asfáltico; bacheo: reemplazo de granulares).',
    causas: [
      'Procesos constructivos deficientes.',
      'Progresión del daño inicial cuando la intervención fue inadecuada.',
      'Deficiencias en las juntas.',
      'Propagación de daños existentes en las áreas aledañas.',
    ],
    severidades: {
      B: 'El parche está en muy buena condición y se desempeña satisfactoriamente.',
      M: 'El parche presenta daños de severidad baja o media y deficiencias en los bordes.',
      A: 'El parche está gravemente deteriorado, presenta daños de severidad alta y requiere ser reparado pronto.',
    },
    criterio: 'Condición del parche',
    medicion:
      'Área del parche en m². Si es muy grande y no está afectado en toda su longitud, se reporta además el área afectada en las casillas de reparación, y en las aclaraciones los daños presentes en el parche y zonas aledañas.',
    evolucion: 'De acuerdo con la naturaleza del daño; puede acelerar el deterioro general del pavimento.',
  },

  // ───────────── 1.4 DAÑOS SUPERFICIALES ─────────────
  {
    codigo: 'DSU',
    nombre: 'Desgaste superficial',
    categoria: 'superficiales',
    unidad: 'm2',
    numeral: '1.4.1',
    definicion:
      'Deterioro del pavimento ocasionado por el tránsito y agentes abrasivos o erosivos; se presenta como pérdida de ligante y mortero, en las zonas por donde transitan los vehículos.',
    causas: [
      'Deterioro natural del pavimento; a edades tempranas puede asociarse a endurecimiento significativo del asfalto.',
      'Falta de adherencia del asfalto con los agregados.',
      'Deficiente dosificación de asfalto en la mezcla.',
      'Acción intensa del agua u otros agentes abrasivos además del tránsito.',
    ],
    severidades: {
      B: 'La superficie ha perdido su textura uniforme y se muestra ligeramente áspera o rugosa, con irregularidades hasta de 3 mm.',
      M: 'Irregularidades entre 3 mm y 10 mm; se observa el agregado grueso y se siente vibración y cambio de sonido de las llantas.',
      A: 'Ha comenzado la desintegración superficial de la capa de rodadura; desprendimientos evidentes y partículas sueltas sobre la calzada.',
    },
    criterio: 'Profundidad de las irregularidades',
    medicion: 'Área afectada en m².',
    evolucion: 'Pérdida de agregado.',
  },
  {
    codigo: 'PA',
    nombre: 'Pérdida de agregado',
    categoria: 'superficiales',
    unidad: 'm2',
    numeral: '1.4.2',
    definicion:
      'También llamada desintegración: disgregación superficial de la capa de rodadura por pérdida gradual de agregados, que hace la superficie más rugosa. En tratamientos superficiales con estrías en la dirección del riego se reporta como surcos.',
    causas: [
      'Aplicación irregular del ligante en tratamientos superficiales.',
      'Problemas de adherencia entre agregado y asfalto.',
      'Agregados contaminados con finos o muy absorbentes.',
      'Lluvia durante la aplicación o el fraguado del ligante.',
      'Endurecimiento significativo del asfalto.',
      'Deficiencia de compactación de la carpeta.',
      'Contaminación de la capa de rodadura con aceite, gasolina u otros.',
    ],
    severidades: {
      B: 'Los agregados gruesos han comenzado a desprenderse; pequeños huecos con separación mayor a 0,15 m.',
      M: 'Mayor desprendimiento de agregados, con separaciones entre 0,05 m y 0,15 m.',
      A: 'Desprendimiento extensivo de agregados finos y gruesos con separaciones menores a 0,05 m; superficie muy rugosa con agregados sueltos.',
    },
    criterio: 'Separación entre huecos',
    medicion: 'Área afectada en m², de acuerdo con la severidad predominante.',
    evolucion: 'Descascaramientos, aumento de la permeabilidad de la estructura, exudación.',
  },
  {
    codigo: 'PU',
    nombre: 'Pulimento del agregado',
    categoria: 'superficiales',
    unidad: 'm2',
    numeral: '1.4.3',
    definicion:
      'Presencia de agregados con caras planas en la superficie o ausencia de agregados angulares; puede afectar la resistencia al deslizamiento.',
    causas: ['Baja resistencia o susceptibilidad de algunos agregados al pulimento (p. ej. calizas).'],
    severidades: null,
    medicion: 'Área afectada en m²; no tiene grados de severidad asociados.',
    evolucion: '',
  },
  {
    codigo: 'CD',
    nombre: 'Cabezas duras',
    categoria: 'superficiales',
    unidad: 'm2',
    numeral: '1.4.4',
    definicion:
      'Presencia de agregados expuestos fuera del mortero arena-asfalto, que puede aumentar la rugosidad del pavimento y provocar ruido excesivo.',
    causas: [
      'Agregados gruesos de tamaño inadecuado.',
      'Distribución granulométrica deficiente en el rango de las arenas.',
      'Segregación de los agregados durante su manejo en obra.',
      'Heterogeneidad en la dureza de los agregados.',
    ],
    severidades: null,
    medicion: 'Área afectada en m²; no tiene grados de severidad asociados.',
    evolucion: '',
  },
  {
    codigo: 'EX',
    nombre: 'Exudación',
    categoria: 'superficiales',
    unidad: 'm2',
    numeral: '1.4.5',
    definicion:
      'Película o afloramiento del ligante asfáltico sobre la superficie, generalmente brillante, resbaladiza y pegajosa; puede afectar la resistencia al deslizamiento.',
    causas: [
      'Cantidad excesiva de asfalto en la mezcla (bajo contenido de vacíos con aire), especialmente en épocas o zonas calurosas.',
      'Uso de asfaltos muy blandos o derrame de ciertos solventes.',
    ],
    severidades: {
      B: 'Visible en la superficie en franjas aisladas y de espesor delgado que no cubre los agregados gruesos.',
      M: 'Exceso de asfalto libre que conforma una película que cubre parcialmente los agregados, con frecuencia en las huellas; se torna pegajoso en climas cálidos.',
      A: 'Cantidad significativa de asfalto que cubre casi la totalidad de los agregados; aspecto húmedo de intensa coloración negra.',
    },
    criterio: 'Espesor de la película de asfalto',
    medicion: 'Área afectada en m² de acuerdo con la severidad.',
    evolucion: '',
  },
  {
    codigo: 'SU',
    nombre: 'Surcos',
    categoria: 'superficiales',
    unidad: 'm2',
    numeral: '1.4.6',
    definicion: 'Franjas o canales longitudinales donde se han perdido los agregados de la mezcla asfáltica.',
    causas: [
      'En tratamientos superficiales: distribución transversal defectuosa del ligante o del agregado.',
      'En concreto asfáltico: erosión producida por agua en zonas de alta pendiente.',
    ],
    severidades: null,
    medicion: 'Área afectada en m²; no tiene grados de severidad asociados.',
    evolucion: 'Pérdida de agregado, descascaramiento, bache.',
  },

  // ───────────── 1.5 OTROS DAÑOS ─────────────
  {
    codigo: 'CVB',
    nombre: 'Corrimiento vertical de la berma',
    categoria: 'otros',
    unidad: 'm',
    propioDeBerma: true,
    numeral: '1.5.1',
    definicion:
      'Diferencia de elevación entre la calzada y la berma debida a un desplazamiento de la berma; permite la infiltración de agua hacia el interior de la estructura. (Convención CV en el formato de campo.)',
    causas: [
      'Diferencias entre los materiales de la berma y el pavimento.',
      'Bombeo del material de base en la berma.',
      'Inestabilidad de los taludes aledaños.',
    ],
    severidades: {
      B: 'Desplazamiento menor que 6 mm.',
      M: 'Desplazamiento entre 6 mm y 25 mm.',
      A: 'Desplazamiento mayor que 25 mm.',
    },
    criterio: 'Desplazamiento vertical',
    medicion: 'Longitud afectada en metros (m); en la casilla de ancho puede anotarse la altura del corrimiento.',
    evolucion: '',
  },
  {
    codigo: 'SB',
    nombre: 'Separación de la berma',
    categoria: 'otros',
    unidad: 'm',
    propioDeBerma: true,
    numeral: '1.5.2',
    definicion:
      'Incremento en la separación de la junta existente entre la calzada y la berma; permite la infiltración de agua hacia el interior de la estructura.',
    causas: [
      'Movimiento de la berma por inestabilidad de los taludes aledaños.',
      'Ausencia de liga entre calzada y berma cuando se construyen por separado.',
    ],
    severidades: {
      B: 'Abertura menor que 3 mm.',
      M: 'Abertura entre 3 mm y 10 mm.',
      A: 'Abertura mayor que 10 mm.',
    },
    criterio: 'Abertura de la junta',
    medicion: 'Longitud afectada en metros (m); en la casilla de ancho puede anotarse la separación.',
    evolucion: 'Hundimientos y fisuras de borde.',
  },
  {
    codigo: 'AFI',
    nombre: 'Afloramiento de finos',
    categoria: 'otros',
    unidad: 'n',
    numeral: '1.5.3',
    definicion:
      'Salida de agua infiltrada junto con materiales finos de la base por las grietas cuando circulan las cargas de tránsito; se evidencia por manchas o material acumulado cerca del borde de las grietas. Frecuente en pavimentos semirrígidos.',
    causas: ['Ausencia o inadecuado sistema de subdrenaje.', 'Exceso de finos en la estructura.'],
    severidades: null,
    medicion:
      'Siempre se presenta donde existe otro daño: se reporta ese daño y en las aclaraciones se escribe que posee afloramiento de finos (se contabiliza el número de veces que se presenta).',
    evolucion: 'Piel de cocodrilo, descascaramientos, baches.',
  },
  {
    codigo: 'AFA',
    nombre: 'Afloramiento de agua',
    categoria: 'otros',
    unidad: 'm',
    numeral: '1.5.4',
    definicion: 'Presencia de agua en la superficie del pavimento en instantes en los cuales no hay lluvia.',
    causas: ['Ausencia o inadecuado sistema de subdrenaje.', 'Filtración de aguas.'],
    severidades: null,
    medicion:
      'Se mide en metros (m) cuando no tiene otro daño asociado; cuando se presenta donde existe un daño, se reporta ese daño y en las aclaraciones se escribe que posee afloramiento de agua.',
    evolucion: 'Piel de cocodrilo, descascaramientos, baches.',
  },
];

const POR_CODIGO = new Map(TIPOS_DANO.map((t) => [t.codigo, t]));

export function tipoDano(codigo: string): TipoDano | undefined {
  return POR_CODIGO.get(codigo);
}

/** Sigla que se registra en el formato: se agrega "B" a los daños en berma (excepto CVB y SB). */
export function siglaRegistro(codigo: string, enBerma: boolean): string {
  const t = POR_CODIGO.get(codigo);
  if (!t) return codigo;
  return enBerma && !t.propioDeBerma ? `${codigo}B` : codigo;
}

export const NOMBRE_SEVERIDAD: Record<Severidad, string> = { B: 'Baja', M: 'Media', A: 'Alta' };
export const SEVERIDADES: Severidad[] = ['B', 'M', 'A'];

export function etiquetaUnidad(u: Unidad): string {
  return u === 'm' ? 'm' : u === 'm2' ? 'm²' : 'veces';
}

/** Convenciones de carril para una calzada de dos carriles (numeral 2.1.2). */
export const CARRILES_BASE = [
  { id: 'D', nombre: 'Carril derecho' },
  { id: 'I', nombre: 'Carril izquierdo' },
  { id: 'C', nombre: 'Toda la calzada' },
  { id: 'E', nombre: 'Eje' },
];

export function nombreCarril(c: string): string {
  const base = CARRILES_BASE.find((x) => x.id === c);
  if (base) return base.nombre.toLowerCase();
  return c ? `carril ${c}` : 'carril no indicado';
}
