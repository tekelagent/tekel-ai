#!/usr/bin/env tsx
/**
 * Tekel Agent — Capa A: aplica el motor de reglas y el triaje sobre `contracts`.
 *
 * Uso:
 *   infisical run --env=dev -- pnpm apply-rules
 *   infisical run --env=dev -- pnpm apply-rules --dry-run
 *   infisical run --env=dev -- pnpm apply-rules --piso 200000000
 *
 * Flags:
 *   --dry-run          calcula y reporta, no escribe nada
 *   --batch-size <n>   tamaño de lote de escritura (default 500)
 *   --today <fecha>    fecha de referencia YYYY-MM-DD (default: hoy en UTC)
 *   --piso <cop>       piso de materialidad (default 100.000.000)
 *
 * Idempotente (METODOLOGIA §6.7). Correrlo dos veces deja la base igual:
 *   - los hallazgos se escriben con upsert sobre el unique
 *     (contract_id, pattern_code, source), así que no se duplican;
 *   - los hallazgos de `rules` que ya no aplican se borran;
 *   - risk_score se recalcula entero desde los hallazgos vigentes de TODAS las
 *     capas, nunca se acumula sobre el valor anterior.
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { RULES } from "../lib/rules/registry";
import { buildContext, runRules, todayUTC } from "../lib/rules/runner";
import { triar, type Prioridad } from "../lib/rules/priority";
import { PISO_MATERIALIDAD_COP } from "../lib/rules/thresholds";
import type { ContractRow, Finding } from "../lib/rules/types";

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    "batch-size": { type: "string", default: "500" },
    today: { type: "string" },
    piso: { type: "string" },
  },
});

const BATCH = Math.max(1, Number(args["batch-size"]) || 500);
const TODAY = args.today ?? todayUTC();
const PISO = args.piso ? Number(args.piso) : PISO_MATERIALIDAD_COP;
const DRY = args["dry-run"];

/**
 * Columnas que leen las reglas. De `raw` solo se pide el subcampo de
 * liquidación que necesita EJECUCION_ANOMALA: traer la fila cruda completa de
 * 20.000 contratos serían decenas de MB por la red para leer un "Si"/"No".
 */
const COLUMNS = [
  "id",
  "id_contrato",
  "nombre_entidad",
  "nit_entidad",
  "departamento",
  "ciudad",
  "tipo_de_contrato",
  "modalidad",
  "objeto",
  "estado_contrato",
  "vigencia",
  "valor_contrato",
  "valor_pagado",
  "valor_facturado",
  "valor_pendiente_ejecucion",
  "pago_adelantado",
  "valor_pago_adelantado",
  "dias_adicionados",
  "fecha_firma",
  "fecha_inicio",
  "fecha_fin",
  "documento_proveedor",
  "proveedor",
  "url_proceso",
  "valor_verificar",
  "liquidacion:raw->>liquidaci_n",
].join(",");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Lanza el script con: infisical run --env=dev -- pnpm apply-rules");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/**
 * Carga TODO el universo, no un lote: VALOR_ATIPICO compara contra el percentil
 * de su grupo y FRACCIONAMIENTO / CONCENTRACION cuentan contratos hermanos. Un
 * agregado parcial no produce menos hallazgos, produce hallazgos falsos.
 */
async function loadAllContracts(): Promise<ContractRow[]> {
  const PAGE = 1000;
  const todos: ContractRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("contracts")
      .select(COLUMNS)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Supabase select: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data as unknown as Array<Record<string, unknown>>) {
      const { liquidacion, ...resto } = row;
      todos.push({
        ...(resto as unknown as ContractRow),
        raw: liquidacion === null || liquidacion === undefined ? {} : { "liquidaci_n": liquidacion },
      });
    }
    process.stdout.write(`\r  cargados ${todos.length} contratos…`);
    if (data.length < PAGE) break;
  }
  process.stdout.write("\n");
  return todos;
}

/** Hallazgos de otras capas (llm, croma), para que el score los sume también. */
async function loadOtherLayerFindings(): Promise<Map<string, Finding[]>> {
  const PAGE = 1000;
  const porContrato = new Map<string, Finding[]>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("findings")
      .select("contract_id,points,pattern_code,confianza")
      .neq("source", "rules")
      .order("contract_id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Supabase select findings: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data as Array<Record<string, unknown>>) {
      const id = row.contract_id as string;
      const arr = porContrato.get(id) ?? [];
      arr.push(row as unknown as Finding);
      porContrato.set(id, arr);
    }
    if (data.length < PAGE) break;
  }
  return porContrato;
}

