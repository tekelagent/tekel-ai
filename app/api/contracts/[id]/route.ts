/**
 * GET /api/contracts/[id] — expediente completo del contrato.
 *
 * Ensambla con `lib/expediente.ts`, que es la misma función que usa el preview
 * de consola: la UI y el auditor ven exactamente lo mismo.
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { construirExpediente } from "@/lib/expediente";
import { todayUTC } from "@/lib/rules/runner";
import { estadoDe } from "@/lib/analysis/engine";
import type { ContractRow, Finding } from "@/lib/rules/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS =
  "id,id_contrato,proceso_de_compra,nombre_entidad,nit_entidad,departamento,ciudad," +
  "tipo_de_contrato,modalidad,objeto,estado_contrato,vigencia,valor_contrato,valor_pagado," +
  "valor_facturado,valor_pendiente_ejecucion,pago_adelantado,valor_pago_adelantado," +
  "dias_adicionados,fecha_firma,fecha_inicio,fecha_fin,documento_proveedor,proveedor," +
  "representante_id,url_proceso,valor_verificar,risk_score,risk_level,prioridad," +
  "plata_en_riesgo,porque_ahora,resumen_riesgo";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const idContrato = decodeURIComponent(id).trim();
  const sb = supabaseServer();

  try {
    const { data: c, error } = await sb
      .from("contracts")
      .select(COLUMNS)
      .eq("id_contrato", idContrato)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });

    const contrato = { ...(c as unknown as ContractRow), raw: null };

    const [{ data: findings }, { data: deep }, { data: docs }] = await Promise.all([
      sb
        .from("findings")
        .select("contract_id,pattern_code,severity,points,confianza,foco,detail,evidence,source")
        .eq("contract_id", contrato.id)
        .order("points", { ascending: false }),
      sb
        .from("deep_analyses")
        .select("status,stage,forensic,narrative,pliego,model,cost_usd,updated_at")
        .eq("id_contrato_ref", idContrato)
        .maybeSingle(),
      sb
        .from("documents")
        .select("nombre,tipo,status,url_oficial,paginas")
        .eq("id_contrato", idContrato),
    ]);

    const expediente = construirExpediente(contrato, (findings ?? []) as unknown as Finding[], {
      today: todayUTC(),
    });

    // El perfil forense sale de la Capa C cuando ya corrió; si no, el
    // expediente ya declara que no está disponible.
    const analisis = await estadoDe(idContrato);

    return NextResponse.json({
      expediente,
      // Datos crudos para que la UI pinte lo suyo sin re-derivar.
      contrato,
      capa_c: deep
        ? {
            status: deep.status,
            stage: deep.stage,
            forensic: deep.forensic,
            pliego: deep.pliego,
            modelo: deep.model,
            costo_usd: Number(deep.cost_usd ?? 0),
            actualizado: deep.updated_at,
          }
        : null,
      analisis,
      documentos: docs ?? [],
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
