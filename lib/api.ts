/**
 * Puente entre los endpoints de la plataforma y los tipos que espera la UI.
 *
 * La UI de v0 se diseñó contra `lib/types.ts`, que declara campos no anulables
 * (`nombre_entidad: string`) mientras la base sí admite nulos. Normalizar aquí,
 * en un solo sitio, evita salpicar la UI de `?? ""`.
 */
import type { Contract, Finding } from "./types";

export type MetricasCorpus = {
  contratos_vigilados: number;
  contratos_criticos: number;
  hallazgos: number;
  plata_en_riesgo_p1: number;
  /** Facturado aprobado o radicado sin pagar, en los P1. Plata detenible. */
  por_salir_p1: number;
  contratos_p1: number;
};

const s = (v: unknown, def = ""): string => (v === null || v === undefined ? def : String(v));
const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

export function aContract(row: Record<string, unknown>): Contract {
  return {
    id_contrato: s(row.id_contrato),
    nombre_entidad: s(row.nombre_entidad, "Entidad no registrada"),
    proveedor: s(row.proveedor, "Contratista no registrado"),
    documento_proveedor: s(row.documento_proveedor, "—"),
    objeto: s(row.objeto, "Sin objeto registrado"),
    valor_contrato: n(row.valor_contrato),
    plata_en_riesgo: row.plata_en_riesgo === null ? null : n(row.plata_en_riesgo),
    vigencia: (s(row.vigencia, "otro") as Contract["vigencia"]) ?? "otro",
    estado_contrato: s(row.estado_contrato),
    departamento: s(row.departamento),
    ciudad: s(row.ciudad),
    tipo_de_contrato: s(row.tipo_de_contrato),
    modalidad: s(row.modalidad),
    fecha_firma: s(row.fecha_firma),
    risk_score: row.risk_score === null ? null : n(row.risk_score),
    risk_level: (row.risk_level as Contract["risk_level"]) ?? null,
    prioridad: (row.prioridad as Contract["prioridad"]) ?? null,
    porque_ahora: Array.isArray(row.porque_ahora) ? (row.porque_ahora as string[]) : [],
    url_proceso: s(row.url_proceso),
    valor_verificar: Boolean(row.valor_verificar),
    plata_procedencia: procedenciaPlata(row),
    pagos_en_tramite: row.pagos_en_tramite == null ? null : n(row.pagos_en_tramite),
    pagos_confirmados: row.pagos_confirmados == null ? null : n(row.pagos_confirmados),
    pagos_filas: row.pagos_filas == null ? null : n(row.pagos_filas),
    pagos_ultima_fecha: row.pagos_ultima_fecha == null ? null : s(row.pagos_ultima_fecha),
  };
}

/**
 * ¿De dónde sale la cifra en riesgo? Espeja `detallePlataEnRiesgo` de
 * `lib/rules/priority.ts`, que es donde vive el criterio; aquí solo se traduce
 * la fila de la base a lo que la interfaz necesita saber para no afirmar de más.
 *
 * El caso que obliga a distinguir: 12.784 contratos vigentes declaran
 * `valor_pagado = 0`. Con el plan de pagos de SECOP se sabe si ese cero es un
 * hecho (hay facturas, ninguna pagada) o un vacío de reporte (no hay nada).
 */
function procedenciaPlata(row: Record<string, unknown>): Contract["plata_procedencia"] {
  const filas = row.pagos_filas == null ? 0 : n(row.pagos_filas);
  if (filas > 0) return "corroborado";

  const vigencia = s(row.vigencia);
  const pagado = row.valor_pagado === null ? null : n(row.valor_pagado);
  if (vigencia === "historico") return pagado !== null && pagado > 0 ? "reportado" : "sin_rastro";

  const valor = row.valor_contrato === null ? null : n(row.valor_contrato);
  const pendiente =
    row.valor_pendiente_ejecucion === null ? null : n(row.valor_pendiente_ejecucion);
  const sinEjecucion =
    (pagado === null || pagado === 0) && (pendiente === null || pendiente === valor);
  return sinEjecucion ? "sin_rastro" : "reportado";
}

/** Un hallazgo del expediente, con su norma ya resuelta desde el catálogo. */
export function aFinding(h: Record<string, any>): Finding {
  return {
    pattern_code: s(h.pattern_code),
    severity: (h.severity ?? "media") as Finding["severity"],
    points: n(h.points),
    confianza: (h.confianza ?? "media") as Finding["confianza"],
    foco: (h.foco ?? "entidad") as Finding["foco"],
    detail: s(h.condicion ?? h.detail),
    evidence: (h.evidence ?? {}) as Record<string, string | number>,
    // El expediente entrega el criterio ya compuesto desde lib/normativa.
    norma: s(h.criterio?.cita ?? h.norma),
    source: (h.source ?? "rules") as Finding["source"],
  };
}

export async function traerContratos(params: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") p.set(k, String(v));
  const r = await fetch(`/api/contracts?${p}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "No se pudieron cargar los contratos");
  return {
    total: j.total as number,
    contratos: (j.contratos as Record<string, unknown>[]).map(aContract),
    patrones: (j.patrones ?? {}) as Record<string, string[]>,
  };
}

export async function traerMetricas(): Promise<MetricasCorpus> {
  const r = await fetch("/api/metrics");
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "No se pudieron cargar las métricas");
  return j as MetricasCorpus;
}
