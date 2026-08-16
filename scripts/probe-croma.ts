#!/usr/bin/env tsx
/**
 * Sondeo de la API de Croma — planeación de la Capa C.
 *
 * NO guarda nada en base de datos. Solo determina, por endpoint: si responde,
 * la forma de la respuesta, y las cabeceras de rate limit / costo.
 *
 * Contrato de la API (confirmado): base https://api.croma.run, autenticación
 * `Authorization: Bearer <key>`, todos los endpoints POST con cuerpo JSON, y
 * respuesta envuelta en `{ data }`.
 *
 * Uso:
 *   infisical run --env=dev -- pnpm probe-croma
 *   infisical run --env=dev -- pnpm probe-croma --base https://api.croma.run
 *
 * La llave nunca se imprime, ni entera ni parcial.
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values: args } = parseArgs({
  options: {
    base: { type: "string", default: "https://api.croma.run" },
    nit: { type: "string" },
    contrato: { type: "string" },
    detail: { type: "boolean", default: false },
    timeout: { type: "string", default: "45000" },
  },
});

const API_KEY = process.env.CROMA_API_KEY;
if (!API_KEY) {
  console.error("Falta CROMA_API_KEY. Lanza con: infisical run --env=dev -- pnpm probe-croma");
  process.exit(1);
}

const BASE = args.base.replace(/\/$/, "");
const UA = "TekelAgent/0.1 (auditoria de contratacion publica; +https://github.com/tekelagent/tekel-ai)";

const CABECERAS_INTERES = [
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "ratelimit-limit",
  "ratelimit-remaining",
  "ratelimit-reset",
  "x-credits-remaining",
  "x-credits-used",
  "x-request-cost",
  "retry-after",
];

type Sonda = { status: number; json: unknown; texto: string; headers: Record<string, string>; ms: number };

const TIMEOUT_MS = Number(args.timeout) || 45_000;

async function post(path: string, body: unknown): Promise<Sonda> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": UA,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const texto = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(texto);
    } catch {
      /* no era JSON */
    }
    const headers: Record<string, string> = {};
    for (const h of CABECERAS_INTERES) {
      const v = res.headers.get(h);
      if (v) headers[h] = v;
    }
    return { status: res.status, json, texto, headers, ms: Date.now() - t0 };
  } catch (err) {
    return { status: 0, json: null, texto: String((err as Error).message), headers: {}, ms: Date.now() - t0 };
  } finally {
    clearTimeout(t);
  }
}

function forma(v: unknown, prof = 0): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) {
    return prof >= 2
      ? `array[${v.length}]`
      : `array[${v.length}]${v.length ? ` de ${forma(v[0], prof + 1)}` : ""}`;
  }
  if (typeof v === "object") {
    const k = Object.keys(v as object);
    if (prof >= 3) return `{${k.length} claves}`;
    return `{ ${k.slice(0, 14).join(", ")}${k.length > 14 ? `, …+${k.length - 14}` : ""} }`;
  }
  return typeof v;
}

/** Desenvuelve `{ data }` si viene así. */
function desenvolver(json: unknown): unknown {
  if (json && typeof json === "object" && "data" in (json as Record<string, unknown>)) {
    return (json as Record<string, unknown>).data;
  }
  return json;
}

/** Busca recursivamente claves cuyo nombre encaje, para reportar qué trae la respuesta. */
function buscarClaves(v: unknown, patron: RegExp, prof = 0, out: string[] = []): string[] {
  if (prof > 4 || out.length > 12 || !v || typeof v !== "object") return out;
  if (Array.isArray(v)) {
    if (v.length) buscarClaves(v[0], patron, prof + 1, out);
    return out;
  }
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (patron.test(k)) out.push(k);
    buscarClaves(val, patron, prof + 1, out);
  }
  return out;
}

