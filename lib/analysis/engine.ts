/**
 * Motor de análisis on-demand — máquina de estados de la Capa C.
 *
 * El frontend llama `/advance` en bucle y pinta el log; cada llamada ejecuta UN
 * paso y vuelve. Esa es toda la infraestructura de "tiempo real": no hay colas
 * ni websockets, y cada paso cabe dentro del límite de una función serverless.
 *
 *   queued → forense → docs → pliego → done
 *                        ↓
 *                  needs_upload ──(usuario sube PDF)──→ pliego
 *
 * `needs_upload` no es un error: SECOP II no expone los adjuntos de forma
 * programática (METODOLOGIA §7), así que pedir el PDF es el camino normal.
 */
import { z } from "zod";
import { supabaseServer } from "../supabase/server";
import { createForensicProvider, type PerfilForense } from "../providers/forensic/croma";
import { OpenRouterProvider } from "../providers/llm";
import { config } from "../config";
import { focoOf, pointsOf, severityOf } from "../rules/catalog";

export type Stage = "forense" | "docs" | "pliego";
export type Status = "queued" | "running" | "needs_upload" | "done" | "error";

export type LineaLog = { ts: string; msg: string };

export type EstadoAnalisis = {
  id_contrato: string;
  status: Status;
  stage: Stage | null;
  log: LineaLog[];
  cost_usd: number;
  /** true cuando ya no hay que volver a llamar a /advance. */
  terminado: boolean;
};

/** Tope de gasto de LLM por trabajo. El jurado usa esto sin supervisión. */
export const TOPE_COSTO_JOB_USD = 0.5;
/** Análisis en vivo por día. Configurable por entorno. */
export const TOPE_ANALISIS_DIARIOS = Number(process.env.TEKEL_MAX_ANALISIS_DIA) || 40;

const PliegoSchema = z.object({
  hallazgos: z.array(
    z.object({
      hallazgo: z.string().min(10),
      cita_textual: z.string().min(10),
      pagina: z.coerce.number().int().positive(),
      archivo: z.string().optional(),
    }),
  ),
});

const SYSTEM_PLIEGO = `Eres un auditor de contratación pública colombiana analizando un pliego de condiciones.

Buscas PLIEGO_SASTRE: requisitos que restringen la libre concurrencia sin justificación
técnica — condiciones que solo un proponente concreto podría cumplir.

REGLAS ESTRICTAS:
1. "cita_textual" debe ser transcripción LITERAL del pliego. Si no puedes copiarla
   literalmente, NO reportes ese hallazgo.
2. "pagina" es el número donde aparece la cita.
3. Si no hay requisitos restrictivos, devuelve lista vacía. Un pliego normal es un
   resultado válido.
4. No inventes, no infieras, no cites normas.

Responde ÚNICAMENTE con JSON:
{"hallazgos":[{"hallazgo":"...","cita_textual":"...","pagina":1,"archivo":"..."}]}`;

const ahora = () => new Date().toISOString();

/**
 * Un documento consultable en registros oficiales: solo dígitos, entre 4 y 15.
 * Descarta los "No Definido" y demás marcadores que SECOP publica en el campo.
 */
function documentoValido(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s || /^no\s/i.test(s)) return null;
  const digitos = s.replace(/\D/g, "");
  return digitos.length >= 4 && digitos.length <= 15 ? digitos : null;
}

/** Añade líneas al log del trabajo, preservando lo anterior. */
async function anotar(idContrato: string, lineas: string[]) {
  if (!lineas.length) return;
  const sb = supabaseServer();
  const { data } = await sb
    .from("deep_analyses")
    .select("log")
    .eq("id_contrato_ref", idContrato)
    .maybeSingle();
  const previo: LineaLog[] = (data?.log as LineaLog[]) ?? [];
  const nuevo = [...previo, ...lineas.map((msg) => ({ ts: ahora(), msg }))];
  await sb
    .from("deep_analyses")
    .update({ log: nuevo, last_advance_at: ahora() })
    .eq("id_contrato_ref", idContrato);
}

/** Estado actual del trabajo, o null si no existe. */
export async function estadoDe(idContrato: string): Promise<EstadoAnalisis | null> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("deep_analyses")
    .select("id_contrato_ref,status,stage,log,cost_usd")
    .eq("id_contrato_ref", idContrato)
    .maybeSingle();
  if (!data) return null;
  return {
    id_contrato: data.id_contrato_ref as string,
    status: data.status as Status,
    stage: (data.stage ?? null) as Stage | null,
    log: (data.log as LineaLog[]) ?? [],
    cost_usd: Number(data.cost_usd ?? 0),
    terminado: data.status === "done" || data.status === "error",
  };
}

/**
 * Ejecuta el siguiente paso pendiente y devuelve el estado resultante.
 *
 * Un paso por llamada, para que ninguna exceda el presupuesto de tiempo de una
 * función serverless. El frontend repite hasta `terminado`.
 */
