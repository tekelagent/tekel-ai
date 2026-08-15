#!/usr/bin/env tsx
/**
 * Tekel Agent — Ingesta SECOP II (datos.gov.co / Socrata) → Supabase
 *
 * Uso:
 *   pnpm tsx scripts/ingest.ts --inspect
 *   pnpm tsx scripts/ingest.ts --values departamento
 *   pnpm tsx scripts/ingest.ts --departamento "Atlántico" --modo vigentes
 *   pnpm tsx scripts/ingest.ts --departamento "Atlántico" --modo historicos --desde 2021-08-15 --max-rows 8000
 *
 * Flags:
 *   --departamento <str>   (repetible)     --ciudad <str> (repetible)
 *   --modo vigentes|historicos|todos       --desde YYYY-MM-DD (fecha_firma >=)
 *   --hasta YYYY-MM-DD                     --max-rows <n>
 *   --page-size <n> (default 1000)         --dry-run (no escribe en Supabase)
 *   --inspect (imprime columnas reales)    --values <col> (top 40 valores de una columna)
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

// ── Dataset y columnas ──────────────────────────────────────────────
// Si --inspect muestra nombres distintos, SOLO se ajusta este mapa.
const DATASET = "jbjy-vk9h"; // SECOP II - Contratos Electrónicos
const BASE = `https://www.datos.gov.co/resource/${DATASET}.json`;
const COL = {
  firma: "fecha_de_firma",
  fin: "fecha_de_fin_del_contrato",
  depto: "departamento",
  ciudad: "ciudad",
};

// ── Args ────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    departamento: { type: "string", multiple: true },
    ciudad: { type: "string", multiple: true },
    modo: { type: "string", default: "todos" },
    desde: { type: "string" },
    hasta: { type: "string" },
    "max-rows": { type: "string" },
    "page-size": { type: "string", default: "1000" },
    "dry-run": { type: "boolean", default: false },
    inspect: { type: "boolean", default: false },
    values: { type: "string" },
  },
});

const PAGE = Math.min(Number(args["page-size"]) || 1000, 5000);
const MAX = args["max-rows"] ? Number(args["max-rows"]) : Infinity;
const TODAY = new Date().toISOString().slice(0, 10);

// ── Helpers ─────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  return null;
}
function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n === null ? null : Math.round(n);
}
function toBool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  if (["si", "sí", "true", "1", "yes"].includes(s)) return true;
  if (["no", "false", "0"].includes(s)) return false;
  return null;
}
function toDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function toUrl(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "object" && v !== null && "url" in (v as any)) return String((v as any).url);
  return String(v);
}

const VIGENTES = ["en ejecución", "en ejecucion", "activo", "modificado", "suspendido", "prorrogado"];
const HISTORICOS = ["terminado", "liquidado", "cerrado", "cedido", "terminado anormalmente"];

function computeVigencia(estado: string | null, fechaFin: string | null): "vigente" | "historico" | "otro" {
  const e = (estado ?? "").trim().toLowerCase();
  if (VIGENTES.includes(e)) return "vigente";
  if (HISTORICOS.includes(e)) return "historico";
  if (fechaFin) return fechaFin >= TODAY ? "vigente" : "historico";
  return "otro";
}

async function socrataGet(params: URLSearchParams): Promise<any> {
  const headers: Record<string, string> = {};
  if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  const url = `${BASE}?${params.toString()}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res.json();
    if (attempt === 4) throw new Error(`Socrata ${res.status}: ${await res.text()}`);
    console.warn(`  socrata ${res.status}, reintento ${attempt}…`);
    await sleep(1000 * attempt * attempt);
  }
}

// ── Modos de inspección (no requieren Supabase) ─────────────────────
async function inspect() {
  const rows = await socrataGet(new URLSearchParams({ $limit: "1" }));
  if (!rows.length) return console.log("Dataset vacío (?)");
  console.log("Columnas reales del dataset:\n");
  console.log(Object.keys(rows[0]).sort().join("\n"));
  console.log("\nFila de muestra:\n", JSON.stringify(rows[0], null, 2));
}

async function topValues(col: string) {
  const p = new URLSearchParams();
  p.set("$select", `${col}, count(1) as n`);
  p.set("$group", col);
  p.set("$order", "n desc");
  p.set("$limit", "40");
  const rows = await socrataGet(p);
  console.log(`Top valores de "${col}":\n`);
  for (const r of rows) console.log(`${String(r.n).padStart(9)}  ${r[col] ?? "(null)"}`);
}

// ── Mapeo fila Socrata → fila contracts ─────────────────────────────
function mapRow(r: Record<string, unknown>) {
  const estado = (pick(r, ["estado_contrato", "estado_del_contrato"]) as string) ?? null;
  const fechaFin = toDate(pick(r, [COL.fin, "fecha_fin_del_contrato"]));
  const idContrato = pick(r, ["id_contrato", "id_del_contrato"]);
  if (!idContrato) return null;
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
    objeto: pick(r, ["objeto_del_contrato", "descripcion_del_proceso", "descripci_n_del_proceso"]) as string | null,
    estado_contrato: estado,
    vigencia: computeVigencia(estado, fechaFin),
    valor_contrato: toNum(pick(r, ["valor_del_contrato"])),
    valor_pagado: toNum(pick(r, ["valor_pagado"])),
    valor_facturado: toNum(pick(r, ["valor_facturado"])),
    valor_pendiente_ejecucion: toNum(pick(r, ["valor_pendiente_de_ejecucion", "valor_pendiente_de_ejecuci_n"])),
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
    representante_id: pick(r, ["identificaci_n_representante_legal", "identificacion_representante_legal"]) as string | null,
    url_proceso: toUrl(pick(r, ["urlproceso", "url_proceso"])),
    raw: r,
  };
}

// ── Ingesta principal ───────────────────────────────────────────────
async function ingest() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!args["dry-run"] && (!SUPABASE_URL || !SERVICE_KEY)) {
    console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }
  const supabase = args["dry-run"]
    ? null
    : createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  // WHERE
  const clauses: string[] = [];
  if (args.departamento?.length) clauses.push(`${COL.depto} in (${args.departamento.map(q).join(",")})`);
  if (args.ciudad?.length) clauses.push(`${COL.ciudad} in (${args.ciudad.map(q).join(",")})`);
  if (args.desde) clauses.push(`${COL.firma} >= '${args.desde}T00:00:00.000'`);
  if (args.hasta) clauses.push(`${COL.firma} <= '${args.hasta}T23:59:59.000'`);
  if (args.modo === "vigentes") clauses.push(`${COL.fin} >= '${TODAY}T00:00:00.000'`);
  if (args.modo === "historicos") clauses.push(`${COL.fin} < '${TODAY}T00:00:00.000'`);

  const runParams = { dataset: DATASET, ...args };
  console.log("Ingesta con filtros:", clauses.join(" AND ") || "(sin filtros)");

  let runId: string | null = null;
  if (supabase) {
    const { data } = await supabase
      .from("ingest_runs")
      .insert({ dataset: DATASET, params: runParams })
      .select("id")
      .single();
    runId = data?.id ?? null;
  }

  let offset = 0, fetched = 0, upserted = 0;
  try {
    while (fetched < MAX) {
      const p = new URLSearchParams();
      if (clauses.length) p.set("$where", clauses.join(" AND "));
      p.set("$order", ":id"); // paginación estable
      p.set("$limit", String(Math.min(PAGE, MAX - fetched)));
      p.set("$offset", String(offset));

      const rows: Record<string, unknown>[] = await socrataGet(p);
      if (!rows.length) break;
      fetched += rows.length;
      offset += rows.length;

      const mapped = rows.map(mapRow).filter(Boolean) as ReturnType<typeof mapRow>[];
      if (supabase && mapped.length) {
        for (let i = 0; i < mapped.length; i += 500) {
          const batch = mapped.slice(i, i + 500);
          const { error, count } = await supabase
            .from("contracts")
            .upsert(batch as any[], { onConflict: "id_contrato", count: "exact" });
          if (error) throw new Error(`Supabase upsert: ${error.message}`);
          upserted += count ?? batch.length;
        }
      }
      console.log(`  página ok — acumulado: ${fetched} leídas, ${upserted} upserted`);
      await sleep(250);
    }
    console.log(`\n✔ Listo: ${fetched} filas leídas, ${upserted} upserted en contracts.`);
    if (supabase && runId) {
      await supabase.from("ingest_runs").update({
        rows_fetched: fetched, rows_upserted: upserted, finished_at: new Date().toISOString(),
      }).eq("id", runId);
    }
  } catch (err: any) {
    console.error("✖ Error:", err.message);
    if (supabase && runId) {
      await supabase.from("ingest_runs").update({
        rows_fetched: fetched, rows_upserted: upserted,
        finished_at: new Date().toISOString(), error: String(err.message),
      }).eq("id", runId);
    }
    process.exit(1);
  }
}

// ── Main ────────────────────────────────────────────────────────────
(async () => {
  if (args.inspect) return inspect();
  if (args.values) return topValues(args.values);
  return ingest();
})();