/** Escribe los hallazgos de un lote y borra los de `rules` que dejaron de aplicar. */
async function writeFindings(findings: Finding[], contractIds: string[]) {
  if (findings.length) {
    const { error } = await supabase
      .from("findings")
      .upsert(findings, { onConflict: "contract_id,pattern_code,source" });
    if (error) throw new Error(`Supabase upsert findings: ${error.message}`);
  }

  // Limpieza de hallazgos obsoletos: sin esto el script sería idempotente solo
  // hacia arriba, y un contrato que dejó de disparar arrastraría el hallazgo.
  const emitidosPorCodigo = new Map<string, Set<string>>();
  for (const f of findings) {
    const set = emitidosPorCodigo.get(f.pattern_code) ?? new Set<string>();
    set.add(f.contract_id);
    emitidosPorCodigo.set(f.pattern_code, set);
  }

  for (const rule of RULES) {
    const emitidos = emitidosPorCodigo.get(rule.code) ?? new Set<string>();
    const sinHallazgo = contractIds.filter((id) => !emitidos.has(id));
    if (!sinHallazgo.length) continue;
    // Se trocea: cientos de UUID en la query string revientan la petición.
    for (let i = 0; i < sinHallazgo.length; i += 100) {
      const { error } = await supabase
        .from("findings")
        .delete()
        .eq("source", "rules")
        .eq("pattern_code", rule.code)
        .in("contract_id", sinHallazgo.slice(i, i + 100));
      if (error) throw new Error(`Supabase delete findings: ${error.message}`);
    }
  }
}

type FilaTriaje = {
  id: string;
  id_contrato: string;
  risk_score: number;
  risk_level: string;
  prioridad: Prioridad | null;
  plata_en_riesgo: number | null;
  porque_ahora: string[];
};

async function writeTriaje(filas: FilaTriaje[]) {
  if (!filas.length) return;
  // Se incluye id_contrato porque el upsert construye la tupla de INSERT antes
  // de resolver el conflicto, y esa columna es NOT NULL.
  const { error } = await supabase.from("contracts").upsert(filas, { onConflict: "id" });
  if (error) throw new Error(`Supabase upsert contracts: ${error.message}`);
}

