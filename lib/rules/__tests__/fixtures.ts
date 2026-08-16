/**
 * Fixtures para los tests de reglas.
 *
 * `contract()` devuelve un contrato deliberadamente inocuo: no dispara ninguna
 * regla. Cada test sobreescribe solo los campos que le interesan, así queda
 * explícito qué es lo que hace saltar la regla.
 */
import { buildContext } from "../runner";
import { PISO_MATERIALIDAD_COP } from "../thresholds";
import type { ContractRow, Finding, RuleContext } from "../types";

let seq = 0;

export function contract(overrides: Partial<ContractRow> = {}): ContractRow {
  seq += 1;
  return {
    id: `00000000-0000-0000-0000-${String(seq).padStart(12, "0")}`,
    id_contrato: `CO1.PCCNTR.${seq}`,
    proceso_de_compra: `CO1.BDOS.${seq}`,
    nombre_entidad: "ALCALDIA DE PRUEBA",
    nit_entidad: "800000000",
    departamento: "Atlántico",
    ciudad: "Barranquilla",
    tipo_de_contrato: "Prestación de servicios",
    modalidad: "Contratación directa",
    objeto: "Prestación de servicios de apoyo a la gestión",
    estado_contrato: "En ejecución",
    vigencia: "vigente",
    valor_contrato: 10_000_000,
    valor_pagado: 0,
    valor_facturado: 0,
    valor_pendiente_ejecucion: 0,
    pago_adelantado: false,
    valor_pago_adelantado: 0,
    dias_adicionados: 0,
    // Marzo: ni diciembre, para no disparar DICIEMBRE sin querer.
    fecha_firma: "2025-03-01",
    fecha_inicio: "2025-03-01",
    fecha_fin: "2025-12-31",
    documento_proveedor: "111111111",
    proveedor: "PROVEEDOR DE PRUEBA",
    representante_id: "22222222",
    url_proceso: "https://community.secop.gov.co/Public/Tendering/prueba",
    valor_verificar: false,
    // Sin plan de pagos por defecto: el contrato inocuo no debe apoyarse en
    // una fuente que la mayoría de los tests no está ejercitando.
    pagos_confirmados: null,
    pagos_en_tramite: null,
    pagos_filas: null,
    pagos_ultima_fecha: null,
    supervisor_nombre: null,
    supervisor_documento: null,
    raw: {},
    ...overrides,
  };
}

/** Contexto con `today` fijo: los tests no pueden depender de la fecha real. */
export function ctxOf(
  contracts: readonly ContractRow[],
  today = "2025-06-30",
  piso: number = PISO_MATERIALIDAD_COP,
): RuleContext {
  return buildContext(contracts, today, piso);
}

/** Contexto de un solo contrato, para las reglas que no miran a sus pares. */
export function soloCtx(
  c: ContractRow,
  today = "2025-06-30",
  piso: number = PISO_MATERIALIDAD_COP,
): RuleContext {
  return buildContext([c], today, piso);
}

/** Hallazgo mínimo para tests de scoring y priorización. */
export function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    contract_id: "c1",
    pattern_code: "DICIEMBRE",
    severity: "media",
    points: 10,
    confianza: "alta",
    foco: "entidad",
    detail: "",
    evidence: {},
    source: "rules",
    ...overrides,
  };
}
