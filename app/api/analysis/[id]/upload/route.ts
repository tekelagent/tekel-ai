/**
 * POST /api/analysis/[id]/upload
 *
 * Recibe el pliego en PDF cuando el análisis quedó en `needs_upload`.
 *
 * Este endpoint no es un parche: SECOP II protege sus páginas de proceso con
 * reCAPTCHA, así que los adjuntos no son descargables de forma programática
 * (METODOLOGIA §7). El documento es público y el usuario sí puede bajarlo; al
 * aportarlo, el análisis se reanuda solo desde el paso de pliego.
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { estadoDe } from "@/lib/analysis/engine";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_PAGINAS = 80;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const idContrato = decodeURIComponent(id).trim();
  const sb = supabaseServer();

  try {
    const form = await req.formData();
    const archivo = form.get("file");
    if (!(archivo instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo PDF." }, { status: 400 });
    }
    if (archivo.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB; el máximo es 25 MB.` },
        { status: 413 },
      );
    }

    const bytes = new Uint8Array(await archivo.arrayBuffer());
    // Firma de PDF: %PDF
    if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
      return NextResponse.json({ error: "El archivo no es un PDF." }, { status: 415 });
    }

    // Se cuenta páginas antes de guardar: un pliego de 400 páginas dispararía
    // el costo del análisis sin aportar más señal.
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const paginas = pdf.numPages;
    if (paginas > MAX_PAGINAS) {
      return NextResponse.json(
        { error: `El PDF tiene ${paginas} páginas; el máximo es ${MAX_PAGINAS}.` },
        { status: 413 },
      );
    }

    const { data: contrato } = await sb
      .from("contracts")
      .select("id")
      .eq("id_contrato", idContrato)
      .maybeSingle();
    if (!contrato) {
      return NextResponse.json({ error: `Contrato ${idContrato} no encontrado.` }, { status: 404 });
    }

    const ruta = `${idContrato}/${Date.now()}-${archivo.name.replace(/[^\w.\-]/g, "_")}`;
    const { error: upErr } = await sb.storage.from("docs").upload(ruta, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) throw new Error(`No se pudo guardar el documento: ${upErr.message}`);

    await sb.from("documents").upsert(
      [
        {
          contract_id: contrato.id,
          id_contrato: idContrato,
          document_id: `upload-${Date.now()}`,
          nombre: archivo.name,
          tipo: "pliego",
          status: "downloaded",
          storage_path: ruta,
          paginas,
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "contract_id,document_id" },
    );

    // Vuelve a la cola en el paso de documentos: el siguiente /advance lo
    // encuentra descargado y pasa directo a analizar el pliego.
    const previo = await estadoDe(idContrato);
    const log = [
      ...(previo?.log ?? []),
      { ts: new Date().toISOString(), msg: `Documento recibido: ${archivo.name} (${paginas} páginas).` },
    ];
    await sb
      .from("deep_analyses")
      .update({ status: "running", stage: "docs", log, last_advance_at: new Date().toISOString() })
      .eq("id_contrato_ref", idContrato);

    return NextResponse.json({ ...(await estadoDe(idContrato)), paginas, nombre: archivo.name });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
