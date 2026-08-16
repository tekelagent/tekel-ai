#!/usr/bin/env tsx
/**
 * Precómputo de la Capa C para los contratos priorizados.
 *
 * Cuando el jurado abre un P1, el perfil forense ya está cacheado: aparece
 * instantáneo y cuesta $0. Sin esto, cada clic espera 20-40 segundos de
 * consultas a Croma.
 *
 * Corre en modo `background`, así que consulta también Contaduría —el endpoint
 * lento que el análisis interactivo se salta— con 90 s de margen.
 *
 * Uso:
 *   infisical run --env=dev -- pnpm precompute-deep
 *   infisical run --env=dev -- pnpm precompute-deep --prioridad P2 --limit 30
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { CromaProvider } from "../lib/providers/forensic/croma";
import { hallazgosDeForense } from "../lib/analysis/forense-findings";
import { triar } from "../lib/rules/priority";
import { todayUTC } from "../lib/rules/runner";
import type { ContractRow, Finding } from "../lib/rules/types";

const { values: args } = parseArgs({
  options: {
    prioridad: { type: "string", default: "P1" },
    limit: { type: "string" },
    /** Bajo esta cuota restante el precómputo se detiene: la reserva es del uso en vivo. */
    "reserva-cuota": { type: "string", default: "120" },
  },
});

const LIMIT = args.limit ? Number(args.limit) : Infinity;
const RESERVA = Number(args["reserva-cuota"]) || 120;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** Un documento consultable: solo dígitos, 4-15. Descarta los "No Definido". */
function documentoValido(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s || /^no\s/i.test(s)) return null;
  const d = s.replace(/\D/g, "");
  return d.length >= 4 && d.length <= 15 ? d : null;
}

/** Recalcula score y triaje de un contrato sumando todos sus hallazgos. */
async function recalcular(contractId: string) {
  const { data: raw } = await sb
    .from("contracts")
    .select(
      "id,id_contrato,vigencia,valor_contrato,valor_pagado,valor_pendiente_ejecucion," +
        "fecha_firma,fecha_fin,valor_verificar",
    )
    .eq("id", contractId)
    .maybeSingle();
  if (!raw) return;
  const c = raw as unknown as ContractRow;

  const { data: fs } = await sb
    .from("findings")
    .select("pattern_code,points,confianza,foco,severity,source,detail,evidence,contract_id")
    .eq("contract_id", contractId);

  const t = triar(c, (fs ?? []) as unknown as Finding[], { today: todayUTC() });
  await sb
    .from("contracts")
    .update({
      risk_score: t.risk_score,
      risk_level: t.risk_level,
      prioridad: t.prioridad,
      plata_en_riesgo: t.plata_en_riesgo,
      porque_ahora: t.porque_ahora,
    })
    .eq("id", contractId);
}

let emitidos = 0;

async function main() {
  console.log(`Precómputo de Capa C — prioridad ${args.prioridad}\n`);

  const { data, error } = await sb
    .from("contracts")
    .select("id,id_contrato,documento_proveedor,proveedor,prioridad,plata_en_riesgo,fecha_firma")
    .eq("prioridad", args.prioridad)
    .order("plata_en_riesgo", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);

  const candidatos = (data ?? []).filter((c) => documentoValido(c.documento_proveedor));
  const objetivo = candidatos.slice(0, LIMIT === Infinity ? undefined : LIMIT);
  console.log(
    `${data?.length ?? 0} contratos ${args.prioridad} · ${objetivo.length} con documento consultable\n`,
  );

  // Un mismo contratista puede tener varios contratos: se consulta una vez y
  // el resultado se reparte. Croma cobra por llamada, no por contrato.
  const porDocumento = new Map<string, typeof objetivo>();
  for (const c of objetivo) {
    const d = documentoValido(c.documento_proveedor)!;
    const arr = porDocumento.get(d) ?? [];
    arr.push(c);
    porDocumento.set(d, arr);
  }
  console.log(`${porDocumento.size} contratistas distintos que consultar\n`);

  const provider = new CromaProvider();
  let hechos = 0;
  let saltados = 0;
  let cuotaRestante: number | null = null;

  for (const [documento, contratos] of porDocumento) {
    if (cuotaRestante !== null && cuotaRestante < RESERVA) {
      console.log(`\nCuota por debajo de ${RESERVA}: se detiene para dejar margen al uso en vivo.`);
      break;
    }

    // Si ya hay perfil cacheado para todos sus contratos, no se repite.
    const { data: yaHecho } = await sb
      .from("deep_analyses")
      .select("id_contrato_ref")
      .in("id_contrato_ref", contratos.map((c) => c.id_contrato))
      .not("forensic", "is", null);
    if ((yaHecho?.length ?? 0) >= contratos.length) {
      saltados += contratos.length;
      continue;
    }

    const lineas: string[] = [`Verificando a ${contratos[0].proveedor ?? "el contratista"}…`];
    let perfil;
    try {
      perfil = await provider.perfilDeContratista(documento, {
        esPrioritario: true,
        modo: "background",
        onLog: (m) => lineas.push(m),
      });
      cuotaRestante = perfil.rate_remaining_final;
    } catch (err) {
      console.log(`  ${documento}: ${(err as Error).message.slice(0, 90)}`);
      continue;
    }

    const ahora = new Date().toISOString();
    for (const c of contratos) {
      // La verificación se convierte en hallazgos con puntos: sin esto la
      // Capa C sería informativa y no movería la priorización.
      const hallazgos = hallazgosDeForense(
        { id: c.id, proveedor: c.proveedor, fecha_firma: (c as any).fecha_firma ?? null },
        perfil,
      );
      if (hallazgos.length) {
        const { error: fErr } = await sb
          .from("findings")
          .upsert(hallazgos, { onConflict: "contract_id,pattern_code,source" });
        if (fErr) console.log(`\n  findings ${c.id_contrato}: ${fErr.message}`);
        else emitidos += hallazgos.length;
        await recalcular(c.id);
      }

      const { error: upErr } = await sb.from("deep_analyses").upsert(
        [
          {
            contract_id: c.id,
            id_contrato_ref: c.id_contrato,
            status: "done",
            stage: "forense",
            forensic: perfil as unknown as Record<string, unknown>,
            log: lineas.map((msg) => ({ ts: ahora, msg })),
            updated_at: ahora,
            last_advance_at: ahora,
          },
        ],
        { onConflict: "id_contrato_ref" },
      );
      if (upErr) console.log(`  upsert ${c.id_contrato}: ${upErr.message}`);
      else hechos++;
    }

    process.stdout.write(
      `\r  ${hechos} contratos con forense cacheado · cuota restante ${cuotaRestante ?? "?"}   `,
    );
  }

  console.log(`\n\nListo: ${hechos} cacheados, ${saltados} ya lo estaban.`);
  console.log(`Hallazgos de registros oficiales emitidos: ${emitidos}`);
  console.log(`Cuota Croma restante: ${cuotaRestante ?? "desconocida"}`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
