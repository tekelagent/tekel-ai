/**
 * Mapeo de una fila de SECOP II (dataset jbjy-vk9h) a la tabla `contracts`.
 *
 * Vive aquí y no en el script de ingesta porque hay DOS caminos que escriben
 * contratos: el batch del corpus y el análisis en vivo de un contrato que el
 * usuario busca y no está en la base. Si esos dos mapeos divergen aunque sea en
 * una columna, el contrato traído en vivo se comporta distinto al del corpus y
 * el motor de reglas produce resultados incoherentes.
 *
 * Los nombres de columna del dataset viven SOLO aquí.
 */

export const DATASET = "jbjy-vk9h";
export const SOCRATA_BASE = `https://www.datos.gov.co/resource/${DATASET}.json`;

/** Columnas del dataset que el mapeo usa como clave. */
export const COL = {
  firma: "fecha_de_firma",
  fin: "fecha_de_fin_del_contrato",
  depto: "departamento",
  ciudad: "ciudad",
} as const;

const VIGENTES = ["en ejecución", "en ejecucion", "activo", "modificado", "suspendido", "prorrogado"];
const HISTORICOS = ["terminado", "liquidado", "cerrado", "cedido", "terminado anormalmente"];
/**
 * Estados previos a la ejecución, o que la abortaron antes de empezar. No mueven
 * dinero: un borrador no es plata en riesgo y un cancelado no es evidencia
 * histórica. Se evalúan ANTES del fallback por fecha, que de lo contrario los
 * metía en 'vigente' por tener fecha_fin futura.
 */
const PRE_EJECUCION = ["borrador", "en aprobación", "en aprobacion", "cancelado"];

/** Un billón COP: por encima de eso, en un corpus departamental, es error de reporte. */
export const VALOR_INVEROSIMIL_COP = 1e12;

export function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return null;
}

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n === null ? null : Math.round(n);
}

export function toBool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  if (["si", "sí", "true", "1", "yes"].includes(s)) return true;
  if (["no", "false", "0"].includes(s)) return false;
  return null;
}

export function toDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function toUrl(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "object" && v !== null && "url" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>).url);
  }
  return String(v);
}

export function computeVigencia(
  estado: string | null,
  fechaFin: string | null,
  hoy: string,
): "vigente" | "historico" | "otro" {
  const e = (estado ?? "").trim().toLowerCase();
  if (PRE_EJECUCION.includes(e)) return "otro";
  if (VIGENTES.includes(e)) return "vigente";
  if (HISTORICOS.includes(e)) return "historico";
  // Solo para estado nulo o desconocido.
  if (fechaFin) return fechaFin >= hoy ? "vigente" : "historico";
  return "otro";
}

/**
 * Marca valores imposibles SIN corregirlos: que una entidad reporte una cifra
 * imposible es en sí un dato de transparencia (METODOLOGIA §6.8).
 */
export function esValorInverosimil(valor: number | null, pagado: number | null): boolean {
  if (valor !== null && valor > VALOR_INVEROSIMIL_COP) return true;
  if ((valor ?? 0) <= 0 && (pagado ?? 0) > 0) return true;
  return false;
}

/** Fila cruda de Socrata → fila de `contracts`. null si no tiene identificador. */
export function mapRow(r: Record<string, unknown>, hoy = new Date().toISOString().slice(0, 10)) {
  const estado = (pick(r, ["estado_contrato", "estado_del_contrato"]) as string) ?? null;
  const fechaFin = toDate(pick(r, [COL.fin, "fecha_fin_del_contrato"]));
  const idContrato = pick(r, ["id_contrato", "id_del_contrato"]);
  if (!idContrato) return null;

  const valorContrato = toNum(pick(r, ["valor_del_contrato"]));
  const valorPagado = toNum(pick(r, ["valor_pagado"]));

  return {
    id_contrato: String(idContrato),
    proceso_de_compra: pick(r, ["proceso_de_compra"]) as string | null,
    referencia: pick(r, ["referencia_del_contrato"]) as string | null,
    nombre_entidad: pick(r, ["nombre_entidad", "nombre_de_la_entidad"]) as string | null,
    nit_entidad: pick(r, ["nit_entidad", "nit_de_la_entidad"]) as string | null,
    departamento: pick(r, [COL.depto]) as string | null,
    ciudad: pick(r, [COL.ciudad, "municipio"]) as string | null,
    tipo_de_contrato: pick(r, ["tipo_de_contrato"]) as string | null,
    modalidad: pick(r, ["modalidad_de_contratacion", "modalidad_de_contrataci_n"]) as string | null,
    objeto: pick(r, [
      "objeto_del_contrato",
      "descripcion_del_proceso",
      "descripci_n_del_proceso",
    ]) as string | null,
    estado_contrato: estado,
    vigencia: computeVigencia(estado, fechaFin, hoy),
    valor_contrato: valorContrato,
    valor_pagado: valorPagado,
    valor_verificar: esValorInverosimil(valorContrato, valorPagado),
    valor_facturado: toNum(pick(r, ["valor_facturado"])),
    valor_pendiente_ejecucion: toNum(
      pick(r, ["valor_pendiente_de_ejecucion", "valor_pendiente_de_ejecuci_n"]),
    ),
    pago_adelantado: toBool(pick(r, ["habilita_pago_adelantado"])),
    valor_pago_adelantado: toNum(pick(r, ["valor_de_pago_adelantado"])),
    dias_adicionados: toInt(pick(r, ["dias_adicionados", "d_as_adicionados"])),
    fecha_firma: toDate(pick(r, [COL.firma])),
    fecha_inicio: toDate(pick(r, ["fecha_de_inicio_del_contrato"])),
    fecha_fin: fechaFin,
    documento_proveedor: pick(r, ["documento_proveedor"]) as string | null,
    proveedor: pick(r, ["proveedor_adjudicado"]) as string | null,
    es_pyme: toBool(pick(r, ["es_pyme"])),
    representante_legal: pick(r, ["nombre_representante_legal"]) as string | null,
    representante_id: pick(r, [
      "identificaci_n_representante_legal",
      "identificacion_representante_legal",
    ]) as string | null,
    url_proceso: toUrl(pick(r, ["urlproceso", "url_proceso"])),
    raw: r,
  };
}

export type ContratoMapeado = NonNullable<ReturnType<typeof mapRow>>;

/**
 * Trae UN contrato de Socrata por su identificador público. Es lo que permite
 * que el jurado busque cualquier contrato de Colombia, no solo el corpus.
 */
export async function traerContratoEnVivo(
  idContrato: string,
): Promise<ContratoMapeado | null> {
  const headers: Record<string, string> = {
    "User-Agent": "TekelAgent/0.1 (auditoria de contratacion publica)",
  };
  if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;

  const p = new URLSearchParams();
  p.set("$where", `id_contrato='${idContrato.replace(/'/g, "''")}'`);
  p.set("$limit", "1");

  const res = await fetch(`${SOCRATA_BASE}?${p.toString()}`, { headers });
  if (!res.ok) throw new Error(`Socrata ${res.status}`);
  const filas = (await res.json()) as Record<string, unknown>[];
  if (!filas.length) return null;
  return mapRow(filas[0]);
}
