#!/usr/bin/env tsx
/**
 * Tekel Agent — Capa B: enriquecimiento por LLM barato en lote.
 *
 * Uso:
 *   infisical run --env=dev -- pnpm enrich --limit 20
 *   infisical run --env=dev -- pnpm enrich --limit 20 --show 3
 *   infisical run --env=dev -- pnpm enrich --concurrency 10
 *
 * Flags:
 *   --limit <n>        máximo de contratos a procesar (default: todos los pendientes)
 *   --concurrency <n>  peticiones en paralelo (default 10)
 *   --show <n>         imprime n resúmenes generados al terminar
 *   --dry-run          llama al LLM pero no escribe en la base
 *   --model <slug>     sobreescribe TEKEL_LLM_BULK_MODEL
 *
 * Reanudable: solo procesa contratos con `enriched_at` nulo. Si se corta a la
 * mitad, relanzarlo continúa donde iba en vez de empezar de cero.
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { config } from "../lib/config";
import { OpenRouterProvider, LLMValidationError } from "../lib/providers/llm";
import { EnrichmentSchema, type Enrichment } from "../lib/schemas";
import { focoOf, severityOf } from "../lib/rules/catalog";
import { scoreContract } from "../lib/rules/score";
import type { Finding } from "../lib/rules/types";

const { values: args } = parseArgs({
  options: {
    limit: { type: "string" },
    concurrency: { type: "string", default: "10" },
    show: { type: "string", default: "0" },
    "dry-run": { type: "boolean", default: false },
    model: { type: "string" },
    "max-cost": { type: "string", default: "5" },
  },
});

const LIMIT = args.limit ? Number(args.limit) : Infinity;
const CONCURRENCY = Math.max(1, Number(args.concurrency) || 10);
const SHOW = Number(args.show) || 0;
const DRY = args["dry-run"];
/** Tope de gasto por corrida, en USD. Al alcanzarlo se detiene y reporta. */
const MAX_COST = Number(args["max-cost"]) || 5;

/**
 * Costo acumulado de la corrida. Los workers lo consultan antes de tomar el
 * siguiente contrato: es una barrera de gasto, no una estimación a posteriori.
 */
let costoAcumulado = 0;
let topeAlcanzado = false;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Lanza el script con: infisical run --env=dev -- pnpm enrich");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const llm = new OpenRouterProvider({ model: args.model });

type Pendiente = {
  id: string;
  id_contrato: string;
  nombre_entidad: string | null;
  objeto: string | null;
  tipo_de_contrato: string | null;
  modalidad: string | null;
  valor_contrato: number | null;
  fecha_firma: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  proveedor: string | null;
  vigencia: string;
};

const SYSTEM = `Eres un analista de contratación pública colombiana (SECOP II).

Tu trabajo es describir el riesgo de un contrato con base ÚNICA Y EXCLUSIVAMENTE
en los datos que se te entregan. Reglas estrictas:

1. NUNCA afirmes ni insinúes que hay corrupción, delito, fraude o culpabilidad
   de una persona o empresa. Describes indicadores, no responsabilidades.
2. Si los datos no sustentan un riesgo, dilo con naturalidad: hay contratos
   normales, y decir que uno lo es también es información útil.
3. No inventes cifras, fechas ni hechos que no estén en los datos.
4. Escribe en español claro, para un ciudadano sin formación jurídica.

Responde ÚNICAMENTE con un objeto JSON, sin texto alrededor:
{
  "resumen_riesgo": "dos líneas describiendo el contrato y qué merece atención",
  "objeto_difuso": true | false,
  "objeto_difuso_motivo": "por qué el objeto es vago para su cuantía, o null"
}

"objeto_difuso" es true cuando el objeto contractual es tan genérico que no
permite saber qué se compró exactamente, y esa vaguedad es desproporcionada
frente al monto. Un objeto breve pero preciso NO es difuso.`;

function promptDe(c: Pendiente): string {
  const cop = (n: number | null) => (n === null ? "no registrado" : `$${n.toLocaleString("es-CO")} COP`);
  return `Contrato ${c.id_contrato}
Entidad: ${c.nombre_entidad ?? "no registrada"}
Proveedor: ${c.proveedor ?? "no registrado"}
Objeto: ${c.objeto ?? "no registrado"}
Tipo: ${c.tipo_de_contrato ?? "no registrado"}
Modalidad de selección: ${c.modalidad ?? "no registrada"}
Valor: ${cop(c.valor_contrato)}
Firma: ${c.fecha_firma ?? "no registrada"}
Ejecución: ${c.fecha_inicio ?? "?"} a ${c.fecha_fin ?? "?"}
Estado: ${c.vigencia}`;
}

