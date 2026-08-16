/**
 * LICITANTE_UNICO — 25 pts, foco entidad.
 * METODOLOGIA §3: Ley 80 art. 24, principio de libre concurrencia.
 *
 * Un proceso competitivo que recibió una sola oferta no realizó la competencia
 * que su modalidad exige. Puede ser falta de interés del mercado o un pliego
 * que dejó fuera a los demás; en cualquier caso, la entidad debe poder
 * explicarlo.
 *
 * Se abstiene en contratación directa y mínima cuantía: ahí la ley NO exige
 * pluralidad de oferentes, así que un solo proponente es lo normal y señalarlo
 * sería ruido.
 */
import { citaNormativa } from "../normativa/catalog";
import { makeFinding } from "./finding";
import { formatCOP, isNum } from "./format";
import { esComputable } from "./types";
import type { ContractRow, Finding, Rule, RuleContext } from "./types";

const CODE = "LICITANTE_UNICO" as const;

/** Modalidades donde la ley no exige pluralidad: la regla no opina. */
const SIN_EXIGENCIA_DE_PLURALIDAD = /directa|m[ií]nima cuant[ií]a|r[eé]gimen especial|interadministrativ/i;

export const licitanteUnico: Rule = {
  code: CODE,

  run(c: ContractRow, ctx: RuleContext): Finding | null {
    if (!esComputable(c)) return null;
    if (!c.proceso_de_compra) return null;

    const p = ctx.procesos.get(c.proceso_de_compra);
    if (!p) return null;
    if (!p.modalidad) return null;
    if (SIN_EXIGENCIA_DE_PLURALIDAD.test(p.modalidad)) return null;

    // Una sola respuesta al procedimiento. Cero respuestas no es este patrón:
    // un proceso desierto no adjudicó nada.
    const respuestas = isNum(p.respuestas) ? p.respuestas : null;
    const unicos = isNum(p.proveedores_unicos) ? p.proveedores_unicos : null;
    const oferentes = unicos ?? respuestas;
    if (oferentes === null || oferentes !== 1) return null;

    return makeFinding({
      contract: c,
      code: CODE,
      // Dato estructurado publicado por la propia entidad en SECOP.
      confianza: "alta",
      detail:
        `El proceso se tramitó por ${p.modalidad}, una modalidad que exige competencia, ` +
        `pero recibió una sola oferta` +
        (isNum(p.proveedores_invitados) && p.proveedores_invitados > 0
          ? ` pese a que se invitó a ${p.proveedores_invitados} proveedores`
          : "") +
        `. El contrato se adjudicó por ${formatCOP(c.valor_contrato ?? 0)}. ` +
        `Un único proponente puede reflejar falta de interés del mercado o requisitos ` +
        `que dejaron fuera a los demás; la entidad debe poder explicar cuál fue. ` +
        `Criterio: ${citaNormativa(CODE)}.`,
      evidence: {
        modalidad: p.modalidad,
        respuestas_al_procedimiento: p.respuestas,
        proveedores_unicos: p.proveedores_unicos,
        proveedores_invitados: p.proveedores_invitados,
        precio_base: p.precio_base,
        valor_contrato: c.valor_contrato,
        proceso_de_compra: c.proceso_de_compra,
        fuente: "SECOP II — Procesos de Contratación (p6dx-8zbt)",
        modalidades_excluidas: "contratación directa, mínima cuantía, régimen especial, interadministrativo",
      },
    });
  },
};
