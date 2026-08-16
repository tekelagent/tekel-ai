/**
 * Catálogo de patrones — METODOLOGIA §3, en código.
 *
 * La IA ENCUENTRA hallazgos; este catálogo PONDERA con pesos fijos. Los puntos
 * no se calculan ni se ajustan en tiempo de ejecución: están aquí, versionados,
 * para que cualquiera pueda auditar por qué un contrato sacó el score que sacó.
 *
 * Incluye los 16 patrones, no solo los implementados en la Capa A, para que el
 * catálogo sea la especificación completa y se vea qué falta por construir.
 *
 * El criterio normativo de cada patrón vive en `lib/normativa/catalog.ts`, y el
 * `foco` se lee de allí para no mantener dos copias.
 */
import { NORMATIVA, type Foco, type PatternCode } from "../normativa/catalog";
import type { Severity } from "./types";

export type Layer = "rules" | "llm" | "croma";

/**
 * Familia del patrón, para la regla de corroboración de METODOLOGIA §4:
 * "dos hallazgos de la misma familia cuentan como uno para el requisito de
 * independencia". Se deriva del criterio normativo: dos patrones que sustentan
 * el mismo deber no son señales independientes, son la misma señal vista dos
 * veces.
 */
export type Familia =
  /** Planeación y estimación del valor (Ley 80 arts. 25-26). */
  | "planeacion"
  /** Transparencia, selección objetiva y libre concurrencia (Ley 80 art. 24). */
  | "seleccion"
  /** Supervisión, ejecución, anticipos y liquidación. */
  | "ejecucion"
  /** Idoneidad, inhabilidad y antecedentes del contratista. */
  | "contratista";

export type PatternSpec = {
  points: number;
  layer: Layer;
  familia: Familia;
  /**
   * true = nunca eleva prioridad por sí solo; solo agrava cuando hay otras
   * señales (METODOLOGIA §3, cierre de condiciones de exclusión).
   */
  soloAgravante: boolean;
  /** false = declarado en la especificación pero aún sin implementar. */
  implemented: boolean;
};

