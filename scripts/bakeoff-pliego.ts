#!/usr/bin/env tsx
/**
 * D2 / S6 — bake-off del modelo profundo sobre un pliego real.
 *
 * Manda el mismo prompt de pliego-sastre a dos modelos y compara sus citas.
 * El criterio de victoria no es la elocuencia: es que la CITA TEXTUAL exista
 * literalmente en el documento y que la PÁGINA sea la correcta. Un hallazgo
 * con cita inventada es peor que no tener hallazgo.
 *
 * Uso:
 *   infisical run --env=dev -- pnpm bakeoff-pliego
 *   infisical run --env=dev -- pnpm bakeoff-pliego --pdf data/pliegos/x.pdf --paginas 8
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import { extractText, getDocumentProxy } from "unpdf";
import { OpenRouterProvider, LLMValidationError } from "../lib/providers/llm";

const { values: args } = parseArgs({
  options: {
    pdf: { type: "string", default: "data/pliegos/bakeoff-70458197.pdf" },
    paginas: { type: "string", default: "8" },
    modelos: { type: "string", multiple: true },
  },
});

const MODELOS = args.modelos?.length
  ? args.modelos
  : ["qwen/qwen3.7-plus", "qwen/qwen3.8-max"];
const MAX_PAGS = Number(args.paginas) || 8;

/** Salida estructurada del análisis de pliego (METODOLOGIA §5). */
const PliegoSchema = z.object({
  hallazgos: z.array(
    z.object({
      hallazgo: z.string().min(10),
      cita_textual: z.string().min(10),
      pagina: z.coerce.number().int().positive(),
      patron: z.string(),
    }),
  ),
});

const SYSTEM = `Eres un auditor de contratación pública colombiana analizando un pliego de condiciones.

Buscas PLIEGO_SASTRE: requisitos que restringen la libre concurrencia sin justificación
técnica — condiciones que solo un proponente concreto podría cumplir. Ejemplos: exigir
una marca específica, experiencia en un municipio concreto, certificaciones que solo
tiene un oferente, plazos imposibles para quien no venía preparado.

REGLAS ESTRICTAS:
1. La "cita_textual" debe ser una transcripción LITERAL del pliego, copiada carácter por
   carácter. Si no puedes copiarla literalmente, NO reportes ese hallazgo.
2. La "pagina" debe ser el número de página donde aparece esa cita.
3. Si el fragmento no contiene requisitos restrictivos, devuelve la lista vacía. Un
   pliego normal es un resultado válido y útil.
4. No inventes. No infieras. No cites normas.

Responde ÚNICAMENTE con JSON:
{"hallazgos":[{"hallazgo":"...","cita_textual":"...","pagina":1,"patron":"PLIEGO_SASTRE"}]}`;

/** Verifica que la cita exista de verdad en el texto, tolerando espacios. */
function citaVerificable(cita: string, texto: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
  const c = norm(cita);
  if (c.length < 15) return false;
  const t = norm(texto);
  if (t.includes(c)) return true;
  // Tolerancia: si el 80% de una ventana larga de la cita aparece, cuenta.
  const trozo = c.slice(0, Math.min(80, c.length));
  return t.includes(trozo);
}

async function main() {
  console.log(`Bake-off de modelo profundo\n${"═".repeat(74)}`);
  console.log(`PDF: ${args.pdf}`);

  const buf = new Uint8Array(readFileSync(args.pdf));
  const doc = await getDocumentProxy(buf);
  const { totalPages, text } = await extractText(doc, { mergePages: false });
  const paginas = text as string[];

  const conTexto = paginas.filter((p) => (p ?? "").trim().length > 50).length;
  console.log(`Páginas: ${totalPages} · con capa de texto: ${conTexto}`);
  if (conTexto === 0) {
    console.log("\nEl PDF no tiene capa de texto: haría falta la vía de visión.");
    return;
  }

  // Se eligen las páginas más densas: donde vive la ficha técnica, no la portada.
  const indices = paginas
    .map((p, i) => ({ i, len: (p ?? "").length }))
    .sort((a, b) => b.len - a.len)
    .slice(0, MAX_PAGS)
    .map((x) => x.i)
    .sort((a, b) => a - b);

  const fragmento = indices
    .map((i) => `--- PÁGINA ${i + 1} ---\n${paginas[i]}`)
    .join("\n\n");

  console.log(`Páginas enviadas: ${indices.map((i) => i + 1).join(", ")}`);
  console.log(`Caracteres: ${fragmento.length}\n${"═".repeat(74)}`);

  const resultados: Array<Record<string, unknown>> = [];

  for (const modelo of MODELOS) {
    console.log(`\n▸ ${modelo}`);
    const llm = new OpenRouterProvider({ model: modelo });
    const t0 = Date.now();
    try {
      const res = await llm.structured({
        system: SYSTEM,
        user: `Analiza este fragmento del pliego:\n\n${fragmento}`,
        schema: PliegoSchema,
        schemaName: "PliegoSchema",
        maxTokens: 2000,
      });
      const ms = Date.now() - t0;
      const hallazgos = res.data.hallazgos;
      const verificados = hallazgos.filter((h) => citaVerificable(h.cita_textual, fragmento));
      const paginasOk = hallazgos.filter((h) => indices.includes(h.pagina - 1));

      console.log(`  ${ms} ms · $${(res.usage.costUsd ?? 0).toFixed(6)}${res.retried ? " · con reintento" : ""}`);
      console.log(`  hallazgos: ${hallazgos.length}`);
      console.log(`  citas verificables en el texto: ${verificados.length}/${hallazgos.length}`);
      console.log(`  páginas dentro del fragmento enviado: ${paginasOk.length}/${hallazgos.length}`);

      for (const h of hallazgos.slice(0, 3)) {
        const ok = citaVerificable(h.cita_textual, fragmento);
        console.log(`\n    [${ok ? "CITA OK" : "CITA NO VERIFICABLE"}] pág. ${h.pagina}`);
        console.log(`    ${h.hallazgo.slice(0, 180)}`);
        console.log(`    « ${h.cita_textual.slice(0, 200)} »`);
      }

      resultados.push({
        modelo,
        ms,
        costo: res.usage.costUsd ?? 0,
        hallazgos: hallazgos.length,
        citasOk: verificados.length,
        paginasOk: paginasOk.length,
      });
    } catch (err) {
      const msg = err instanceof LLMValidationError ? err.message : (err as Error).message;
      console.log(`  FALLA: ${msg.slice(0, 250)}`);
      resultados.push({ modelo, error: msg.slice(0, 120) });
    }
  }

  console.log(`\n${"═".repeat(74)}\nRESUMEN`);
  for (const r of resultados) {
    if (r.error) {
      console.log(`  ${String(r.modelo).padEnd(22)} FALLA: ${r.error}`);
      continue;
    }
    console.log(
      `  ${String(r.modelo).padEnd(22)} ${String(r.hallazgos).padStart(2)} hallazgos · ` +
        `${r.citasOk}/${r.hallazgos} citas verificables · ${r.ms} ms · $${Number(r.costo).toFixed(6)}`,
    );
  }
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
