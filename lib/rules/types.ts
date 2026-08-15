/**
 * Tipos compartidos de la Capa A (motor de reglas deterministas).
 *
 * Las reglas son funciones puras: reciben una fila de `contracts` y, cuando
 * necesitan mirar el corpus, reciben agregados YA CALCULADOS como parámetro.
 * Ninguna regla consulta la base de datos por dentro — eso las hace testeables
 * sin red y auditables de un vistazo (METODOLOGIA §6.1).
 */
import type { Foco } from "../normativa/catalog";

export type Severity = "critica" | "alta" | "media";
export type FindingSource = "rules" | "llm" | "croma";
export type Vigencia = "vigente" | "historico" | "otro";
/** Según completitud de los datos que sustentan el hallazgo (METODOLOGIA §3). */
export type Confianza = "alta" | "media" | "baja";

export type { Foco };

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
  url_proceso: string | null;
  /** true = el valor reportado es inverosímil (METODOLOGIA §6.8). */
  valor_verificar: boolean;
  /** Fila cruda de SECOP. Las reglas la usan solo para campos no mapeados. */
  raw: Record<string, unknown> | null;
};

/**
 * Hallazgo tal como se escribe en `findings`. El `unique (contract_id,
 * pattern_code, source)` de la tabla hace idempotente re-correr el motor.
 */
export type Finding = {
  contract_id: string;
  pattern_code: string;
  severity: Severity;
  points: number;
  /** Completitud de los datos que lo sustentan (METODOLOGIA §3). */
  confianza: Confianza;
  /** A quién apunta la verificación. Sale del catálogo normativo. */
  foco: Foco;
  /** Explicación en español, entendible por un ciudadano sin formación jurídica. */
  detail: string;
  /** Las cifras concretas que dispararon la regla. Nunca texto genérico. */
  evidence: Record<string, unknown>;
  source: FindingSource;
};

/** Estadísticos de un grupo de comparables, para VALOR_ATIPICO. */
export type Comparables = {
  /** `tipo_de_contrato|departamento`. */
  clave: string;
  n: number;
  mediana: number;
  p95: number;
};

/**
 * Agregados de corpus que las reglas de conjunto necesitan. Se calculan una vez
 * en el runner sobre el universo completo y se inyectan; así VALOR_ATIPICO,
 * FRACCIONAMIENTO y CONCENTRACION_PROVEEDOR siguen siendo funciones puras.
 */
export type RuleContext = {
  /**
   * Contratos agrupados por `nit_entidad|documento_proveedor`, ordenados por
   * `fecha_firma` ascendente. Incluye al contrato evaluado.
   */
  peersByEntitySupplier: Map<string, ContractRow[]>;
  /** Estadísticos de valor por `tipo_de_contrato|departamento`. */
  comparables: Map<string, Comparables>;
  /** Valor total contratado por cada `nit_entidad` en los últimos 24 meses. */
  valorPorEntidad24m: Map<string, number>;
  /** Fecha de referencia YYYY-MM-DD. Inyectable para tests deterministas. */
  today: string;
  /** Piso de materialidad en COP (METODOLOGIA §4). */
  pisoMaterialidad: number;
};

/** Una regla determinista de la Capa A. */
export type Rule = {
  code: string;
  /** Devuelve el hallazgo, o null si el patrón no se cumple o la regla se abstiene. */
  run(contract: ContractRow, ctx: RuleContext): Finding | null;
};

/** Clave de agrupación entidad+proveedor usada por las reglas de conjunto. */
export function entitySupplierKey(c: ContractRow): string | null {
  if (!c.nit_entidad || !c.documento_proveedor) return null;
  return `${c.nit_entidad}|${c.documento_proveedor}`;
}

/** Clave de comparables usada por VALOR_ATIPICO. */
export function comparablesKey(c: ContractRow): string | null {
  if (!c.tipo_de_contrato || !c.departamento) return null;
  return `${c.tipo_de_contrato}|${c.departamento}`;
}

/**
 * Un contrato entra a los agregados y al triaje solo si su vigencia es real y
 * su valor es creíble (METODOLOGIA §6.8 y §6.9).
 */
export function esComputable(c: ContractRow): boolean {
  return c.vigencia !== "otro" && !c.valor_verificar;
}
