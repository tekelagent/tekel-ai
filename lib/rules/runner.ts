/**
 * Runner de la Capa A: construye el contexto agregado y aplica todas las reglas.
 *
 * El contexto se calcula UNA vez sobre el universo completo de contratos, no
 * por lote. Es deliberado: FRACCIONAMIENTO y CONCENTRACION_PROVEEDOR cuentan
 * contratos hermanos, y si el agrupamiento solo viera el lote en curso, el
 * mismo contrato daría un conteo distinto según en qué lote le tocara caer.
 * Un contexto parcial no produce menos hallazgos: produce hallazgos falsos.
 */
import { RULES } from "./registry";
import { entitySupplierKey } from "./types";
import type { ContractRow, Finding, RuleContext } from "./types";

/**
 * Agrupa por entidad+proveedor y ordena cada grupo por `fecha_firma`.
 * Recibe el universo completo de contratos a evaluar.
 */
export function buildContext(contracts: readonly ContractRow[], today: string): RuleContext {
  const peersByEntitySupplier = new Map<string, ContractRow[]>();

  for (const c of contracts) {
    const key = entitySupplierKey(c);
    if (!key) continue;
    const grupo = peersByEntitySupplier.get(key);
    if (grupo) grupo.push(c);
    else peersByEntitySupplier.set(key, [c]);
  }

  for (const grupo of peersByEntitySupplier.values()) {
    grupo.sort((a, b) => {
      const fa = a.fecha_firma ?? "";
      const fb = b.fecha_firma ?? "";
      return fa < fb ? -1 : fa > fb ? 1 : 0;
    });
  }

  return { peersByEntitySupplier, today };
}

/** Aplica todas las reglas registradas a un contrato. */
export function runRules(contract: ContractRow, ctx: RuleContext): Finding[] {
  const hallazgos: Finding[] = [];
  for (const rule of RULES) {
    const f = rule.run(contract, ctx);
    if (f) hallazgos.push(f);
  }
  return hallazgos;
}

/** Aplica todas las reglas a un conjunto de contratos. */
export function runRulesOnAll(
  contracts: readonly ContractRow[],
  ctx: RuleContext,
): Map<string, Finding[]> {
  const porContrato = new Map<string, Finding[]>();
  for (const c of contracts) {
    porContrato.set(c.id, runRules(c, ctx));
  }
  return porContrato;
}

/** Fecha de hoy en `YYYY-MM-DD` (UTC), para usar como `today` por defecto. */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}
