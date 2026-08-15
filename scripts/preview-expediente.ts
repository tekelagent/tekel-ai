#!/usr/bin/env tsx
/**
 * Imprime el Expediente de Priorización (METODOLOGIA §5) de un contrato.
 *
 * Por defecto toma el P1 con mayor plata en riesgo: el que un equipo de control
 * abriría primero.
 *
 * Uso:
 *   infisical run --env=dev -- pnpm preview-expediente
 *   infisical run --env=dev -- pnpm preview-expediente --prioridad P2
 *   infisical run --env=dev -- pnpm preview-expediente --contrato CO1.PCCNTR.123
 *   infisical run --env=dev -- pnpm preview-expediente --json
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { construirExpediente, renderExpediente } from "../lib/expediente";
import { todayUTC } from "../lib/rules/runner";
import type { ContractRow, Finding } from "../lib/rules/types";

const { values: args } = parseArgs({
  options: {
    prioridad: { type: "string", default: "P1" },
    contrato: { type: "string" },
    json: { type: "boolean", default: false },
    today: { type: "string" },
  },
});

const TODAY = args.today ?? todayUTC();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Lanza el script con: infisical run --env=dev -- pnpm preview-expediente");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const COLUMNS =
  "id,id_contrato,nombre_entidad,nit_entidad,departamento,ciudad,tipo_de_contrato," +
  "modalidad,objeto,estado_contrato,vigencia,valor_contrato,valor_pagado,valor_facturado," +
  "valor_pendiente_ejecucion,pago_adelantado,valor_pago_adelantado,dias_adicionados," +
  "fecha_firma,fecha_inicio,fecha_fin,documento_proveedor,proveedor,url_proceso,valor_verificar";

async function main() {
  let query = supabase.from("contracts").select(COLUMNS).limit(1);

  if (args.contrato) {
    query = query.eq("id_contrato", args.contrato);
  } else {
    query = query
      .eq("prioridad", args.prioridad)
      .order("plata_en_riesgo", { ascending: false, nullsFirst: false });
  }

  const { data, error } = await query;
  if (error) throw new Error(`Supabase select: ${error.message}`);
  if (!data?.length) {
    console.log(
      args.contrato
        ? `No se encontró el contrato ${args.contrato}.`
        : `No hay contratos con prioridad ${args.prioridad}.`,
    );
    return;
  }

  const contrato = { ...(data[0] as unknown as ContractRow), raw: null };

  const { data: fData, error: fError } = await supabase
    .from("findings")
    .select("contract_id,pattern_code,severity,points,confianza,foco,detail,evidence,source")
    .eq("contract_id", contrato.id)
    .order("points", { ascending: false });
  if (fError) throw new Error(`Supabase select findings: ${fError.message}`);

  const findings = (fData ?? []) as unknown as Finding[];
  const expediente = construirExpediente(contrato, findings, { today: TODAY });

  console.log(args.json ? JSON.stringify(expediente, null, 2) : renderExpediente(expediente));
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
