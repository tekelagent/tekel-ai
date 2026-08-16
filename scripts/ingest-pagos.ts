#!/usr/bin/env tsx
/**
 * Ingesta del plan de pagos de SECOP II (datos.gov.co uymx-8p3j) para los
 * contratos que ya tenemos, y materialización de los agregados en `contracts`.
 *
 * No se descarga el dataset entero: son 20,8 millones de filas y solo nos
 * importan las de nuestro corpus. Se consulta por lotes de IDs.
 *
 * Qué resuelve: `contracts.valor_pagado = 0` es ambiguo — puede significar
 * "no se ha pagado" o "la entidad no reportó". Con el plan de pagos se
 * distingue, y la distinción es justo la que separa afirmar un hecho de
 * inventarlo (METODOLOGIA §6.1):
 *
 *   pagos_filas = 0            → sin rastro. No se afirma nada.
 *   pagos_filas > 0, pagados=0 → cero desembolsado, corroborado.
 *   pagos_confirmados > 0      → desembolso verificable, con fecha.
 *
 * Uso:
 *   infisical run --env=dev -- pnpm tsx scripts/ingest-pagos.ts
 *   infisical run --env=dev -- pnpm tsx scripts/ingest-pagos.ts --limit 500
 */
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    limit: { type: "string" },
    lote: { type: "string", default: "40" },
  },
});

const DATASET = "uymx-8p3j";
const BASE = `https://www.datos.gov.co/resource/${DATASET}.json`;
const TOKEN = process.env.SOCRATA_APP_TOKEN;
const LOTE = Number(args.lote) || 40;
/** Techo por consulta. El promedio observado es ~5 filas por contrato; con
 *  lotes de 40 esto deja un margen de 50x antes de truncar. */
const TECHO = 10_000;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

/** Estados que implican plata efectivamente desembolsada. */
const PAGADO = new Set(["pagado"]);
/** Facturado que todavía no sale pero ya está comprometido. */
const EN_TRAMITE = new Set([
  "aprobado",
  "bajo aprobación",
  "bajo aprobacion",
  "enviado por proveedor",
  "pendiente registro",
]);

type FilaSocrata = Record<string, string | undefined>;

