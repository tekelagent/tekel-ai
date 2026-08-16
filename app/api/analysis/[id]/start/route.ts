/**
 * POST /api/analysis/[id]/start
 *
 * Encola el análisis profundo de un contrato. Si el contrato NO está en el
 * corpus y su identificador tiene forma de SECOP II, lo trae EN VIVO de
 * Socrata, lo inserta y le corre las reglas antes de encolar. Eso es lo que
 * permite que cualquiera busque cualquier contrato de Colombia, no solo los
 * 20.000 que ingestamos.
 *
 * Devuelve siempre el estado del trabajo para que el frontend entre al bucle
 * de /advance sin una segunda llamada.
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { traerContratoEnVivo } from "@/lib/ingest/mapper";
import { estadoDe, TOPE_ANALISIS_DIARIOS } from "@/lib/analysis/engine";
import { buildContext, runRules, todayUTC } from "@/lib/rules/runner";
import { triar } from "@/lib/rules/priority";
import type { ContractRow } from "@/lib/rules/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Identificadores de contrato de SECOP II. */
const FORMA_SECOP = /^CO1\.[A-Z]+\.\d+$/i;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const idContrato = decodeURIComponent(id).trim();
  const sb = supabaseServer();

  try {
    // Caché primero, siempre: el segundo clic es instantáneo y cuesta cero.
    const yaExiste = await estadoDe(idContrato);
    if (yaExiste && yaExiste.status !== "error") {
      return NextResponse.json({ ...yaExiste, desde_cache: true });
    }

    let { data: contrato } = await sb
      .from("contracts")
      .select("id,id_contrato,prioridad")
      .eq("id_contrato", idContrato)
      .maybeSingle();

    let traidoEnVivo = false;

    if (!contrato) {
      if (!FORMA_SECOP.test(idContrato)) {
        return NextResponse.json(
          { error: `"${idContrato}" no está en el corpus y no tiene forma de contrato de SECOP II.` },
          { status: 404 },
        );
      }

      // Cuota diaria: el jurado usa esto sin supervisión.
      const hoy = todayUTC();
      const { data: cuota } = await sb
        .from("analysis_quota")
        .select("ejecutados")
        .eq("dia", hoy)
        .maybeSingle();
      if ((cuota?.ejecutados ?? 0) >= TOPE_ANALISIS_DIARIOS) {
        return NextResponse.json(
          { error: `Se alcanzó el tope de ${TOPE_ANALISIS_DIARIOS} análisis en vivo por día.` },
          { status: 429 },
        );
      }

      const fila = await traerContratoEnVivo(idContrato);
      if (!fila) {
        return NextResponse.json(
          { error: `El contrato ${idContrato} no existe en SECOP II.` },
          { status: 404 },
        );
      }

      const { data: insertado, error: insErr } = await sb
        .from("contracts")
        .upsert([fila], { onConflict: "id_contrato" })
        .select("id,id_contrato,prioridad")
        .single();
      if (insErr) throw new Error(`No se pudo guardar el contrato: ${insErr.message}`);
      contrato = insertado;
      traidoEnVivo = true;

      await sb.from("analysis_quota").upsert(
        [{ dia: hoy, ejecutados: (cuota?.ejecutados ?? 0) + 1, updated_at: new Date().toISOString() }],
        { onConflict: "dia" },
      );

      // Reglas sobre el contrato recién traído. Los agregados de corpus se
      // calculan sobre sus pares ya ingestados: un contrato aislado no puede
      // disparar FRACCIONAMIENTO ni CONCENTRACION contra un corpus vacío.
      await correrReglas(idContrato);
    }

    const log = [
      {
        ts: new Date().toISOString(),
        msg: traidoEnVivo
          ? `Contrato traído en vivo de SECOP II y evaluado con el motor de reglas.`
          : `Contrato encontrado en el corpus. Iniciando análisis profundo…`,
      },
    ];

    await sb.from("deep_analyses").upsert(
      [
        {
          contract_id: contrato!.id,
          id_contrato_ref: idContrato,
          status: "queued",
          stage: null,
          log,
          cost_usd: 0,
          error: null,
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "id_contrato_ref" },
    );

    const estado = await estadoDe(idContrato);
    return NextResponse.json({ ...estado, traido_en_vivo: traidoEnVivo, desde_cache: false });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/**
 * Aplica el motor de reglas a un contrato individual, usando como contexto sus
 * pares de la misma entidad y proveedor que ya estén en la base.
 */
async function correrReglas(idContrato: string) {
  const sb = supabaseServer();
  const COLS =
    "id,id_contrato,proceso_de_compra,nombre_entidad,nit_entidad,departamento,ciudad," +
    "tipo_de_contrato,modalidad,objeto,estado_contrato,vigencia,valor_contrato,valor_pagado," +
    "valor_facturado,valor_pendiente_ejecucion,pago_adelantado,valor_pago_adelantado," +
    "dias_adicionados,fecha_firma,fecha_inicio,fecha_fin,documento_proveedor,proveedor," +
    "representante_id,url_proceso,valor_verificar";

  const { data: propio } = await sb.from("contracts").select(COLS).eq("id_contrato", idContrato).maybeSingle();
  if (!propio) return;
  const c = { ...(propio as unknown as ContractRow), raw: {} };

  // Pares del mismo proveedor o de la misma entidad, para los agregados.
  const { data: pares } = await sb
    .from("contracts")
    .select(COLS)
    .or(
      `documento_proveedor.eq.${c.documento_proveedor ?? "___"},nit_entidad.eq.${c.nit_entidad ?? "___"}`,
    )
    .limit(2000);

  const universo: ContractRow[] = [
    c,
    ...((pares ?? []) as unknown as ContractRow[])
      .filter((p) => p.id !== c.id)
      .map((p) => ({ ...p, raw: {} })),
  ];

  const ctx = buildContext(universo, todayUTC());
  const hallazgos = runRules(c, ctx);
  const t = triar(c, hallazgos, { today: todayUTC() });

  if (hallazgos.length) {
    await sb.from("findings").upsert(hallazgos, { onConflict: "contract_id,pattern_code,source" });
  }
  await sb
    .from("contracts")
    .update({
      risk_score: t.risk_score,
      risk_level: t.risk_level,
      prioridad: t.prioridad,
      plata_en_riesgo: t.plata_en_riesgo,
      porque_ahora: t.porque_ahora,
    })
    .eq("id", c.id);
}