/** Contratos aún sin enriquecer. Es lo que hace reanudable al script. */
async function loadPendientes(): Promise<Pendiente[]> {
  const PAGE = 1000;
  const todos: Pendiente[] = [];
  for (let offset = 0; todos.length < LIMIT; offset += PAGE) {
    const cuantos = Math.min(PAGE, LIMIT === Infinity ? PAGE : LIMIT - todos.length);
    const { data, error } = await supabase
      .from("contracts")
      .select(
        "id,id_contrato,nombre_entidad,objeto,tipo_de_contrato,modalidad,valor_contrato,fecha_firma,fecha_inicio,fecha_fin,proveedor,vigencia",
      )
      .is("enriched_at", null)
      .order("risk_score", { ascending: false, nullsFirst: false })
      .range(offset, offset + cuantos - 1);
    if (error) throw new Error(`Supabase select: ${error.message}`);
    if (!data || data.length === 0) break;
    todos.push(...(data as unknown as Pendiente[]));
    if (data.length < cuantos) break;
  }
  return todos.slice(0, LIMIT === Infinity ? undefined : LIMIT);
}

/**
 * Recalcula risk_score sumando TODOS los hallazgos del contrato, no solo los de
 * esta capa: si solo sumara el suyo, el hallazgo del LLM pisaría lo que ya
 * calculó la Capa A.
 */
async function rescore(contractId: string, idContrato: string) {
  const { data, error } = await supabase
    .from("findings")
    .select("points")
    .eq("contract_id", contractId);
  if (error) throw new Error(`Supabase select findings: ${error.message}`);
  const puntos = (data ?? []).map((f) => ({ points: f.points }) as Finding);
  const { risk_score, risk_level } = scoreContract(puntos);
  const { error: upErr } = await supabase
    .from("contracts")
    .upsert([{ id: contractId, id_contrato: idContrato, risk_score, risk_level }], {
      onConflict: "id",
    });
  if (upErr) throw new Error(`Supabase upsert score: ${upErr.message}`);
}

async function procesar(c: Pendiente): Promise<{
  ok: boolean;
  costUsd: number;
  retried: boolean;
  resumen?: string;
  difuso?: boolean;
  error?: string;
}> {
  let out: Enrichment;
  let costUsd = 0;
  let retried = false;

  try {
    const res = await llm.structured({
      system: SYSTEM,
      user: promptDe(c),
      schema: EnrichmentSchema,
      schemaName: "EnrichmentSchema",
    });
    out = res.data;
    costUsd = res.usage.costUsd ?? 0;
    retried = res.retried;
    costoAcumulado += costUsd;
    if (costoAcumulado >= MAX_COST) topeAlcanzado = true;
  } catch (err) {
    const msg = err instanceof LLMValidationError ? err.message : String((err as Error).message);
    // Se registra y se omite el contrato: no se escribe nada a medias.
    return { ok: false, costUsd: 0, retried: false, error: msg };
  }

  if (DRY) {
    return { ok: true, costUsd, retried, resumen: out.resumen_riesgo, difuso: out.objeto_difuso };
  }

  // Las escrituras van dentro de try/catch: un fallo de red en un contrato lo
  // marca como omitido y la corrida sigue. Antes tumbaba las 20.000 restantes,
  // y aunque el script es reanudable, cada relanzada vuelve a pagar el arranque.
  try {
    return await escribir(c, out, costUsd, retried);
  } catch (err) {
    return { ok: false, costUsd, retried, error: `escritura: ${(err as Error).message}` };
  }
}

async function escribir(
  c: Pendiente,
  out: Enrichment,
  costUsd: number,
  retried: boolean,
): Promise<{ ok: boolean; costUsd: number; retried: boolean; resumen?: string; difuso?: boolean; error?: string }> {
  const ahora = new Date().toISOString();
  const { error: upErr } = await supabase.from("contracts").upsert(
    [
      {
        id: c.id,
        id_contrato: c.id_contrato,
        resumen_riesgo: out.resumen_riesgo,
        enriched_at: ahora,
      },
    ],
    { onConflict: "id" },
  );
  if (upErr) throw new Error(`Supabase upsert contracts: ${upErr.message}`);

  if (out.objeto_difuso) {
    const finding: Finding = {
      contract_id: c.id,
      pattern_code: "OBJETO_DIFUSO",
      severity: severityOf("OBJETO_DIFUSO"),
      points: 10,
      // El LLM juzga un texto, no una cifra: nunca es evidencia de confianza alta.
      confianza: "media",
      foco: focoOf("OBJETO_DIFUSO"),
      detail:
        `El objeto de este contrato es genérico frente a su cuantía: no permite ` +
        `saber con precisión qué se contrató. ${out.objeto_difuso_motivo ?? ""}`.trim(),
      evidence: {
        objeto: c.objeto,
        valor_contrato: c.valor_contrato,
        motivo: out.objeto_difuso_motivo,
        modelo: llm.model,
      },
      source: "llm",
    };
    const { error: fErr } = await supabase
      .from("findings")
      .upsert([finding], { onConflict: "contract_id,pattern_code,source" });
    if (fErr) throw new Error(`Supabase upsert findings: ${fErr.message}`);
  } else {
    // Si antes se marcó difuso y ahora no, el hallazgo viejo debe irse.
    const { error: dErr } = await supabase
      .from("findings")
      .delete()
      .eq("contract_id", c.id)
      .eq("pattern_code", "OBJETO_DIFUSO")
      .eq("source", "llm");
    if (dErr) throw new Error(`Supabase delete findings: ${dErr.message}`);
  }

  await rescore(c.id, c.id_contrato);

  return { ok: true, costUsd, retried, resumen: out.resumen_riesgo, difuso: out.objeto_difuso };
}

