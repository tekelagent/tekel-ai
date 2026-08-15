#!/usr/bin/env tsx
/**
 * Tekel Agent — Capa A: aplica el motor de reglas sobre `contracts`.
 *
 * Uso:
 *   infisical run --env=dev -- pnpm apply-rules
 *   infisical run --env=dev -- pnpm apply-rules --dry-run
 *   infisical run --env=dev -- pnpm apply-rules --today 2025-06-30
 *
 * Flags:
 *   --dry-run          calcula y reporta, no escribe nada
 *   --batch-size <n>   tamaño de lote de escritura (default 500)
 *   --today <fecha>    fecha de referencia YYYY-MM-DD (default: hoy en UTC)
 *
 * Idempotente. Correrlo dos veces seguidas deja la base exactamente igual:
 *   - los hallazgos se escriben con upsert sobre el unique
 *     (contract_id, pattern_code, source), así que no se duplican;
 *   - los hallazgos de `rules` que ya no aplican se borran, así que un
 *     contrato que dejó de disparar una regla no arrastra el hallazgo viejo;
 *   - risk_score se recalcula entero desde los hallazgos vigentes, nunca se
 *     acumula sobre el valor anterior.
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { RULES } from "../lib/rules/registry";
import { buildContext, runRules, todayUTC } from "../lib/rules/runner";
import { scoreContract } from "../lib/rules/score";
import type { ContractRow, Finding } from "../lib/rules/types";

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    "batch-size": { type: "string", default: "500" },
    today: { type: "string" },
  },
});

const BATCH = Math.max(1, Number(args["batch-size"]) || 500);
const TODAY = args.today ?? todayUTC();
const DRY = args["dry-run"];

/** Columnas que leen las reglas. Traer solo esto mantiene liviana la carga. */
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
 * Carga TODO el universo de contratos, no un lote.
 *
 * FRACCIONAMIENTO y CONCENTRACION_PROVEEDOR cuentan contratos hermanos: si el
 * agrupamiento solo viera el lote en curso, el mismo contrato daría un conteo
 * distinto según en qué lote cayera. Un contexto parcial no produce menos
 * hallazgos, produce hallazgos falsos.
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
    todos.push(...(data as unknown as ContractRow[]));
    process.stdout.write(`\r  cargados ${todos.length} contratos…`);
    if (data.length < PAGE) break;
  }
  process.stdout.write("\n");
  return todos;
}

/** Escribe los hallazgos de un lote y borra los de `rules` que dejaron de aplicar. */
async function writeFindings(findings: Finding[], contractIds: string[]) {
  if (findings.length) {
    const { error } = await supabase
      .from("findings")
      .upsert(findings, { onConflict: "contract_id,pattern_code,source" });
    if (error) throw new Error(`Supabase upsert findings: ${error.message}`);
  }

  // Limpieza de hallazgos obsoletos: por cada regla, borra el hallazgo en los
  // contratos del lote que esta vez NO la dispararon. Sin esto el script sería
  // idempotente solo hacia arriba.
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
    const { error } = await supabase
      .from("findings")
      .delete()
      .eq("source", "rules")
      .eq("pattern_code", rule.code)
      .in("contract_id", sinHallazgo);
    if (error) throw new Error(`Supabase delete findings: ${error.message}`);
  }
}

/**
 * Hallazgos de OTRAS capas (llm, croma), cargados de una vez para todo el
 * universo.
 *
 * El score debe sumar todos los hallazgos vigentes del contrato, no solo los
 * que produce esta capa: sin esto, re-correr la Capa A borraría los puntos que
 * la Capa B ya había aportado.
 *
 * Se carga entero y paginado en vez de consultar por lote con `.in(ids)`,
 * porque esa variante mete cientos de UUID en la query string y la petición
 * revienta.
 */
