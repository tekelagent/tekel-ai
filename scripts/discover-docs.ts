#!/usr/bin/env tsx
/**
 * Descubrimiento automático de documentos de SECOP II — sin navegador.
 *
 * El spike S2 demostró que la ficha del proceso está detrás de reCAPTCHA y que
 * ninguna configuración de navegador sigiloso la esquiva (ver S2/S3). La salida
 * no fue vencer el muro: fue rodearlo. Colombia Compra Eficiente publica el
 * índice de adjuntos como dato abierto en datos.gov.co, con el DocumentId y la
 * URL de descarga ya resueltos:
 *
 *   dmgg-8hin  Archivos Descarga desde 2025
 *   nbae-kzan  histórico 2024
 *   3skv-9na7  histórico 2023
 *   kgcd-kt7i  histórico 2022
 *   f8va-cf4m  histórico hasta 2021
 *
 * La llave de cruce es `n_mero_de_contrato`, que es exactamente nuestro
 * `id_contrato` (CO1.PCCNTR.*). Ojo: `proceso` es CO1.BDOS.*, NO el
 * CO1.NTC.* del `url_proceso`, así que cruzar por noticeUID no encuentra nada.
 *
 * La descarga usa la misma URL pública que ve el ciudadano
 * (Archive/RetrieveFile), que no está protegida. Todo el flujo es API abierta
 * más GET: cero captchas, cero automatización de navegador.
 *
 * Uso:
 *   infisical run --env=dev -- pnpm discover-docs
 *   infisical run --env=dev -- pnpm discover-docs --prioridad P1 --descargar
 *   infisical run --env=dev -- pnpm discover-docs --id-contrato CO1.PCCNTR.6374444 --descargar
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { seleccionar, clasificar, type TipoDocumento } from "../lib/documents/filter";

const { values: args } = parseArgs({
  options: {
    /** Prioridades objetivo. Por defecto los contratos con hallazgos accionables. */
    prioridad: { type: "string", default: "P1,P2" },
    "id-contrato": { type: "string", multiple: true },
    limit: { type: "string" },
    /** Sin esto solo se cataloga la metadata; los PDF se dejan en SECOP. */
    descargar: { type: "boolean", default: false },
    /** Cuántos documentos relevantes bajar por contrato. */
    "max-docs": { type: "string", default: "6" },
    "dir-descargas": { type: "string", default: "data/documentos" },
    /** No escribe en Supabase: sirve para ver qué se descubriría. */
    seco: { type: "boolean", default: false },
  },
});

const DATASETS = [
  { id: "dmgg-8hin", desde: 2025 },
  { id: "nbae-kzan", desde: 2024 },
  { id: "3skv-9na7", desde: 2023 },
  { id: "kgcd-kt7i", desde: 2022 },
  { id: "f8va-cf4m", desde: 0 },
];

const UA =
  "TekelAgent/0.1 (auditoria de contratacion publica; +https://github.com/tekelagent/tekel-ai)";
const MAX_DOCS = Number(args["max-docs"]) || 6;
/** Contratos por consulta: mantiene la URL corta y la respuesta manejable. */
const LOTE = 40;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type FilaArchivo = {
  n_mero_de_contrato?: string;
  id_documento?: string;
  proceso?: string;
  nombre_archivo?: string;
  tamanno_archivo?: string;
  extensi_n?: string;
  descripci_n?: string;
  url_descarga_documento?: { url?: string } | string;
};

/** Consulta un dataset de Socrata con reintento: la API abierta a veces da 5xx. */
async function socrata(dataset: string, qs: string, intento = 1): Promise<FilaArchivo[]> {
  const url = `https://www.datos.gov.co/resource/${dataset}.json?${qs}`;
  const headers: Record<string, string> = { "User-Agent": UA };
  // El token no es secreto ni obligatorio, pero sube el límite de peticiones.
  if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as FilaArchivo[];
  } catch (err) {
    if (intento >= 3) {
      console.log(`\n  ${dataset}: ${(err as Error).message} (se omite tras 3 intentos)`);
      return [];
    }
    await sleep(800 * intento);
    return socrata(dataset, qs, intento + 1);
  }
}

function urlDescarga(f: FilaArchivo): string | null {
  const u = typeof f.url_descarga_documento === "string"
    ? f.url_descarga_documento
    : f.url_descarga_documento?.url;
  if (u) return u;
  // Si el dataset no trae la URL armada, se reconstruye: el patrón es estable.
  return f.id_documento
    ? `https://community.secop.gov.co/Public/Archive/RetrieveFile/Index?DocumentId=${f.id_documento}`
    : null;
}

/** Nombre de archivo seguro en disco, conservando algo legible del original. */
function nombreSeguro(nombre: string): string {
  return nombre.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 90);
}

