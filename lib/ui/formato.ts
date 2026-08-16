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

/** Colores por prioridad. P1 es lo que hay que mirar hoy. */
export const COLOR_PRIORIDAD: Record<string, string> = {
  P1: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  P2: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  P3: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
};

export const COLOR_NIVEL: Record<string, string> = {
  critico: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  medio: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  bajo: "bg-slate-500/15 text-slate-400 ring-slate-500/30",
};

export const ETIQUETA_PRIORIDAD: Record<string, string> = {
  P1: "P1 · Revisar de inmediato",
  P2: "P2 · Esta semana",
  P3: "P3 · Monitoreo",
};

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
