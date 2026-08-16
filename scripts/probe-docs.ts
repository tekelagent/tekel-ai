#!/usr/bin/env tsx
/**
 * B0 — prueba de humo del descubrimiento de documentos de SECOP II.
 *
 * Ruta 1: GET del HTML de `url_proceso` y búsqueda de enlaces
 *         `RetrieveFile/Index?DocumentId=`, que es como SECOP II sirve los
 *         adjuntos públicos.
 * Ruta 2: Croma /global/extract/json/v1 sobre la misma URL.
 *
 * No guarda nada. Solo reporta qué ruta funciona y qué devuelve.
 *
 * Uso:
 *   infisical run --env=dev -- pnpm probe-docs
 *   infisical run --env=dev -- pnpm probe-docs --contratos CO1.PCCNTR.8529299
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values: args } = parseArgs({
  options: {
    contratos: { type: "string", multiple: true },
    "solo-ruta": { type: "string" },
  },
});

const POR_DEFECTO = ["CO1.PCCNTR.8529299", "CO1.PCCNTR.9408571", "CO1.PCCNTR.9184965"];
const CONTRATOS = args.contratos?.length ? args.contratos : POR_DEFECTO;

const UA =
  "TekelAgent/0.1 (auditoria de contratacion publica; +https://github.com/tekelagent/tekel-ai)";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchTexto(url: string, timeoutMs = 45_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    const texto = await res.text();
    return { status: res.status, texto, tipo: res.headers.get("content-type") ?? "" };
  } catch (err) {
    return { status: 0, texto: String((err as Error).message), tipo: "" };
  } finally {
    clearTimeout(t);
  }
}

/** Ruta 1: enlaces de descarga incrustados en el HTML. */
function extraerEnlaces(html: string): Array<{ documentId: string; url: string }> {
  const vistos = new Map<string, string>();
  const patrones = [
    /RetrieveFile\/Index\?DocumentId=([A-Za-z0-9._-]+)/gi,
    /Archive\/RetrieveFile[^"'\s]*DocumentId=([A-Za-z0-9._-]+)/gi,
    /"DocumentId"\s*:\s*"([A-Za-z0-9._-]+)"/gi,
  ];
  for (const re of patrones) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const id = m[1];
      if (!vistos.has(id)) {
        vistos.set(
          id,
          `https://community.secop.gov.co/Public/Archive/RetrieveFile/Index?DocumentId=${id}`,
        );
      }
    }
  }
  return [...vistos.entries()].map(([documentId, url]) => ({ documentId, url }));
}

/** Ruta 2: extracción estructurada vía Croma. */
async function rutaCroma(url: string) {
  const key = process.env.CROMA_API_KEY;
  if (!key) return { ok: false, detalle: "sin CROMA_API_KEY", documentos: [] as unknown[] };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90_000);
  const t0 = Date.now();
  try {
    const res = await fetch("https://api.croma.run/global/extract/json/v1", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "User-Agent": UA,
      },
      body: JSON.stringify({
        url,
        // El parámetro se llama json_schema; la API lo dice en su error 400.
        json_schema: {
          type: "object",
          properties: {
            documentos: {
              type: "array",
              items: {
                type: "object",
                properties: { nombre: { type: "string" }, url: { type: "string" } },
                required: ["nombre", "url"],
              },
            },
          },
          required: ["documentos"],
        },
      }),
      signal: ctrl.signal,
    });
    const txt = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(txt);
    } catch {
      /* no era JSON */
    }
    const docs = json?.data?.documentos ?? json?.documentos ?? [];
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      ms: Date.now() - t0,
      rate: res.headers.get("x-ratelimit-remaining"),
      detalle: res.ok ? "" : txt.slice(0, 250),
      documentos: Array.isArray(docs) ? docs : [],
    };
  } catch (err) {
    return { ok: false, detalle: String((err as Error).message), documentos: [] as unknown[], ms: Date.now() - t0 };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.log(`B0 — descubrimiento de documentos SECOP II\n${"═".repeat(74)}`);

  const { data, error } = await supabase
    .from("contracts")
    .select("id_contrato,url_proceso,nombre_entidad,proveedor")
    .in("id_contrato", CONTRATOS);
  if (error) throw new Error(`Supabase: ${error.message}`);

  for (const c of (data ?? []) as Array<Record<string, string>>) {
    console.log(`\n${c.id_contrato} — ${c.nombre_entidad}`);
    if (!c.url_proceso) {
      console.log("  sin url_proceso");
      continue;
    }
    console.log(`  ${c.url_proceso.slice(0, 110)}…`);

    // ── Ruta 1 ────────────────────────────────────────────────────────
    if (args["solo-ruta"] !== "2") {
      const r1 = await fetchTexto(c.url_proceso);
      const enlaces = r1.status === 200 ? extraerEnlaces(r1.texto) : [];
      console.log(`  RUTA 1  HTTP ${r1.status} · ${r1.texto.length} bytes · ${r1.tipo.split(";")[0]}`);
      if (enlaces.length) {
        console.log(`          ${enlaces.length} documentos encontrados:`);
        for (const e of enlaces.slice(0, 12)) console.log(`            ${e.documentId}`);
      } else if (r1.status === 200) {
        // SECOP II es una SPA: si el HTML no trae los enlaces, están detrás de JS.
        const pistas = [
          /angular/i.test(r1.texto) ? "angular" : null,
          /__RequestVerificationToken/i.test(r1.texto) ? "form-token" : null,
          r1.texto.length < 5000 ? "html-minimo" : null,
        ].filter(Boolean);
        console.log(`          sin enlaces en el HTML (${pistas.join(", ") || "sin pistas"})`);
      } else {
        console.log(`          ${r1.texto.slice(0, 160)}`);
      }
      await sleep(1000); // cortesía hacia SECOP: 1 req/seg
    }

    // ── Ruta 2 ────────────────────────────────────────────────────────
    if (args["solo-ruta"] !== "1") {
      const r2 = await rutaCroma(c.url_proceso);
      console.log(
        `  RUTA 2  ${r2.ok ? "OK" : "FALLA"} ${("status" in r2 && r2.status) || ""} · ${r2.ms} ms` +
          (("rate" in r2 && r2.rate) ? ` · rate restante ${r2.rate}` : ""),
      );
      if (r2.documentos.length) {
        console.log(`          ${r2.documentos.length} documentos:`);
        for (const d of r2.documentos.slice(0, 12) as Array<Record<string, string>>) {
          console.log(`            ${(d.nombre ?? "?").slice(0, 70)}`);
          console.log(`              ${(d.url ?? "?").slice(0, 100)}`);
        }
      } else if (r2.detalle) {
        console.log(`          ${String(r2.detalle).slice(0, 220)}`);
      } else {
        console.log(`          sin documentos`);
      }
    }
  }

  console.log(`\n${"═".repeat(74)}\nSondeo terminado. No se guardó nada.`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