async function main() {
  const prioridades = args.prioridad.split(",").map((s) => s.trim());
  console.log(`Descubrimiento de documentos — datos abiertos\n${"═".repeat(74)}`);

  // ── 1. Objetivos ────────────────────────────────────────────────────────
  // `proceso_de_compra` sale de la fila original de Socrata: es el CO1.BDOS.*
  // autoritativo. Se proyecta desde raw para no traerse el JSON entero.
  let q = sb
    .from("contracts")
    .select(
      "id,id_contrato,nombre_entidad,prioridad,plata_en_riesgo,proceso_de_compra:raw->>proceso_de_compra",
    );
  if (args["id-contrato"]?.length) q = q.in("id_contrato", args["id-contrato"]);
  else q = q.in("prioridad", prioridades);
  q = q.order("plata_en_riesgo", { ascending: false, nullsFirst: false });
  if (args.limit) q = q.limit(Number(args.limit));

  const { data: contratos, error } = await q;
  if (error) throw new Error(`Supabase: ${error.message}`);
  if (!contratos?.length) throw new Error("Sin contratos objetivo.");

  const porId = new Map(contratos.map((c) => [String(c.id_contrato), c]));
  console.log(`${contratos.length} contratos objetivo (${args["id-contrato"]?.length ? "explícitos" : prioridades.join("+")})\n`);

  // ── 2. Descubrimiento ───────────────────────────────────────────────────
  const ids = [...porId.keys()];
  const hallados = new Map<string, FilaArchivo[]>();
  let consultas = 0;

  // Los datasets se solapan entre sí y repiten filas, así que el id_documento
  // manda: sin deduplicar, un mismo pliego se descarga y se analiza tres veces.
  const vistos = new Set<string>();
  function agregar(idContrato: string, f: FilaArchivo) {
    const doc = String(f.id_documento ?? "");
    const clave = `${idContrato}|${doc}`;
    if (!doc || vistos.has(clave)) return;
    vistos.add(clave);
    const arr = hallados.get(idContrato) ?? [];
    arr.push(f);
    hallados.set(idContrato, arr);
  }

  // ── 2a. Documentos de la etapa CONTRATO (llave n_mero_de_contrato) ──────
  // Aquí viven la minuta, los otrosíes y los informes de ejecución.
  const procesoDeContrato = new Map<string, Set<string>>();

  // El puente al proceso se siembra desde `proceso_de_compra`, no se deduce de
  // las filas de documentos. La diferencia importa: un contrato que solo tenga
  // adjuntos de la etapa precontractual no produce ninguna fila de la que
  // deducirlo, y quedaría sin pliego justamente por no tener minuta.
  for (const c of contratos) {
    const bdos = (c as { proceso_de_compra?: string | null }).proceso_de_compra;
    if (!bdos || !/^CO1\./.test(bdos)) continue;
    const s = procesoDeContrato.get(bdos) ?? new Set<string>();
    s.add(String(c.id_contrato));
    procesoDeContrato.set(bdos, s);
  }
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE);
    const inList = lote.map((v) => `'${v.replace(/'/g, "''")}'`).join(",");
    // Se consultan los cinco datasets: el año de firma no siempre coincide con
    // el año en que la entidad subió el documento.
    for (const ds of DATASETS) {
      const filas = await socrata(ds.id, `$where=n_mero_de_contrato in(${inList})&$limit=5000`);
      consultas++;
      for (const f of filas) {
        const k = String(f.n_mero_de_contrato ?? "");
        if (!porId.has(k)) continue;
        agregar(k, f);
        // El CO1.BDOS.* es el puente hacia la etapa precontractual. No se puede
        // deducir del CO1.NTC.* del url_proceso: hay que leerlo de estas filas.
        if (f.proceso) {
          const s = procesoDeContrato.get(String(f.proceso)) ?? new Set<string>();
          s.add(k);
          procesoDeContrato.set(String(f.proceso), s);
        }
      }
      await sleep(200); // cortesía con datos.gov.co
    }
    process.stdout.write(
      `\r  etapa contrato · lote ${Math.floor(i / LOTE) + 1}/${Math.ceil(ids.length / LOTE)} · ${hallados.size} contratos · ${consultas} consultas`,
    );
  }
  console.log();

  // ── 2b. Documentos de la etapa PROCESO (llave proceso, CO1.BDOS.*) ──────
  // Estas filas NO traen n_mero_de_contrato, así que el paso anterior las deja
  // fuera. Y son justamente las que importan para la auditoría: el pliego
  // definitivo, las adendas, los estudios previos y el análisis del sector.
  const procesos = [...procesoDeContrato.keys()];
  console.log(`  ${procesos.length} procesos (CO1.BDOS.*) para la etapa precontractual`);

  for (let i = 0; i < procesos.length; i += LOTE) {
    const lote = procesos.slice(i, i + LOTE);
    const inList = lote.map((v) => `'${v.replace(/'/g, "''")}'`).join(",");
    for (const ds of DATASETS) {
      const filas = await socrata(
        ds.id,
        `$where=proceso in(${inList}) AND n_mero_de_contrato IS NULL&$limit=5000`,
      );
      consultas++;
      for (const f of filas) {
        // Un proceso puede haber derivado en varios contratos nuestros: el
        // pliego es evidencia para todos ellos.
        for (const idContrato of procesoDeContrato.get(String(f.proceso)) ?? []) {
          agregar(idContrato, f);
        }
      }
      await sleep(200);
    }
    process.stdout.write(
      `\r  etapa proceso · lote ${Math.floor(i / LOTE) + 1}/${Math.ceil(procesos.length / LOTE)} · ${consultas} consultas   `,
    );
  }
  console.log();

  const totalCrudos = [...hallados.values()].reduce((a, b) => a + b.length, 0);
  console.log(`\n${totalCrudos} documentos únicos en ${hallados.size} de ${ids.length} contratos`);
  console.log(`Cobertura: ${((hallados.size / ids.length) * 100).toFixed(1)}%\n`);

  // ── 3. Clasificación y persistencia ─────────────────────────────────────
  const filasDocs: Array<Record<string, unknown>> = [];
  const porTipo = new Map<TipoDocumento, number>();
  let descartados = 0;
  const paraDescargar: Array<{ idContrato: string; documentId: string; nombre: string; url: string }> = [];

  for (const [idContrato, filas] of hallados) {
    const c = porId.get(idContrato)!;
    const crudos = filas.map((f) => ({
      nombre: String(f.nombre_archivo ?? ""),
      descripcion: f.descripci_n ?? null,
      extension: f.extensi_n ?? null,
      tamano: f.tamanno_archivo != null ? Number(f.tamanno_archivo) : null,
      fila: f,
    }));

    // Todo se cataloga —el índice completo es en sí mismo evidencia de qué
    // publicó la entidad— pero solo lo relevante se marca para descarga.
    for (const d of crudos) {
      const cl = clasificar(d);
      if (!cl.relevante) descartados++;
      porTipo.set(cl.tipo, (porTipo.get(cl.tipo) ?? 0) + 1);
      const url = urlDescarga(d.fila);
      const documentId = String(d.fila.id_documento ?? "");
      if (!documentId || !url) continue;
      filasDocs.push({
        contract_id: c.id,
        id_contrato: idContrato,
        notice_uid: d.fila.proceso ?? null,
        document_id: documentId,
        nombre: d.nombre.slice(0, 300),
        tipo: cl.tipo,
        status: "pending",
        url_oficial: url,
      });
    }

    for (const d of seleccionar(crudos, MAX_DOCS)) {
      const url = urlDescarga(d.fila);
      if (url && d.fila.id_documento) {
        paraDescargar.push({
          idContrato,
          documentId: String(d.fila.id_documento),
          nombre: d.nombre,
          url,
        });
      }
    }
  }

  console.log("Clasificación:");
  for (const [t, n] of [...porTipo.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(10)} ${n}`);
  }
  console.log(`  ${"descartados".padEnd(10)} ${descartados} (trámite, formato o tamaño)`);
  console.log(`\n${paraDescargar.length} documentos seleccionados para análisis (máx ${MAX_DOCS}/contrato)`);

  if (args.seco) {
    console.log("\n--seco: no se escribió nada en Supabase.");
  } else {
    let escritos = 0;
    for (let i = 0; i < filasDocs.length; i += 500) {
      const trozo = filasDocs.slice(i, i + 500);
      const { error: e } = await sb
        .from("documents")
        .upsert(trozo, { onConflict: "contract_id,document_id" });
      if (e) console.log(`  upsert: ${e.message}`);
      else escritos += trozo.length;
    }
    console.log(`\n${escritos} filas en documents.`);
  }

  // ── 4. Descarga ─────────────────────────────────────────────────────────
  if (!args.descargar) {
    console.log(`\nSin --descargar: solo se catalogó. Los PDF siguen en SECOP (verificables en la fuente).`);
  } else {
    console.log(`\nDescargando ${paraDescargar.length} documentos…`);
    mkdirSync(args["dir-descargas"], { recursive: true });
    let ok = 0;
    let fallos = 0;

    for (const [i, d] of paraDescargar.entries()) {
      const dir = join(args["dir-descargas"], d.idContrato);
      mkdirSync(dir, { recursive: true });
      const destino = join(dir, `${d.documentId}-${nombreSeguro(d.nombre)}`);
      try {
        const res = await fetch(d.url, { headers: { "User-Agent": UA } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        writeFileSync(destino, buf);
        ok++;
        if (!args.seco) {
          await sb
            .from("documents")
            .update({ status: "downloaded", storage_path: destino, updated_at: new Date().toISOString() })
            .eq("id_contrato", d.idContrato)
            .eq("document_id", d.documentId);
        }
      } catch (err) {
        fallos++;
        if (!args.seco) {
          await sb
            .from("documents")
            .update({ status: "error", error: (err as Error).message.slice(0, 200) })
            .eq("id_contrato", d.idContrato)
            .eq("document_id", d.documentId);
        }
      }
      process.stdout.write(`\r  ${i + 1}/${paraDescargar.length} · ${ok} ok · ${fallos} fallos   `);
      // SECOP sirve archivos pesados: una descarga cada 700 ms es suficiente
      // para no degradar el servicio de nadie más.
      await sleep(700);
    }
    console.log(`\n\n${ok} descargados en ${args["dir-descargas"]}/ · ${fallos} fallidos`);
  }

  console.log(`\n${"═".repeat(74)}\nListo.`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