async function cargarMuestraReal(): Promise<{ nit: string; idContrato: string; noticeUID: string | null }> {
  if (args.nit && args.contrato) {
    return { nit: args.nit, idContrato: args.contrato, noticeUID: null };
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { nit: args.nit ?? "901100455", idContrato: args.contrato ?? "CO1.PCCNTR.8529299", noticeUID: null };
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await supabase
    .from("contracts")
    .select("id_contrato,documento_proveedor,url_proceso,nombre_entidad,proveedor,plata_en_riesgo")
    .eq("prioridad", "P1")
    .order("plata_en_riesgo", { ascending: false, nullsFirst: false })
    .limit(1);
  const c = data?.[0];
  if (!c) return { nit: "901100455", idContrato: "CO1.PCCNTR.8529299", noticeUID: null };
  const m = /noticeUID=([^&]+)/i.exec(c.url_proceso ?? "");
  console.log(`Muestra real del corpus (P1 de mayor plata en riesgo):`);
  console.log(`  entidad:     ${c.nombre_entidad}`);
  console.log(`  contratista: ${c.proveedor}`);
  console.log(`  id_contrato: ${c.id_contrato}`);
  console.log(`  documento:   ${c.documento_proveedor}`);
  console.log(`  noticeUID:   ${m?.[1] ?? "(no encontrado en url_proceso)"}\n`);
  return {
    nit: c.documento_proveedor ?? "901100455",
    idContrato: c.id_contrato,
    noticeUID: m?.[1] ?? null,
  };
}

async function main() {
  console.log(`Sondeo Croma — base ${BASE}`);
  // Se reporta solo el prefijo del tipo de llave, nunca la llave.
  console.log(`Llave: ${API_KEY!.startsWith("croma_live_") ? "de organización (croma_live_)" : "NO empieza por croma_live_ — puede ser personal y fallar"}\n`);

  const muestra = await cargarMuestraReal();

  // Modo detalle: inspecciona a fondo los endpoints que más deciden el diseño
  // de la Capa C, en vez de recorrer los diez por encima.
  if (args.detail) {
    console.log("═".repeat(78));
    console.log("DETALLE — secop/contract\n");
    const r = await post("/co/secop/contract/v1", { contract_id: muestra.idContrato });
    const d = desenvolver(r.json) as Record<string, unknown> | null;
    if (!d) {
      console.log(`  ${r.status}: ${r.texto.slice(0, 300)}`);
    } else {
      for (const clave of ["additions", "guarantees", "execution_items"]) {
        const v = d[clave];
        console.log(`  ${clave}: ${forma(v)}`);
        if (Array.isArray(v) && v.length) {
          console.log(`    ejemplo: ${JSON.stringify(v[0], null, 2).split("\n").join("\n    ")}`);
        }
        console.log("");
      }
      const contrato = d.contract as Record<string, unknown> | undefined;
      if (contrato) {
        const claves = Object.keys(contrato);
        console.log(`  contract: ${claves.length} claves`);
        const valores = claves.filter((k) => /valor|value|amount|precio/i.test(k));
        console.log(`  claves de valor: ${valores.join(", ") || "(ninguna)"}`);
      }
    }

    console.log(`\n${"═".repeat(78)}`);
    console.log("REINTENTO — contaduria/state-delinquent-debtors (timeout ampliado)\n");
    const c = await post("/co/contaduria/state-delinquent-debtors/v1", {
      document_number: muestra.nit,
    });
    console.log(`  → ${c.status || "sin respuesta"} (${c.ms} ms)`);
    console.log(`  ${c.status === 200 ? forma(desenvolver(c.json)) : c.texto.slice(0, 300)}`);

    console.log(`\n${"═".repeat(78)}`);
    console.log("REINTENTO — secop/process\n");
    if (muestra.noticeUID) {
      const p = await post("/co/secop/process/v1", { notice_uid: muestra.noticeUID });
      console.log(`  → ${p.status || "sin respuesta"} (${p.ms} ms)`);
      if (p.status === 200) {
        const pd = desenvolver(p.json);
        console.log(`  forma: ${forma(pd)}`);
        console.log(`  ${JSON.stringify(pd, null, 2).slice(0, 2500)}`);
      } else {
        console.log(`  ${p.texto.slice(0, 300)}`);
      }
    }
    return;
  }

  const endpoints: Array<{ clave: string; path: string; body: unknown }> = [
    // Los nombres de parámetro salen de los errores de validación de la propia
    // API: document_number, contract_id y notice_uid.
    { clave: "rues/entity-by-nit", path: "/co/rues/entity-by-nit/v1", body: { document_number: muestra.nit } },
    { clave: "contraloria/fiscal-records", path: "/co/contraloria/fiscal-records/v1", body: { document_number: muestra.nit } },
    { clave: "procuraduria/disciplinary-records", path: "/co/procuraduria/disciplinary-records/v1", body: { document_number: muestra.nit } },
    { clave: "contaduria/state-delinquent-debtors", path: "/co/contaduria/state-delinquent-debtors/v1", body: { document_number: muestra.nit } },
    { clave: "secop/contracts-by-provider", path: "/co/secop/contracts-by-provider/v1", body: { document_number: muestra.nit } },
    { clave: "secop/sanctions-by-provider", path: "/co/secop/sanctions-by-provider/v1", body: { document_number: muestra.nit } },
    { clave: "legalize/laws", path: "/co/legalize/laws/v1", body: { query: "ley 80 de 1993" } },
    { clave: "ancp-cce/conceptos-search", path: "/co/ancp-cce/conceptos-search/v1", body: { query: "adición 50%" } },
    { clave: "secop/contract", path: "/co/secop/contract/v1", body: { contract_id: muestra.idContrato } },
    ...(muestra.noticeUID
      ? [{ clave: "secop/process", path: "/co/secop/process/v1", body: { notice_uid: muestra.noticeUID } }]
      : []),
  ];

  console.log("═".repeat(78));
  const resultados: Array<{ clave: string; ok: boolean; status: number }> = [];

  for (const ep of endpoints) {
    console.log(`\n${ep.clave}`);
    console.log(`  POST ${ep.path}`);
    console.log(`  body ${JSON.stringify(ep.body)}`);
    const r = await post(ep.path, ep.body);
    const ok = r.status >= 200 && r.status < 300;
    resultados.push({ clave: ep.clave, ok, status: r.status });

    console.log(`  → ${r.status || "sin respuesta"}  (${r.ms} ms)`);
    if (ok) {
      const d = desenvolver(r.json);
      console.log(`  forma: ${forma(d)}`);
      if (Array.isArray(d) && d.length) console.log(`  item:  ${forma(d[0], 1)}`);
    } else {
      console.log(`  error: ${r.texto.slice(0, 300)}`);
    }
    console.log(
      `  rate:  ${Object.keys(r.headers).length ? JSON.stringify(r.headers) : "sin cabeceras de rate limit"}`,
    );

    // Reportes específicos que pidió el Paso 2.5.
    if (ok && ep.clave === "secop/contract") {
      const d = desenvolver(r.json);
      const garantias = buscarClaves(d, /garant|asegurador|poliza|póliza|amparo/i);
      const entregas = buscarClaves(d, /entrega|plan|cronograma|hito/i);
      console.log(`  garantías/aseguradora: ${garantias.length ? garantias.join(", ") : "no aparecen"}`);
      console.log(`  plan de entregas:      ${entregas.length ? entregas.join(", ") : "no aparece"}`);
    }
    if (ok && ep.clave === "secop/process") {
      const d = desenvolver(r.json);
      const docs = buscarClaves(d, /document|archivo|adjunto|attachment|file|url/i);
      console.log(`  documentos/URLs:       ${docs.length ? docs.join(", ") : "no aparecen"}`);
    }

    await new Promise((r) => setTimeout(r, 700));
  }

  console.log(`\n${"═".repeat(78)}`);
  console.log("RESUMEN");
  for (const r of resultados) {
    console.log(`  ${r.ok ? "OK  " : "FALL"}  ${String(r.status).padStart(3)}  ${r.clave}`);
  }
  console.log(`\n  ${resultados.filter((r) => r.ok).length}/${resultados.length} endpoints accesibles.`);
  console.log("  No se guardó nada en base de datos.");
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
