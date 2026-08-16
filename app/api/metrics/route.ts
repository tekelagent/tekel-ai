/**
 * GET /api/metrics — cifras de cabecera del dashboard.
 *
 * Se calculan sobre el corpus entero, no sobre la página que la UI tenga
 * cargada: "20.000 contratos vigilados" tiene que ser el corpus, no las 200
 * filas visibles.
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sb = supabaseServer();
  try {
    const [vigilados, criticos, hallazgos, p1] = await Promise.all([
      sb.from("contracts").select("id", { count: "exact", head: true }).neq("vigencia", "otro"),
      sb.from("contracts").select("id", { count: "exact", head: true }).eq("risk_level", "critico"),
      sb.from("findings").select("id", { count: "exact", head: true }),
      sb.from("contracts").select("plata_en_riesgo").eq("prioridad", "P1"),
    ]);

    const plataP1 = (p1.data ?? []).reduce(
      (a, c) => a + Number((c as { plata_en_riesgo: number | null }).plata_en_riesgo ?? 0),
      0,
    );

    return NextResponse.json({
      contratos_vigilados: vigilados.count ?? 0,
      contratos_criticos: criticos.count ?? 0,
      hallazgos: hallazgos.count ?? 0,
      plata_en_riesgo_p1: plataP1,
      contratos_p1: (p1.data ?? []).length,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
