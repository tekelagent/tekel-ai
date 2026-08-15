/**
 * Tipos compartidos de la Capa A (motor de reglas deterministas).
 *
 * Las reglas son funciones puras: reciben una fila de `contracts` y, cuando
 * necesitan mirar otros contratos, reciben ese contexto ya calculado como
 * parámetro. Ninguna regla consulta la base de datos por dentro — eso las hace
 * testeables sin red y auditables de un vistazo.
 */

export type Severity = "critica" | "alta" | "media";
export type FindingSource = "rules" | "llm" | "croma";
export type Vigencia = "vigente" | "historico" | "otro";

/** Fila de `contracts`, acotada a lo que las reglas leen. */
export type ContractRow = {
  id: string;
  id_contrato: string;
  nombre_entidad: string | null;
  nit_entidad: string | null;
  departamento: string | null;
  ciudad: string | null;
  tipo_de_contrato: string | null;
  modalidad: string | null;
  objeto: string | null;
  estado_contrato: string | null;
  vigencia: Vigencia;
  valor_contrato: number | null;
  valor_pagado: number | null;
  valor_facturado: number | null;
  valor_pendiente_ejecucion: number | null;
  pago_adelantado: boolean | null;
  valor_pago_adelantado: number | null;
  dias_adicionados: number | null;
  fecha_firma: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  documento_proveedor: string | null;
  proveedor: string | null;
};

/**
 * Hallazgo tal como se escribe en `findings`. El `unique (contract_id,
 * pattern_code, source)` de la tabla hace que re-correr el motor sea idempotente.
 */
export type Finding = {
  contract_id: string;
  pattern_code: string;
  severity: Severity;
  points: number;
  /** Explicación en español, entendible por un ciudadano sin formación jurídica. */
  detail: string;
  /** Las cifras concretas que dispararon la regla. Nunca texto genérico. */
  evidence: Record<string, unknown>;
  source: FindingSource;
};

/**
 * Contexto agregado que las reglas de conjunto necesitan. Se calcula una vez
 * por lote en el runner y se inyecta; así FRACCIONAMIENTO y
 * CONCENTRACION_PROVEEDOR siguen siendo funciones puras.
 */
export type RuleContext = {
  /**
   * Contratos agrupados por `nit_entidad|documento_proveedor`, ordenados por
   * `fecha_firma` ascendente. Incluye al contrato evaluado.
   */
  peersByEntitySupplier: Map<string, ContractRow[]>;
  /** Fecha de referencia YYYY-MM-DD. Inyectable para que los tests sean deterministas. */
  today: string;
};

/** Una regla determinista de la Capa A. */
export type Rule = {
  code: string;
  /** Devuelve el hallazgo, o null si el patrón no se cumple. */
  run(contract: ContractRow, ctx: RuleContext): Finding | null;
};

/** Clave de agrupación entidad+proveedor usada por las reglas de conjunto. */
export function entitySupplierKey(c: ContractRow): string | null {
  if (!c.nit_entidad || !c.documento_proveedor) return null;
  return `${c.nit_entidad}|${c.documento_proveedor}`;
}