export async function avanzar(idContrato: string): Promise<EstadoAnalisis> {
  const sb = supabaseServer();
  const estado = await estadoDe(idContrato);
  if (!estado) throw new Error(`No hay análisis encolado para ${idContrato}`);
  if (estado.terminado) return estado;

  // El siguiente paso sale del estado actual: queued arranca por forense.
  const siguiente: Stage =
    estado.stage === null || estado.status === "queued"
      ? "forense"
      : estado.stage === "forense"
        ? "docs"
        : "pliego";

  await sb
    .from("deep_analyses")
    .update({ status: "running", stage: siguiente, last_advance_at: ahora() })
    .eq("id_contrato_ref", idContrato);

  try {
    if (siguiente === "forense") await pasoForense(idContrato);
    else if (siguiente === "docs") await pasoDocs(idContrato);
    else await pasoPliego(idContrato);
  } catch (err) {
    const msg = (err as Error).message;
    await anotar(idContrato, [`Error en el paso ${siguiente}: ${msg}`]);
    await sb
      .from("deep_analyses")
      .update({ status: "error", error: msg, last_advance_at: ahora() })
      .eq("id_contrato_ref", idContrato);
    return (await estadoDe(idContrato))!;
  }

  return (await estadoDe(idContrato))!;
}

// ── Paso 1: forense ─────────────────────────────────────────────────────────
async function pasoForense(idContrato: string) {
  const sb = supabaseServer();
  const { data: c } = await sb
    .from("contracts")
    .select("id,documento_proveedor,proveedor,prioridad")
    .eq("id_contrato", idContrato)
    .maybeSingle();

  // SECOP publica "No Definido" como si fuera un documento. Sin validar, se
  // gastaban las cinco llamadas del presupuesto contra un valor que Croma
  // rechaza — y la cuota diaria es de 500 para toda la plataforma.
  const documento = c ? documentoValido(c.documento_proveedor) : null;
  if (!c || !documento) {
    await anotar(idContrato, [
      c?.documento_proveedor
        ? `El contrato registra "${c.documento_proveedor}" como documento del contratista, ` +
          `que no es un número válido: no se puede verificar en fuentes oficiales.`
        : "El contrato no registra documento del contratista: se omite la verificación forense.",
    ]);
    await sb.from("deep_analyses").update({ stage: "forense" }).eq("id_contrato_ref", idContrato);
    return;
  }

  const lineas: string[] = [`Verificando a ${c.proveedor ?? "el contratista"} en fuentes oficiales…`];
  const provider = createForensicProvider();
  const perfil: PerfilForense = await provider.perfilDeContratista(documento, {
    esPrioritario: c.prioridad === "P1",
    onLog: (m) => lineas.push(m),
  });

  lineas.push(
    `Forense completo: ${perfil.llamadas} consultas` +
      (perfil.omitidos.length ? `, ${perfil.omitidos.length} omitidas` : "") +
      `.`,
  );

  await sb
    .from("deep_analyses")
    .update({ forensic: perfil as unknown as Record<string, unknown>, stage: "forense" })
    .eq("id_contrato_ref", idContrato);
  await anotar(idContrato, lineas);
}

// ── Paso 2: documentos ──────────────────────────────────────────────────────
async function pasoDocs(idContrato: string) {
  const sb = supabaseServer();
  const lineas: string[] = ["Buscando el pliego del proceso…"];

  const { data: c } = await sb
    .from("contracts")
    .select("id,url_proceso")
    .eq("id_contrato", idContrato)
    .maybeSingle();

  // Cascada: primero lo que ya se descubrió antes.
  const { data: docs } = await sb
    .from("documents")
    .select("id,nombre,tipo,status,storage_path,url_oficial")
    .eq("id_contrato", idContrato)
    .in("status", ["downloaded", "parsed", "analyzed"]);

  if (docs && docs.length) {
    lineas.push(`Encontrado: ${docs.length} documento(s) ya disponible(s).`);
    await sb.from("deep_analyses").update({ stage: "docs" }).eq("id_contrato_ref", idContrato);
    await anotar(idContrato, lineas);
    return;
  }

  // SECOP II protege las páginas de proceso con reCAPTCHA, así que no hay
  // descubrimiento programático (METODOLOGIA §7). Se pide el PDF al usuario.
  lineas.push(
    "SECOP II no permite descargar los anexos de forma automática: su página de proceso " +
      "está protegida con reCAPTCHA.",
  );
  if (c?.url_proceso) lineas.push(`Puedes descargarlo aquí: ${c.url_proceso}`);
  lineas.push("Sube el pliego en PDF y el análisis continúa solo desde donde quedó.");

  await sb
    .from("deep_analyses")
    .update({ status: "needs_upload", stage: "docs", last_advance_at: ahora() })
    .eq("id_contrato_ref", idContrato);
  await anotar(idContrato, lineas);
}