export const PATTERNS = {
  INHABILIDAD_REP_LEGAL: {
    points: 45,
    layer: "croma",
    familia: "contratista",
    soloAgravante: false,
    implemented: false,
  },
  PROVEEDOR_RECIENTE: {
    points: 40,
    layer: "croma",
    familia: "contratista",
    soloAgravante: false,
    implemented: false,
  },
  ADICIONES_50: {
    points: 40,
    layer: "rules",
    familia: "ejecucion",
    soloAgravante: false,
    implemented: true,
  },
  MOROSO_BDME: {
    points: 40,
    layer: "croma",
    familia: "contratista",
    soloAgravante: false,
    implemented: false,
  },
  FRACCIONAMIENTO: {
    points: 30,
    layer: "rules",
    familia: "seleccion",
    soloAgravante: false,
    implemented: true,
  },
  PLIEGO_SASTRE: {
    points: 25,
    layer: "llm",
    familia: "seleccion",
    soloAgravante: false,
    implemented: false,
  },
  DESEQUILIBRIO_PAGOS: {
    points: 25,
    layer: "rules",
    familia: "ejecucion",
    soloAgravante: false,
    implemented: true,
  },
  PLAZO_RELAMPAGO: {
    points: 25,
    layer: "llm",
    familia: "seleccion",
    soloAgravante: false,
    implemented: false,
  },
  SANCIONES_PREVIAS: {
    points: 25,
    layer: "croma",
    familia: "contratista",
    soloAgravante: false,
    implemented: false,
  },
  VALOR_ATIPICO: {
    points: 25,
    layer: "rules",
    familia: "planeacion",
    soloAgravante: false,
    implemented: true,
  },
  EJECUCION_ANOMALA: {
    points: 25,
    layer: "rules",
    familia: "ejecucion",
    soloAgravante: false,
    implemented: true,
  },
  CONCENTRACION_PROVEEDOR: {
    points: 20,
    layer: "rules",
    familia: "seleccion",
    soloAgravante: false,
    implemented: true,
  },
  OBJETO_CIIU_INCOHERENTE: {
    points: 20,
    layer: "croma",
    familia: "contratista",
    soloAgravante: false,
    implemented: false,
  },
  PAGO_ADELANTADO_RIESGO: {
    points: 10,
    layer: "rules",
    familia: "ejecucion",
    // METODOLOGIA §3: nunca eleva prioridad por sí solo.
    soloAgravante: true,
    implemented: true,
  },
  DICIEMBRE: {
    points: 10,
    layer: "rules",
    familia: "planeacion",
    // METODOLOGIA §3: SOLO agravante, nunca dispara prioridad por sí solo.
    soloAgravante: true,
    implemented: true,
  },
  OBJETO_DIFUSO: {
    points: 10,
    layer: "llm",
    familia: "planeacion",
    soloAgravante: false,
    implemented: true,
  },
  COLUSION_PREVIA: {
    points: 45,
    layer: "rules",
    familia: "contratista",
    soloAgravante: false,
    // Activa aunque hoy dé 0 matches: cuesta cero y con el universo completo
    // o más departamentos puede disparar.
    implemented: true,
  },
  OBRA_INCONCLUSA: {
    points: 40,
    layer: "rules",
    familia: "ejecucion",
    soloAgravante: false,
    // El Registro Nacional usa códigos SECOP I / pre-CO1, incompatibles con el
    // corpus de SECOP II. Declarado en METODOLOGIA §7.
    implemented: false,
  },
  ANTECEDENTE_OBRA_INCONCLUSA: {
    points: 25,
    layer: "rules",
    familia: "contratista",
    soloAgravante: false,
    implemented: true,
  },
  MISMO_SUPERVISOR: {
    points: 15,
    layer: "rules",
    familia: "ejecucion",
    // Nunca prioriza solo: es un indicio de concentración del control.
    soloAgravante: true,
    implemented: true,
  },
  LICITANTE_UNICO: {
    points: 25,
    layer: "rules",
    familia: "seleccion",
    soloAgravante: false,
    implemented: true,
  },
} as const satisfies Record<PatternCode, PatternSpec>;

/**
 * ANTECEDENTE_OBRA_INCONCLUSA sube de 25 a 35 cuando la obra inconclusa
 * registrada es con la MISMA entidad que vuelve a contratar: la entidad ya
 * conocía el incumplimiento y contrató igual.
 */
export const ANTECEDENTE_OBRA_MISMA_ENTIDAD_PUNTOS = 35;

export type { PatternCode };

/**
 * Patrones que, con confianza alta, hacen P1 de inmediato (METODOLOGIA §4):
 * una inhabilidad activa no admite triaje.
 */
export const INHABILIDADES: readonly PatternCode[] = [
  "INHABILIDAD_REP_LEGAL",
  "MOROSO_BDME",
] as const;

/**
 * Severidad derivada de los puntos. METODOLOGIA fija los pesos, no las
 * severidades, así que se derivan con una regla única en vez de con un criterio
 * paralelo que pudiera contradecir la ponderación.
 *
 *   >= 40  critica  ·  20-39  alta  ·  < 20  media
 */
export function severityFromPoints(points: number): Severity {
  if (points >= 40) return "critica";
  if (points >= 20) return "alta";
  return "media";
}

export function pointsOf(code: PatternCode): number {
  return PATTERNS[code].points;
}

export function severityOf(code: PatternCode): Severity {
  return severityFromPoints(PATTERNS[code].points);
}

/** El foco vive en el catálogo normativo; aquí solo se reexporta. */
export function focoOf(code: PatternCode): Foco {
  return NORMATIVA[code].foco;
}

/**
 * Devuelven undefined/false ante un código desconocido en vez de reventar: a
 * `findings` escriben tres capas, y un hallazgo con un código que este catálogo
 * no conoce debe ignorarse en el triaje, no tumbar la corrida.
 */
export function familiaOf(code: PatternCode): Familia | undefined {
  return PATTERNS[code]?.familia;
}

export function esSoloAgravante(code: PatternCode): boolean {
  return PATTERNS[code]?.soloAgravante ?? false;
}
