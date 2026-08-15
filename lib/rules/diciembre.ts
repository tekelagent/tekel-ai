/**
 * DICIEMBRE — 10 pts, foco entidad. SOLO AGRAVANTE.
 * METODOLOGIA §3: Ley 80 arts. 25-26, principios de economía y planeación.
 *
 * Contrato firmado en diciembre: indicio de "quema de presupuesto", ejecutar
 * recursos antes del cierre de la vigencia fiscal con la planeación y la
 * competencia comprimidas por la fecha.
 *
 * METODOLOGIA §3 lo marca explícitamente como agravante puro: NUNCA dispara
 * prioridad por sí solo. Firmar en diciembre no es infracción, y un motor que
 * priorizara por esto solo llenaría la bandeja de ruido.
 */
import { citaNormativa } from "../normativa/catalog";
import { makeFinding } from "./finding";
import { formatCOP, isNum, monthOf } from "./format";
import { esComputable } from "./types";
import type { ContractRow, Finding, Rule, RuleContext } from "./types";

const CODE = "DICIEMBRE" as const;

export const diciembre: Rule = {
  code: CODE,

  run(c: ContractRow, _ctx: RuleContext): Finding | null {
    if (!esComputable(c)) return null;

    const mes = monthOf(c.fecha_firma);
    if (mes !== 12) return null;

    const valor = isNum(c.valor_contrato) ? c.valor_contrato : null;

    return makeFinding({
      contract: c,
      code: CODE,
      // La fecha de firma viene siempre que exista; no hay grados aquí.
      confianza: "alta",
      detail:
        `El contrato se firmó en diciembre (${c.fecha_firma})` +
        (valor !== null ? `, por ${formatCOP(valor)}` : "") +
        `. Firmar al cierre de la vigencia fiscal es legal y a veces inevitable, pero ` +
        `concentra riesgo: el presupuesto debe ejecutarse antes del 31 de diciembre, ` +
        `lo que comprime los tiempos de planeación y de convocatoria. Por sí sola esta ` +
        `señal no prioriza el contrato; solo agrava cuando hay otras. ` +
        `Criterio: ${citaNormativa(CODE)}.`,
      evidence: {
        fecha_firma: c.fecha_firma,
        mes: 12,
        valor_contrato: valor,
        modalidad: c.modalidad,
        solo_agravante: true,
      },
    });
  },
};
