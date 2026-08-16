/**
 * GET /api/contracts — listado con los filtros del dashboard.
 *
 * Todos los filtros mapean a índices existentes en `contracts`. La búsqueda
 * libre `q` acepta un id exacto (para pegar un CO1.PCCNTR.… tal cual) o texto
 * sobre entidad, proveedor y objeto.
 *
 * Dinámico siempre: el dashboard debe reflejar los análisis que terminaron
 * hace segundos, no una versión cacheada.
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS =
  "id,id_contrato,nombre_entidad,nit_entidad,departamento,ciudad,tipo_de_contrato,modalidad," +
  "objeto,estado_contrato,vigencia,valor_contrato,valor_pagado,valor_pendiente_ejecucion," +
  "fecha_firma,fecha_inicio,fecha_fin,proveedor,documento_proveedor,url_proceso," +
  "risk_score,risk_level,prioridad,plata_en_riesgo,porque_ahora,resumen_riesgo,valor_verificar";

const ORDENES: Record<string, { col: string; asc: boolean }> = {
  plata: { col: "plata_en_riesgo", asc: false },
  score: { col: "risk_score", asc: false },
  valor: { col: "valor_contrato", asc: false },
  fecha: { col: "fecha_firma", asc: false },
};

export async function GET(req: Request) {
  const sb = supabaseServer();
  const p = new URL(req.url).searchParams;

  const limit = Math.min(Number(p.get("limit")) || 50, 200);
  const offset = Math.max(Number(p.get("offset")) || 0, 0);

  try {
    let q = sb.from("contracts").select(COLUMNS, { count: "exact" });

    // Por defecto el dashboard no muestra lo que nunca se ejecutó.
    if (p.get("incluir_otro") !== "1") q = q.neq("vigencia", "otro");

    for (const [param, col] of [
      ["vigencia", "vigencia"],
      ["departamento", "departamento"],
      ["ciudad", "ciudad"],
      ["tipo", "tipo_de_contrato"],
      ["modalidad", "modalidad"],
      ["risk_level", "risk_level"],
      ["prioridad", "prioridad"],
    ] as const) {
      const v = p.get(param);
      if (v) q = q.eq(col, v);
    }

    const min = p.get("valor_min");
    const max = p.get("valor_max");
    if (min) q = q.gte("valor_contrato", Number(min));
    if (max) q = q.lte("valor_contrato", Number(max));

    // Filtro por patrón: se resuelve con los contratos que tienen ese hallazgo.
    const patron = p.get("patron");
    if (patron) {
      const { data: ids } = await sb
        .from("findings")
        .select("contract_id")
        .eq("pattern_code", patron)
        .limit(5000);
      const lista = (ids ?? []).map((f) => f.contract_id as string);
      if (!lista.length) {
        return NextResponse.json({ total: 0, contratos: [], limit, offset });
      }
      q = q.in("id", lista);
    }

    const texto = p.get("q")?.trim();
    if (texto) {
      // Un id de SECOP pegado tal cual busca exacto; el resto es texto libre.
      if (/^CO1\./i.test(texto)) {
        q = q.eq("id_contrato", texto);
      } else {
        const t = texto.replace(/[%,()]/g, " ");
        q = q.or(
          `nombre_entidad.ilike.%${t}%,proveedor.ilike.%${t}%,objeto.ilike.%${t}%`,
        );
      }
    }

    const orden = ORDENES[p.get("orden") ?? "plata"] ?? ORDENES.plata;
    q = q.order(orden.col, { ascending: orden.asc, nullsFirst: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await q;
    if (error) throw new Error(error.message);

    return NextResponse.json({ total: count ?? 0, contratos: data ?? [], limit, offset });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
