/**
 * Runner de la Capa A: precalcula los agregados de corpus y aplica las reglas.
 *
 * Los agregados se calculan UNA vez sobre el universo completo, no por lote.
 * Es deliberado: VALOR_ATIPICO compara contra el percentil de su grupo y
 * FRACCIONAMIENTO / CONCENTRACION_PROVEEDOR cuentan contratos hermanos. Si el
 * agregado solo viera el lote en curso, el mismo contrato daría un resultado
 * distinto según en qué lote cayera. Un agregado parcial no produce menos
 * hallazgos: produce hallazgos falsos.
 *
 * Los contratos no computables —`vigencia = 'otro'` o `valor_verificar`— quedan
 * fuera de todos los agregados (METODOLOGIA §6.8 y §6.9).
 */
import { RULES } from "./registry";
import { THRESHOLDS, PISO_MATERIALIDAD_COP, MISMO_SUPERVISOR_MIN } from "./thresholds";
import {
  comparablesKey,
  docDigitos,
  entitySupplierKey,
  esComputable,
  pacoVacio,
  supervisorDoc,
} from "./types";
import { daysBetween } from "./format";
import type {
  Comparables,
  ContractRow,
  Finding,
  PacoIndex,
  ParSupervisor,
  RuleContext,
} from "./types";

/** Percentil por interpolación nearest-rank sobre una lista ya ordenada. */
function percentil(ordenados: readonly number[], p: number): number {
  if (!ordenados.length) return 0;
  const rank = Math.ceil((p / 100) * ordenados.length);
  return ordenados[Math.min(ordenados.length - 1, Math.max(0, rank - 1))];
}

function mediana(ordenados: readonly number[]): number {
  if (!ordenados.length) return 0;
  const mid = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[mid - 1] + ordenados[mid]) / 2
    : ordenados[mid];
}

/**
 * Estadísticos de valor por `tipo_de_contrato|departamento`, para VALOR_ATIPICO.
 * Excluye valores no creíbles: uno solo desplazaría el percentil del grupo y
 * haría que contratos caros parecieran normales.
 */
function buildComparables(contracts: readonly ContractRow[]): Map<string, Comparables> {
  const valores = new Map<string, number[]>();

  for (const c of contracts) {
    if (!esComputable(c)) continue;
    if (typeof c.valor_contrato !== "number" || c.valor_contrato <= 0) continue;
    const clave = comparablesKey(c);
    if (!clave) continue;
    const arr = valores.get(clave);
    if (arr) arr.push(c.valor_contrato);
    else valores.set(clave, [c.valor_contrato]);
  }

  const out = new Map<string, Comparables>();
  for (const [clave, arr] of valores) {
    arr.sort((a, b) => a - b);
    out.set(clave, {
      clave,
      n: arr.length,
      mediana: mediana(arr),
      p95: percentil(arr, THRESHOLDS.VALOR_ATIPICO.percentil),
    });
  }
  return out;
}

/** Valor total contratado por cada entidad en la ventana de CONCENTRACION. */
function buildValorPorEntidad(
  contracts: readonly ContractRow[],
  today: string,
): Map<string, number> {
  const ventana = THRESHOLDS.CONCENTRACION_PROVEEDOR.ventanaValorDias;
  const out = new Map<string, number>();
  for (const c of contracts) {
    if (!esComputable(c)) continue;
    if (!c.nit_entidad || typeof c.valor_contrato !== "number") continue;
    const d = daysBetween(c.fecha_firma, today);
    if (d === null || d < 0 || d > ventana) continue;
    out.set(c.nit_entidad, (out.get(c.nit_entidad) ?? 0) + c.valor_contrato);
  }
  return out;
}

/** Agrupa por entidad+proveedor y ordena cada grupo por `fecha_firma`. */
function buildPeers(contracts: readonly ContractRow[]): Map<string, ContractRow[]> {
  const out = new Map<string, ContractRow[]>();
  for (const c of contracts) {
    if (!esComputable(c)) continue;
    const key = entitySupplierKey(c);
    if (!key) continue;
    const grupo = out.get(key);
    if (grupo) grupo.push(c);
    else out.set(key, [c]);
  }
  for (const grupo of out.values()) {
    grupo.sort((a, b) => {
      const fa = a.fecha_firma ?? "";
      const fb = b.fecha_firma ?? "";
      return fa < fb ? -1 : fa > fb ? 1 : 0;
    });
  }
  return out;
}

/**
 * Agregado por par (supervisor, proveedor) y total supervisado por persona,
 * para MISMO_SUPERVISOR.
 */
function buildSupervisorProveedor(
  contracts: readonly ContractRow[],
): Map<string, ParSupervisor> {
  const totalPorSupervisor = new Map<string, number>();
  const pares = new Map<string, ParSupervisor>();

  for (const c of contracts) {
    if (!esComputable(c)) continue;
    const sup = supervisorDoc(c);
    if (!sup) continue;
    totalPorSupervisor.set(sup, (totalPorSupervisor.get(sup) ?? 0) + 1);

    const prov = docDigitos(c.documento_proveedor);
    if (!prov) continue;
    const key = `${sup}|${prov}`;
    const par = pares.get(key) ?? { contratos: 0, valorTotal: 0, totalSupervisados: 0, ids: [] };
    par.contratos += 1;
    par.valorTotal += c.valor_contrato ?? 0;
    par.ids.push(c.id_contrato);
    pares.set(key, par);
  }

  for (const [key, par] of pares) {
    par.totalSupervisados = totalPorSupervisor.get(key.split("|")[0]) ?? par.contratos;
  }
  return pares;
}

/** Construye el contexto completo. Recibe el universo, no un lote. */
export function buildContext(
  contracts: readonly ContractRow[],
  today: string,
  pisoMaterialidad: number = PISO_MATERIALIDAD_COP,
  opts: { paco?: PacoIndex; mismoSupervisorMin?: number } = {},
): RuleContext {
  return {
    peersByEntitySupplier: buildPeers(contracts),
    comparables: buildComparables(contracts),
    valorPorEntidad24m: buildValorPorEntidad(contracts, today),
    supervisorProveedor: buildSupervisorProveedor(contracts),
    paco: opts.paco ?? pacoVacio(),
    mismoSupervisorMin: opts.mismoSupervisorMin ?? MISMO_SUPERVISOR_MIN,
    today,
    pisoMaterialidad,
  };
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
