/**
 * POST /api/analysis/[id]/advance
 *
 * Ejecuta UN paso pendiente y devuelve estado + log acumulado. El frontend lo
 * llama en bucle cada 1,5-2 s y pinta cada línea al llegar: esa es toda la
 * experiencia de "análisis en vivo", sin colas ni websockets.
 *
 * Un paso por llamada para que ninguna exceda el presupuesto de la función.
 */
import { NextResponse } from "next/server";
import { avanzar, estadoDe } from "@/lib/analysis/engine";

export const runtime = "nodejs";
export const maxDuration = 60;
// Nunca cacheado: cada llamada debe reflejar el estado real del trabajo.
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const idContrato = decodeURIComponent(id).trim();

  try {
    const previo = await estadoDe(idContrato);
    if (!previo) {
      return NextResponse.json(
        { error: `No hay análisis iniciado para ${idContrato}. Llama a /start primero.` },
        { status: 404 },
      );
    }
    // needs_upload y los estados finales no avanzan solos: esperan al usuario.
    if (previo.terminado || previo.status === "needs_upload") {
      return NextResponse.json(previo);
    }

    const estado = await avanzar(idContrato);
    return NextResponse.json(estado);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** GET del mismo estado, para que la vista de detalle pueda revalidar. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const estado = await estadoDe(decodeURIComponent(id).trim());
  if (!estado) return NextResponse.json({ error: "sin análisis" }, { status: 404 });
  return NextResponse.json(estado);
}