async function loadOtherLayerFindings(): Promise<Map<string, Finding[]>> {
  const PAGE = 1000;
  const porContrato = new Map<string, Finding[]>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("findings")
      .select("contract_id,points")
      .neq("source", "rules")
      .order("contract_id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Supabase select findings: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data as Array<{ contract_id: string; points: number }>) {
      const arr = porContrato.get(row.contract_id) ?? [];
      arr.push({ points: row.points } as Finding);
      porContrato.set(row.contract_id, arr);
    }
    if (data.length < PAGE) break;
  }
  return porContrato;
}

/** Actualiza risk_score y risk_level de un lote de contratos. */
async function writeScores(
  filas: Array<{ id: string; id_contrato: string; risk_score: number; risk_level: string }>,
) {
  if (!filas.length) return;
  // Se incluye id_contrato porque el upsert construye la tupla de INSERT antes
  // de resolver el conflicto, y esa columna es NOT NULL.
  const { error } = await supabase.from("contracts").upsert(filas, { onConflict: "id" });
  if (error) throw new Error(`Supabase upsert contracts: ${error.message}`);
}

async function main() {
  console.log(`Capa A — motor de reglas. Fecha de referencia: ${TODAY}${DRY ? " (dry-run)" : ""}`);
  console.log(`Reglas activas: ${RULES.map((r) => r.code).join(", ")}\n`);

  const contratos = await loadAllContracts();
  if (!contratos.length) {
    console.log("No hay contratos que evaluar.");
    return;
  }

  console.log("Construyendo contexto de agrupación (entidad+proveedor)…");
  const ctx = buildContext(contratos, TODAY);
  console.log(`  ${ctx.peersByEntitySupplier.size} pares entidad-proveedor distintos`);

  const otrasCapas = DRY ? new Map<string, Finding[]>() : await loadOtherLayerFindings();
  console.log(`  ${otrasCapas.size} contratos con hallazgos de otras capas (llm/croma)\n`);

  const porPatron = new Map<string, number>();
  const porNivel = new Map<string, number>();
  let totalFindings = 0;

  for (let i = 0; i < contratos.length; i += BATCH) {
    const lote = contratos.slice(i, i + BATCH);
    const findingsLote: Finding[] = [];
    const scoresLote: Array<{
      id: string;
      id_contrato: string;
      risk_score: number;
      risk_level: string;
    }> = [];

    for (const c of lote) {
      const hallazgos = runRules(c, ctx);
      findingsLote.push(...hallazgos);
      for (const h of hallazgos) {
        porPatron.set(h.pattern_code, (porPatron.get(h.pattern_code) ?? 0) + 1);
      }
      const { risk_score, risk_level } = scoreContract([
        ...hallazgos,
        ...(otrasCapas.get(c.id) ?? []),
      ]);
      porNivel.set(risk_level, (porNivel.get(risk_level) ?? 0) + 1);
      scoresLote.push({ id: c.id, id_contrato: c.id_contrato, risk_score, risk_level });
    }

    totalFindings += findingsLote.length;

    if (!DRY) {
      await writeFindings(
        findingsLote,
        lote.map((c) => c.id),
      );
      await writeScores(scoresLote);
    }

    process.stdout.write(
      `\r  procesados ${Math.min(i + BATCH, contratos.length)}/${contratos.length} contratos, ${totalFindings} hallazgos…`,
    );
  }
  process.stdout.write("\n\n");

  console.log("Hallazgos por patrón:");
  for (const [code, n] of [...porPatron.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(7)}  ${code}`);
  }
  if (!porPatron.size) console.log("  (ninguno)");

  console.log("\nDistribución de risk_level:");
  for (const nivel of ["critico", "medio", "bajo"]) {
    const n = porNivel.get(nivel) ?? 0;
    const pct = ((n / contratos.length) * 100).toFixed(1);
    console.log(`  ${String(n).padStart(7)}  ${nivel.padEnd(8)} ${pct}%`);
  }

  console.log(
    `\n${DRY ? "Simulado" : "Listo"}: ${contratos.length} contratos evaluados, ${totalFindings} hallazgos.`,
  );
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