async function socrata(where: string): Promise<FilaSocrata[]> {
  const url = `${BASE}?$where=${encodeURIComponent(where)}&$limit=${TECHO}`;
  for (let intento = 1; intento <= 4; intento++) {
    try {
      const res = await fetch(url, {
        headers: TOKEN ? { "X-App-Token": TOKEN } : {},
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const filas = (await res.json()) as FilaSocrata[];
      if (filas.length === TECHO) {
        console.warn(`\n  aviso: lote truncado en ${TECHO} filas — revisar`);
      }
      return filas;
    } catch (e) {
      if (intento === 4) throw e;
      await new Promise((r) => setTimeout(r, 2000 * intento));
    }
  }
  return [];
}

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fecha = (v: unknown): string | null => {
  if (typeof v !== "string" || !v) return null;
  const iso = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
};

const txt = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" || t === "No Definido" ? null : t;
};

function mapRow(f: FilaSocrata) {
  return {
    id_contrato: f.id_del_contrato!,
    id_pago: Number(f.id_de_pago),
    numero_factura: txt(f.numero_de_factura),
    estado: txt(f.estado),
    valor_a_pagar: num(f.valor_a_pagar),
    valor_total: num(f.valor_total ?? f.valor_total_de_la_factura),
    fecha_real_de_pago: fecha(f.fecha_real_de_pago),
    fecha_estimada_de_pago: fecha(f.fecha_estimada_de_pago),
    fecha_de_emision: fecha(f.fecha_de_emision ?? f.fecha_de_emisi_n),
    nombre_supervisor: txt(f.nombre_supervisor),
    documento_supervisor: txt(f.documento_supervisor),
    nit_entidad: txt(f.nit_entidad),
    documento_proveedor: txt(f.documento_proveedor),
    raw: f,
  };
}

type Agregado = {
  pagos_confirmados: number;
  pagos_en_tramite: number;
  pagos_filas: number;
  pagos_ultima_fecha: string | null;
  supervisor_nombre: string | null;
  supervisor_documento: string | null;
};

function agregar(filas: ReturnType<typeof mapRow>[]): Agregado {
  let confirmados = 0;
  let tramite = 0;
  let ultima: string | null = null;
  let supNombre: string | null = null;
  let supDoc: string | null = null;

  for (const f of filas) {
    const estado = (f.estado ?? "").toLowerCase();
    const valor = f.valor_a_pagar ?? 0;
    // Solo cuenta como desembolso si además trae la fecha: el estado sin
    // fecha real es una promesa, no una prueba.
    if (PAGADO.has(estado) && f.fecha_real_de_pago) {
      confirmados += valor;
      if (!ultima || f.fecha_real_de_pago > ultima) ultima = f.fecha_real_de_pago;
    } else if (EN_TRAMITE.has(estado)) {
      tramite += valor;
    }
    if (!supDoc && f.documento_supervisor) {
      supDoc = f.documento_supervisor;
      supNombre = f.nombre_supervisor;
    }
  }

  return {
    pagos_confirmados: confirmados,
    pagos_en_tramite: tramite,
    pagos_filas: filas.length,
    pagos_ultima_fecha: ultima,
    supervisor_nombre: supNombre,
    supervisor_documento: supDoc,
  };
}

function enLotes<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function traerIds(): Promise<string[]> {
  const ids: string[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from("contracts")
      .select("id_contrato")
      .neq("vigencia", "otro")
      .order("id_contrato", { ascending: true })
      .range(offset, offset + PAGE - 1);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    ids.push(...data.map((d) => d.id_contrato as string));
    if (data.length < PAGE) break;
    if (args.limit && ids.length >= Number(args.limit)) break;
  }
  return args.limit ? ids.slice(0, Number(args.limit)) : ids;
}

async function main() {
  const ids = await traerIds();
  const lotes = enLotes(ids, LOTE);
  console.log(`Contratos a consultar: ${ids.length} en ${lotes.length} lotes de ${LOTE}`);

  let filasTotales = 0;
  let conRastro = 0;
  let ceroCorroborado = 0;
  let conDesembolso = 0;
  let sinRastro = 0;
  let hecho = 0;

  for (const lote of lotes) {
    const lista = lote.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    const crudas = await socrata(`id_del_contrato in(${lista})`);
    const filas = crudas.filter((f) => f.id_del_contrato && f.id_de_pago).map(mapRow);
    filasTotales += filas.length;

    // Dedup dentro del lote: ON CONFLICT no puede tocar la misma fila dos
    // veces en un solo statement (mismo problema que tuvo processes).
    const unicas = new Map<string, ReturnType<typeof mapRow>>();
    for (const f of filas) unicas.set(`${f.id_contrato}|${f.id_pago}`, f);

    if (unicas.size) {
      const { error } = await supabase
        .from("payments")
        .upsert([...unicas.values()], { onConflict: "id_contrato,id_pago" });
      if (error) throw new Error(`upsert payments: ${error.message}`);
    }

    // Agregados por contrato — incluidos los que no trajeron ninguna fila,
    // que se marcan explícitamente con 0 para distinguir "sin rastro" de
    // "todavía no consultado" (null).
    const porContrato = new Map<string, ReturnType<typeof mapRow>[]>();
    for (const f of unicas.values()) {
      const arr = porContrato.get(f.id_contrato) ?? [];
      arr.push(f);
      porContrato.set(f.id_contrato, arr);
    }

    // Los UPDATE van en paralelo: uno por contrato en serie son 19.000
    // round-trips y domina el tiempo total de la corrida.
    const updates = lote.map((id) => {
      const agg = agregar(porContrato.get(id) ?? []);
      if (agg.pagos_filas === 0) sinRastro++;
      else {
        conRastro++;
        if (agg.pagos_confirmados > 0) conDesembolso++;
        else ceroCorroborado++;
      }
      return { id, agg };
    });
    const errores = await Promise.all(
      updates.map(async ({ id, agg }) => {
        const { error } = await supabase.from("contracts").update(agg).eq("id_contrato", id);
        return error ? `${id}: ${error.message}` : null;
      }),
    );
    const fallo = errores.find(Boolean);
    if (fallo) throw new Error(`update contracts ${fallo}`);

    hecho += lote.length;
    if (hecho % 400 === 0 || hecho === ids.length) {
      console.log(
        `  ${hecho}/${ids.length} · ${filasTotales} filas · ` +
          `${conDesembolso} con desembolso · ${ceroCorroborado} en cero corroborado · ` +
          `${sinRastro} sin rastro`,
      );
    }
  }

  console.log(
    `\nListo. ${filasTotales} filas de pago para ${ids.length} contratos.\n` +
      `  con desembolso verificable : ${conDesembolso}\n` +
      `  cero pagado, corroborado   : ${ceroCorroborado}\n` +
      `  sin rastro (no se afirma)  : ${sinRastro}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