/** Pool de workers: mantiene N peticiones en vuelo sin desbordar el rate limit. */
async function conConcurrencia<T, R>(
  items: T[],
  n: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress: (hechos: number) => void,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let siguiente = 0;
  let hechos = 0;

  async function worker() {
    for (;;) {
      // Barrera de gasto: se comprueba ANTES de tomar el siguiente contrato,
      // no después de haberlo pagado.
      if (topeAlcanzado) return;
      const i = siguiente++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
      hechos++;
      onProgress(hechos);
    }
  }

  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

async function main() {
  console.log(`Capa B — enriquecimiento LLM${DRY ? " (dry-run)" : ""}`);
  console.log(`  modelo:       ${llm.model}`);
  console.log(`  concurrencia: ${CONCURRENCY}`);
  console.log(`  límite:       ${LIMIT === Infinity ? "sin límite" : LIMIT}\n`);

  const pendientes = await loadPendientes();
  if (!pendientes.length) {
    console.log("No hay contratos pendientes de enriquecer.");
    return;
  }
  console.log(`${pendientes.length} contratos pendientes. Procesando…\n`);

  const t0 = Date.now();
  const resultados = await conConcurrencia(pendientes, CONCURRENCY, procesar, (hechos) => {
    process.stdout.write(`\r  ${hechos}/${pendientes.length} procesados…`);
  });
  process.stdout.write("\n\n");

  // Si el tope de costo cortó la corrida, quedan huecos sin procesar.
  const procesados = resultados.filter(Boolean);
  const sinProcesar = pendientes.length - procesados.length;
  const ok = procesados.filter((r) => r.ok);
  const fallidos = procesados.filter((r) => !r.ok);
  const difusos = ok.filter((r) => r.difuso);
  const reintentados = ok.filter((r) => r.retried);
  const costoTotal = procesados.reduce((acc, r) => acc + r.costUsd, 0);
  const segundos = (Date.now() - t0) / 1000;

  if (topeAlcanzado) {
    console.log(`⚠  TOPE DE COSTO ALCANZADO ($${MAX_COST} USD). Corrida detenida.`);
    console.log(`   ${sinProcesar} contratos quedaron sin procesar; relanzar continúa donde iba.\n`);
  }
  console.log(`Procesados:      ${ok.length}/${pendientes.length}`);
  console.log(`OBJETO_DIFUSO:   ${difusos.length}`);
  console.log(`Con reintento:   ${reintentados.length}`);
  console.log(`Omitidos:        ${fallidos.length}`);
  console.log(`Tiempo:          ${segundos.toFixed(1)}s`);
  console.log(`Costo total:     $${costoTotal.toFixed(6)} USD`);
  if (ok.length) {
    console.log(`Costo unitario:  $${(costoTotal / ok.length).toFixed(6)} USD/contrato`);
    console.log(
      `Proyección 20k:  $${((costoTotal / ok.length) * 20000).toFixed(2)} USD`,
    );
  }

  if (fallidos.length) {
    console.log(`\nOmitidos por validación:`);
    for (const f of fallidos.slice(0, 5)) console.log(`  - ${f.error?.slice(0, 200)}`);
  }

  if (SHOW > 0) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`RESÚMENES GENERADOS (primeros ${Math.min(SHOW, ok.length)})`);
    console.log("─".repeat(70));
    let mostrados = 0;
    for (let i = 0; i < resultados.length && mostrados < SHOW; i++) {
      const r = resultados[i];
      if (!r.ok || !r.resumen) continue;
      const c = pendientes[i];
      mostrados++;
      console.log(`\n[${mostrados}] ${c.id_contrato} — ${c.nombre_entidad ?? "?"}`);
      console.log(`    Valor:  $${(c.valor_contrato ?? 0).toLocaleString("es-CO")} COP`);
      console.log(`    Objeto: ${(c.objeto ?? "").slice(0, 120)}${(c.objeto ?? "").length > 120 ? "…" : ""}`);
      console.log(`    OBJETO_DIFUSO: ${r.difuso ? "sí" : "no"}`);
      console.log(`    Resumen: ${r.resumen}`);
    }
  }
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
