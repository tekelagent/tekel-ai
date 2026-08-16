/** Utilidades de presentación compartidas por la UI. */

/** Pesos colombianos abreviados: los valores van de miles a billones. */
export function cop(n: number | null | undefined, abreviar = true): string {
  if (n === null || n === undefined) return "—";
  if (!abreviar) return `$${Math.round(n).toLocaleString("es-CO")}`;
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(1)} B`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)} mM`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(0)} M`;
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

export function fecha(s: string | null | undefined): string {
  if (!s) return "—";
  const [a, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Color del semáforo de riesgo, como variable CSS del sistema de diseño. */
export function colorRiesgo(nivel: string | null | undefined): string {
  if (nivel === "critico") return "var(--crit)";
  if (nivel === "medio") return "var(--warn)";
  return "var(--p3)";
}

/** Clases de la píldora de prioridad. */
export function tonoPrioridad(p: string | null | undefined): { bg: string; text: string } {
  if (p === "P1") return { bg: "bg-crit-soft", text: "text-crit" };
  if (p === "P2") return { bg: "bg-warn-soft", text: "text-warn" };
  if (p === "P3") return { bg: "bg-muted", text: "text-p3" };
  return { bg: "bg-muted", text: "text-muted-foreground" };
}

export const ETIQUETA_PRIORIDAD: Record<string, string> = {
  P1: "P1 · Revisar de inmediato",
  P2: "P2 · Esta semana",
  P3: "P3 · Monitoreo",
};

/** Colores de confianza del hallazgo. */
export const COLOR_CONFIANZA: Record<string, string> = {
  alta: "bg-ok-soft text-ok",
  media: "bg-warn-soft text-warn",
  baja: "bg-muted text-muted-foreground",
};

/**
 * Origen del hallazgo, para que el usuario sepa qué lo produjo.
 * Es una distinción sustantiva: una regla determinista es reproducible, un
 * registro oficial es verificable en la fuente, y una salida de IA merece más
 * escrutinio que ninguna de las dos.
 */
export const ETIQUETA_FUENTE: Record<string, { texto: string; clase: string }> = {
  rules: { texto: "Regla verificable", clase: "bg-ok-soft text-ok" },
  croma: { texto: "Registro oficial", clase: "bg-brand-soft text-accent-foreground" },
  llm: { texto: "Análisis con IA", clase: "bg-warn-soft text-warn" },
};

/** Patrones que provienen de cruces con registros oficiales (PACO / Croma). */
const PATRONES_REGISTRO = new Set([
  "INHABILIDAD_REP_LEGAL",
  "SANCIONES_PREVIAS",
  "COLUSION_PREVIA",
  "ANTECEDENTE_OBRA_INCONCLUSA",
  "OBRA_INCONCLUSA",
  "MOROSO_BDME",
  "PROVEEDOR_RECIENTE",
  "OBJETO_CIIU_INCOHERENTE",
]);

/**
 * La fuente que ve el usuario no siempre es la columna `source`: los cruces
 * contra PACO se escriben como `rules` porque los ejecuta el motor determinista,
 * pero para quien lee son registros oficiales, no una heurística nuestra.
 */
export function fuenteDeHallazgo(source: string, patternCode: string) {
  if (source === "llm") return ETIQUETA_FUENTE.llm;
  if (source === "croma" || PATRONES_REGISTRO.has(patternCode)) return ETIQUETA_FUENTE.croma;
  return ETIQUETA_FUENTE.rules;
}

/** Los 21 patrones, para el filtro. */
export const PATRONES = [
  "INHABILIDAD_REP_LEGAL",
  "COLUSION_PREVIA",
  "PROVEEDOR_RECIENTE",
  "ADICIONES_50",
  "MOROSO_BDME",
  "OBRA_INCONCLUSA",
  "FRACCIONAMIENTO",
  "ANTECEDENTE_OBRA_INCONCLUSA",
  "PLIEGO_SASTRE",
  "DESEQUILIBRIO_PAGOS",
  "PLAZO_RELAMPAGO",
  "SANCIONES_PREVIAS",
  "VALOR_ATIPICO",
  "EJECUCION_ANOMALA",
  "LICITANTE_UNICO",
  "CONCENTRACION_PROVEEDOR",
  "OBJETO_CIIU_INCOHERENTE",
  "MISMO_SUPERVISOR",
  "PAGO_ADELANTADO_RIESGO",
  "DICIEMBRE",
  "OBJETO_DIFUSO",
] as const;

export const AVISO_LEGAL =
  "Tekel Agent señala indicadores de riesgo verificables en fuentes oficiales. " +
  "No constituye imputación, acusación ni prueba de responsabilidad.";
