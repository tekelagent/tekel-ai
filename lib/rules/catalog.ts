/**
 * Catálogo de patrones — la especificación de CLAUDE.md, en código.
 *
 * La IA ENCUENTRA hallazgos; este catálogo PONDERA con pesos fijos. Los puntos
 * no se calculan ni se ajustan en tiempo de ejecución: están aquí, versionados,
 * para que cualquiera pueda auditar por qué un contrato sacó el score que sacó.
 *
 * Incluye los 13 patrones, no solo los implementados en la Capa A, para que el
 * catálogo sea la especificación completa y se vea qué falta por construir.
 */
import type { Severity } from "./types";

export type Layer = "rules" | "llm" | "croma";

export type PatternSpec = {
  points: number;
  /** Capa que emite el hallazgo, y por tanto el `source` que se escribe. */
  layer: Layer;
  /** Modo en el que el patrón pesa más, según CLAUDE.md. */
  weighsIn: "vigente" | "historico" | "ambos";
  description: string;
  /** false = declarado en la especificación pero aún sin implementar. */
  implemented: boolean;
};

export const PATTERNS = {
  INHABILIDAD_REP_LEGAL: {
    points: 45,
    layer: "croma",
    weighsIn: "ambos",
    description: "Antecedente fiscal/disciplinario vigente del representante",
    implemented: false,
  },
  PROVEEDOR_RECIENTE: {
    points: 40,
    layer: "croma",
    weighsIn: "ambos",
    description: "Empresa <90 días y/o capital mínimo vs cuantía",
    implemented: false,
  },
  ADICIONES_50: {
    points: 40,
    layer: "rules",
    weighsIn: "historico",
    description: "Adiciones acumuladas >50% del valor inicial (Ley 80 art. 40)",
    // El dataset de contratos (jbjy-vk9h) no trae valor inicial ni valor
    // adicionado. Requiere cruce con el dataset SECOP II - Adiciones (cb9c-h8sn).
    implemented: false,
  },
  FRACCIONAMIENTO: {
    points: 30,
    layer: "rules",
    weighsIn: "ambos",
    description: "Contratos pequeños repetidos, mismo proveedor+entidad+objeto",
    implemented: true,
  },
  PLIEGO_SASTRE: {
    points: 25,
    layer: "llm",
    weighsIn: "ambos",
    description: "Ficha técnica que restringe competencia (cita textual + página)",
    implemented: false,
  },
  DESEQUILIBRIO_PAGOS: {
    points: 25,
    layer: "rules",
    weighsIn: "vigente",
    description: "% pagado ≫ % de tiempo transcurrido del contrato",
    implemented: true,
  },
  PLAZO_RELAMPAGO: {
    points: 25,
    layer: "llm",
    weighsIn: "vigente",
    description: "Ventana de ofertas <3 días hábiles en alta cuantía",
    implemented: false,
  },
  SANCIONES_PREVIAS: {
    points: 25,
    layer: "croma",
    weighsIn: "ambos",
    description: "Sanciones previas del proveedor en SECOP",
    implemented: false,
  },
  CONCENTRACION_PROVEEDOR: {
    points: 20,
    layer: "rules",
    weighsIn: "historico",
    description: "Mismo NIT acumula N contratos con la misma entidad",
    implemented: true,
  },
  OBJETO_CIIU_INCOHERENTE: {
    points: 20,
    layer: "croma",
    weighsIn: "ambos",
    description: "Actividad RUES sin relación con el objeto contratado",
    implemented: false,
  },
  PAGO_ADELANTADO_RIESGO: {
    points: 10,
    layer: "rules",
    weighsIn: "vigente",
    description: "Anticipo habilitado (sube a 30 si proveedor reciente)",
    implemented: true,
  },
  DICIEMBRE: {
    points: 10,
    layer: "rules",
    weighsIn: "historico",
    description: "Firma en diciembre (quema de presupuesto)",
    implemented: true,
  },
  OBJETO_DIFUSO: {
    points: 10,
    layer: "llm",
    weighsIn: "ambos",
    description: "Objeto contractual vago/genérico para la cuantía",
    implemented: true,
  },
} as const satisfies Record<string, PatternSpec>;

export type PatternCode = keyof typeof PATTERNS;

/**
 * Severidad derivada de los puntos. CLAUDE.md fija los pesos, no las
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