async function main() {
  console.log(`Capa A — motor de reglas y triaje${DRY ? " (dry-run)" : ""}`);
  console.log(`  fecha de referencia:  ${TODAY}`);
  console.log(`  piso de materialidad: $${PISO.toLocaleString("es-CO")} COP`);
  console.log(`  reglas activas:       ${RULES.map((r) => r.code).join(", ")}\n`);

  const contratos = await loadAllContracts();
  if (!contratos.length) return console.log("No hay contratos que evaluar.");

  console.log("Precalculando agregados de corpus…");
  const ctx = buildContext(contratos, TODAY, PISO);
  console.log(`  ${ctx.peersByEntitySupplier.size} pares entidad-proveedor`);
  console.log(`  ${ctx.comparables.size} grupos de comparables (tipo × departamento)`);
  const conMasa = [...ctx.comparables.values()].filter((g) => g.n >= 30).length;
  console.log(`  ${conMasa} grupos con >= 30 comparables (los que puede usar VALOR_ATIPICO)`);
  console.log(`  ${ctx.valorPorEntidad24m.size} entidades con valor en ventana de 24 meses`);

  const otrasCapas = DRY ? new Map<string, Finding[]>() : await loadOtherLayerFindings();
  console.log(`  ${otrasCapas.size} contratos con hallazgos de otras capas\n`);

  const porPatron = new Map<string, number>();
  const porConfianza = new Map<string, number>();
  const porNivel = new Map<string, number>();
  const porPrioridad = new Map<string, number>();
  let totalFindings = 0;
  let computables = 0;
  let plataP1 = 0;

  for (let i = 0; i < contratos.length; i += BATCH) {
    const lote = contratos.slice(i, i + BATCH);
    const findingsLote: Finding[] = [];
    const triajeLote: FilaTriaje[] = [];

    for (const c of lote) {
      const hallazgos = runRules(c, ctx);
      findingsLote.push(...hallazgos);
      for (const h of hallazgos) {
        porPatron.set(h.pattern_code, (porPatron.get(h.pattern_code) ?? 0) + 1);
        porConfianza.set(h.confianza, (porConfianza.get(h.confianza) ?? 0) + 1);
      }

      const todos = [...hallazgos, ...(otrasCapas.get(c.id) ?? [])];
      const t = triar(c, todos, { today: TODAY, pisoMaterialidad: PISO });

      if (c.vigencia !== "otro" && !c.valor_verificar) computables++;
      porNivel.set(t.risk_level, (porNivel.get(t.risk_level) ?? 0) + 1);
      porPrioridad.set(t.prioridad ?? "sin_prioridad", (porPrioridad.get(t.prioridad ?? "sin_prioridad") ?? 0) + 1);
      if (t.prioridad === "P1" && t.plata_en_riesgo) plataP1 += t.plata_en_riesgo;

      triajeLote.push({
        id: c.id,
        id_contrato: c.id_contrato,
        risk_score: t.risk_score,
        risk_level: t.risk_level,
        prioridad: t.prioridad,
        plata_en_riesgo: t.plata_en_riesgo,
        porque_ahora: t.porque_ahora,
      });
    }

    totalFindings += findingsLote.length;

    if (!DRY) {
      await writeFindings(findingsLote, lote.map((c) => c.id));
      await writeTriaje(triajeLote);
    }

    process.stdout.write(
      `\r  procesados ${Math.min(i + BATCH, contratos.length)}/${contratos.length}, ${totalFindings} hallazgos…`,
    );
  }
  process.stdout.write("\n\n");

  const pct = (n: number, total = contratos.length) => ((n / total) * 100).toFixed(2);

  console.log("HALLAZGOS POR PATRÓN");
  for (const [code, n] of [...porPatron.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(7)}  ${code}`);
  }
  if (!porPatron.size) console.log("  (ninguno)");

  console.log("\nHALLAZGOS POR CONFIANZA");
  for (const nivel of ["alta", "media", "baja"]) {
    console.log(`  ${String(porConfianza.get(nivel) ?? 0).padStart(7)}  ${nivel}`);
  }

  console.log("\nDISTRIBUCIÓN DE risk_level");
  for (const nivel of ["critico", "medio", "bajo"]) {
    const n = porNivel.get(nivel) ?? 0;
    console.log(`  ${String(n).padStart(7)}  ${nivel.padEnd(8)} ${pct(n)}%`);
  }

  console.log("\nDISTRIBUCIÓN DE prioridad");
  for (const p of ["P1", "P2", "P3", "sin_prioridad"]) {
    const n = porPrioridad.get(p) ?? 0;
    console.log(`  ${String(n).padStart(7)}  ${p.padEnd(14)} ${pct(n)}%`);
  }
  console.log(`\n  Plata en riesgo acumulada en P1: $${Math.round(plataP1).toLocaleString("es-CO")} COP`);

  // METODOLOGIA §6.4: calibración esperada ~1-3% crítico.
  const criticos = porNivel.get("critico") ?? 0;
  const pctCritico = (criticos / contratos.length) * 100;
  console.log("\n" + "─".repeat(66));
  console.log("CONTROL DE CALIBRACIÓN — METODOLOGIA §6.4");
  console.log(`  Crítico: ${criticos} de ${contratos.length} contratos (${pctCritico.toFixed(2)}%)`);
  console.log(`  Rango esperado sano: 1-3%`);
  if (pctCritico > 3) {
    console.log(`  >> FUERA DE RANGO POR ARRIBA. Hay que ajustar umbrales, no el mundo.`);
    console.log(`     No se toca nada sin decisión explícita.`);
  } else if (pctCritico < 1) {
    console.log(`  >> POR DEBAJO DEL RANGO. El motor puede estar demasiado estricto`);
    console.log(`     o faltarle capas: los patrones de mayor peso son de Capa C.`);
  } else {
    console.log(`  >> DENTRO DE RANGO.`);
  }
  console.log("─".repeat(66));

  console.log(
    `\n${DRY ? "Simulado" : "Listo"}: ${contratos.length} contratos (${computables} computables), ${totalFindings} hallazgos.`,
  );
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
