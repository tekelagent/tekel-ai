/**
 * DICIEMBRE — 10 pts, pesa en contratos históricos.
 *
 * Contrato firmado en diciembre. Señala el patrón de "quema de presupuesto":
 * ejecutar recursos antes del cierre de la vigencia fiscal, con la planeación y
 * la competencia comprimidas por la fecha.
 */
import { severityOf } from "./catalog";
import { formatCOP, isNum, monthOf } from "./format";
import type { ContractRow, Finding, Rule, RuleContext } from "./types";

const CODE = "DICIEMBRE" as const;
const POINTS = 10;

export const diciembre: Rule = {
  code: CODE,

  run(c: ContractRow, _ctx: RuleContext): Finding | null {
    const mes = monthOf(c.fecha_firma);
    if (mes !== 12) return null;

    const valor = isNum(c.valor_contrato) ? c.valor_contrato : null;

    return {
      contract_id: c.id,
      pattern_code: CODE,
      severity: severityOf(CODE),
      points: POINTS,
      detail:
        `El contrato se firmó en diciembre (${c.fecha_firma})` +
        (valor !== null ? `, por ${formatCOP(valor)}` : "") +
        `. Firmar al cierre de la vigencia fiscal es legal y a veces inevitable, ` +
        `pero concentra riesgo: el presupuesto debe ejecutarse antes del 31 de ` +
        `diciembre, lo que comprime los tiempos de planeación y de convocatoria.`,
      evidence: {
        fecha_firma: c.fecha_firma,
        mes: 12,
        valor_contrato: valor,
        modalidad: c.modalidad,
      },
      source: "rules",
    };
  },
};