// ── Paso 3: pliego ──────────────────────────────────────────────────────────
async function pasoPliego(idContrato: string) {
  const sb = supabaseServer();
  const lineas: string[] = [];

  const { data: c } = await sb
    .from("contracts")
    .select("id,objeto,valor_contrato,nombre_entidad")
    .eq("id_contrato", idContrato)
    .maybeSingle();
  if (!c) throw new Error("Contrato no encontrado");

  const { data: doc } = await sb
    .from("documents")
    .select("id,nombre,storage_path,paginas,tiene_texto")
    .eq("id_contrato", idContrato)
    .in("status", ["downloaded", "parsed"])
    .limit(1)
    .maybeSingle();

  if (!doc?.storage_path) {
    await sb
      .from("deep_analyses")
      .update({ status: "needs_upload", stage: "docs" })
      .eq("id_contrato_ref", idContrato);
    await anotar(idContrato, ["No hay pliego disponible para analizar."]);
    return;
  }

  lineas.push(`Leyendo ${doc.nombre ?? "el pliego"}…`);

  const { data: archivo, error: dlErr } = await sb.storage.from("docs").download(doc.storage_path);
  if (dlErr || !archivo) throw new Error(`No se pudo leer el documento: ${dlErr?.message}`);

  const { extractText, getDocumentProxy } = await import("unpdf");
  const buf = new Uint8Array(await archivo.arrayBuffer());
  const pdf = await getDocumentProxy(buf);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const paginas = text as string[];
  const conTexto = paginas.filter((p) => (p ?? "").trim().length > 50).length;

  lineas.push(`${totalPages} páginas · ${conTexto} con texto extraíble.`);

  if (conTexto === 0) {
    // Sin capa de texto habría que ir por visión; se declara y se corta aquí.
    lineas.push("El PDF es una imagen escaneada, sin capa de texto: requiere análisis por visión.");
    await sb
      .from("documents")
      .update({ status: "parsed", paginas: totalPages, tiene_texto: false })
      .eq("id", doc.id);
    await sb
      .from("deep_analyses")
      .update({ status: "done", stage: "pliego" })
      .eq("id_contrato_ref", idContrato);
    await anotar(idContrato, lineas);
    return;
  }

  // Se envían las páginas más densas: la ficha técnica, no la portada.
  const indices = paginas
    .map((p, i) => ({ i, len: (p ?? "").length }))
    .sort((a, b) => b.len - a.len)
    .slice(0, 12)
    .map((x) => x.i)
    .sort((a, b) => a - b);
  const fragmento = indices.map((i) => `--- PÁGINA ${i + 1} ---\n${paginas[i]}`).join("\n\n");

  lineas.push(`Analizando ${indices.length} páginas con ${config.llm.deepModel}…`);
  await anotar(idContrato, lineas);
  lineas.length = 0;

  const llm = new OpenRouterProvider({ model: config.llm.deepModel ?? undefined });
  const res = await llm.structured({
    system: SYSTEM_PLIEGO,
    user: `Contrato: ${c.objeto ?? ""}\nEntidad: ${c.nombre_entidad ?? ""}\n\n${fragmento}`,
    schema: PliegoSchema,
    schemaName: "PliegoSchema",
    maxTokens: 2500,
  });

  const hallazgos = res.data.hallazgos;
  const costo = res.usage.costUsd ?? 0;

  if (hallazgos.length) {
    await sb.from("findings").upsert(
      [
        {
          contract_id: c.id,
          pattern_code: "PLIEGO_SASTRE",
          severity: severityOf("PLIEGO_SASTRE"),
          points: pointsOf("PLIEGO_SASTRE"),
          confianza: "media",
          foco: focoOf("PLIEGO_SASTRE"),
          detail:
            `El pliego contiene ${hallazgos.length} requisito(s) que podrían restringir la ` +
            `competencia. ${hallazgos[0].hallazgo}`,
          evidence: {
            hallazgos,
            archivo: doc.nombre,
            paginas_analizadas: indices.map((i) => i + 1),
            modelo: llm.model,
            via_vision: false,
          },
          source: "llm",
        },
      ],
      { onConflict: "contract_id,pattern_code,source" },
    );
    lineas.push(`${hallazgos.length} requisito(s) restrictivo(s) encontrados, con cita y página.`);
  } else {
    lineas.push("No se encontraron requisitos que restrinjan la competencia en las páginas analizadas.");
  }

  await sb
    .from("documents")
    .update({ status: "analyzed", paginas: totalPages, tiene_texto: true })
    .eq("id", doc.id);

  const { data: prev } = await sb
    .from("deep_analyses")
    .select("cost_usd")
    .eq("id_contrato_ref", idContrato)
    .maybeSingle();

  await sb
    .from("deep_analyses")
    .update({
      status: "done",
      stage: "pliego",
      pliego: { hallazgos } as unknown as Record<string, unknown>,
      model: llm.model,
      cost_usd: Number(prev?.cost_usd ?? 0) + costo,
    })
    .eq("id_contrato_ref", idContrato);

  lineas.push(`Análisis terminado. Costo de esta corrida: $${costo.toFixed(4)} USD.`);
  await anotar(idContrato, lineas);
}
