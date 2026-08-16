#!/usr/bin/env tsx
/**
 * Ingesta de SECOP II — Procesos de Contratación (p6dx-8zbt) → tabla processes.
 *
 * Solo trae los procesos que corresponden a contratos ya ingestados, por lotes
 * de `id_del_portafolio`. Traer el dataset entero serían millones de filas para
 * usar unas miles.
 *
 * Uso:
 *   infisical run --env=dev -- pnpm ingest-processes                 (P1/P2/P3)
 *   infisical run --env=dev -- pnpm ingest-processes --todos         (corpus completo)
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values: args } = parseArgs({
  options: {
    todos: { type: "boolean", default: false },
    "batch-size": { type: "string", default: "40" },
  },
});

const DATASET = "p6dx-8zbt";
const BASE = `https://www.datos.gov.co/resource/${DATASET}.json`;
const LOTE = Math.max(1, Number(args["batch-size"]) || 40);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const toInt = (v: unknown): number | null => {
  const n = toNum(v);
  return n === null ? null : Math.round(n);
};
const toDate = (v: unknown): string | null => {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const limpiar = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  if (!s || /^no (definido|adjudicado|aplica)$/i.test(s)) return null;
  return s;
};

async function socrata(params: URLSearchParams): Promise<Record<string, unknown>[]> {
  const headers: Record<string, string> = {
    "User-Agent": "TekelAgent/0.1 (auditoria de contratacion publica)",
  };
  if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  for (let intento = 1; intento <= 4; intento++) {
    const res = await fetch(`${BASE}?${params.toString()}`, { headers });
    if (res.ok) return res.json();
    if (intento === 4) throw new Error(`Socrata ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await sleep(1000 * intento * intento);
  }
  return [];
}

/** Los `proceso_de_compra` de los contratos que nos interesan. */
async function portafoliosObjetivo(): Promise<string[]> {
  const claves = new Set<string>();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    // Sin reasignar el builder: reasignarlo hace que TypeScript anide el tipo
    // de PostgrestFilterBuilder hasta reventar (TS2589).
    const base = supabase
      .from("contracts")
      .select("proceso_de_compra")
      .not("proceso_de_compra", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    const { data, error } = args.todos
      ? await base
      : await base.not("prioridad", "is", null);
    if (error) throw new Error(`Supabase select: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as Array<{ proceso_de_compra: string | null }>) {
      if (r.proceso_de_compra) claves.add(r.proceso_de_compra);
    }
    if (data.length < PAGE) break;
  }
  return [...claves];
}

/** Fila de `processes` tal como se escribe. Anotado para no dejar que TS
 *  infiera un tipo tan profundo que se atragante en el deduplicado. */
type ProcesoRow = {
  portafolio_id: string;
  proceso_id: string | null;
  referencia: string | null;
  nombre: string | null;
  entidad: string | null;
  nit_entidad: string | null;
  departamento_entidad: string | null;
  modalidad: string | null;
  tipo_de_contrato: string | null;
  fase: string | null;
  estado_procedimiento: string | null;
  precio_base: number | null;
  valor_adjudicacion: number | null;
  adjudicado: boolean;
  nit_adjudicado: string | null;
  respuestas: number | null;
  respuestas_externas: number | null;
  proveedores_invitados: number | null;
  proveedores_unicos: number | null;
  proveedores_manifestaron: number | null;
  fecha_publicacion: string | null;
  fecha_publicacion_fase3: string | null;
  fecha_ultima_publicacion: string | null;
  url_proceso: string | null;
  raw: Record<string, unknown>;
};

function mapear(r: Record<string, unknown>): ProcesoRow | null {
  const portafolio = limpiar(r.id_del_portafolio);
  if (!portafolio) return null;
  return {
    portafolio_id: portafolio,
    proceso_id: limpiar(r.id_del_proceso),
    referencia: limpiar(r.referencia_del_proceso),
    nombre: limpiar(r.nombre_del_procedimiento),
    entidad: limpiar(r.entidad),
    nit_entidad: limpiar(r.nit_entidad),
    departamento_entidad: limpiar(r.departamento_entidad),
    modalidad: limpiar(r.modalidad_de_contratacion),
    tipo_de_contrato: limpiar(r.tipo_de_contrato),
    fase: limpiar(r.fase),
    estado_procedimiento: limpiar(r.estado_del_procedimiento),
    precio_base: toNum(r.precio_base),
    valor_adjudicacion: toNum(r.valor_total_adjudicacion),
    adjudicado: String(r.adjudicado ?? "").trim().toLowerCase() === "si",
    nit_adjudicado: limpiar(r.nit_del_proveedor_adjudicado),
    respuestas: toInt(r.respuestas_al_procedimiento),
    respuestas_externas: toInt(r.respuestas_externas),
    proveedores_invitados: toInt(r.proveedores_invitados),
    proveedores_unicos: toInt(r.proveedores_unicos_con),
    proveedores_manifestaron: toInt(r.proveedores_que_manifestaron),
    fecha_publicacion: toDate(r.fecha_de_publicacion_del),
    fecha_publicacion_fase3: toDate(r.fecha_de_publicacion_fase_3),
    fecha_ultima_publicacion: toDate(r.fecha_de_ultima_publicaci),
    url_proceso: limpiar(r.urlproceso),
    raw: r,
  };
}

async function main() {
  console.log(`Ingesta de procesos (${DATASET}) — ${args.todos ? "corpus completo" : "solo contratos con prioridad"}\n`);

  const objetivo = await portafoliosObjetivo();
  console.log(`  ${objetivo.length} procesos de compra a buscar\n`);
  if (!objetivo.length) return;

  let encontrados = 0;
  let escritos = 0;

  for (let i = 0; i < objetivo.length; i += LOTE) {
    const trozo = objetivo.slice(i, i + LOTE);
    const p = new URLSearchParams();
    p.set("$where", `id_del_portafolio in (${trozo.map(q).join(",")})`);
    p.set("$limit", "2000");

    let filas: Record<string, unknown>[];
    try {
      filas = await socrata(p);
    } catch (err) {
      console.log(`\n  lote ${i}: ${(err as Error).message}`);
      continue;
    }
    encontrados += filas.length;

    // Un portafolio agrupa varios procedimientos, así que el lote trae
    // portafolio_id repetidos. Postgres rechaza el batch entero cuando un
    // ON CONFLICT tocaría la misma fila dos veces, así que se deduplica antes:
    // gana el procedimiento adjudicado y, entre esos, el de mayor valor.
    const porPortafolio = new Map<string, ProcesoRow>();
    for (const m of filas.map(mapear)) {
      if (!m) continue;
      const previo = porPortafolio.get(m.portafolio_id);
      if (!previo) {
        porPortafolio.set(m.portafolio_id, m);
        continue;
      }
      const mejor =
        (m.adjudicado ? 1 : 0) - (previo.adjudicado ? 1 : 0) ||
        (m.valor_adjudicacion ?? 0) - (previo.valor_adjudicacion ?? 0) ||
        (m.precio_base ?? 0) - (previo.precio_base ?? 0);
      if (mejor > 0) porPortafolio.set(m.portafolio_id, m);
    }
    const mapeadas = [...porPortafolio.values()];
    if (mapeadas.length) {
      const { error } = await supabase
        .from("processes")
        .upsert(mapeadas, { onConflict: "portafolio_id" });
      if (error) console.log(`\n  upsert: ${error.message}`);
      else escritos += mapeadas.length;
    }

    process.stdout.write(`\r  ${Math.min(i + LOTE, objetivo.length)}/${objetivo.length} buscados, ${escritos} escritos…`);
    await sleep(250);
  }
  process.stdout.write("\n\n");

  const cobertura = ((encontrados / objetivo.length) * 100).toFixed(1);
  console.log(`Procesos encontrados: ${encontrados} de ${objetivo.length} buscados (${cobertura}%)`);
  console.log(`Escritos en processes: ${escritos}`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
