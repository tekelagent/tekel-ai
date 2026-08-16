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
      sb.from("contracts").select("plata_en_riesgo,pagos_en_tramite").eq("prioridad", "P1"),
    ]);

    type FilaP1 = { plata_en_riesgo: number | null; pagos_en_tramite: number | null };
    const filas = (p1.data ?? []) as FilaP1[];

    const plataP1 = filas.reduce((a, c) => a + Number(c.plata_en_riesgo ?? 0), 0);
    // Facturado aprobado o radicado, sin pagar. Es la cifra defendible: no la
    // suma de valores de contrato, sino plata con una factura detrás que
    // todavía no ha salido y que por tanto se puede detener.
    const porSalirP1 = filas.reduce((a, c) => a + Number(c.pagos_en_tramite ?? 0), 0);

    return NextResponse.json({
      contratos_vigilados: vigilados.count ?? 0,
      contratos_criticos: criticos.count ?? 0,
      hallazgos: hallazgos.count ?? 0,
      plata_en_riesgo_p1: plataP1,
      por_salir_p1: porSalirP1,
      contratos_p1: filas.length,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
