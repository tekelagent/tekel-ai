/**
 * PAGO_ADELANTADO_RIESGO — 10 pts, pesa en contratos vigentes.
 *
 * El contrato habilita pago por anticipado: hay desembolso antes de que exista
 * contraprestación.
 *
 * CLAUDE.md indica que el peso sube a 30 si además el proveedor es reciente.
 * Esa condición depende de PROVEEDOR_RECIENTE, que es un hallazgo de Croma
 * (Capa C) y no está disponible aquí. La Capa A emite siempre los 10 puntos
 * base; el ascenso a 30 corresponde implementarlo cuando la Capa C corra.
 */
import { severityOf } from "./catalog";
import { formatCOP, formatPct, isNum } from "./format";
import type { ContractRow, Finding, Rule, RuleContext } from "./types";

const CODE = "PAGO_ADELANTADO_RIESGO" as const;
const POINTS = 10;

export const pagoAdelantadoRiesgo: Rule = {
  code: CODE,

  run(c: ContractRow, _ctx: RuleContext): Finding | null {
    // El dataset trae "No Definido" en muchas filas, que el mapeo convierte en
    // null. Solo un true explícito dispara la regla: un desconocido no es un sí.
    if (c.pago_adelantado !== true) return null;

    const anticipo = isNum(c.valor_pago_adelantado) ? c.valor_pago_adelantado : null;
    const valor = isNum(c.valor_contrato) && c.valor_contrato > 0 ? c.valor_contrato : null;
    const pctAnticipo = anticipo !== null && valor !== null ? anticipo / valor : null;

    const detalleMonto =
      anticipo !== null && valor !== null
        ? `El anticipo registrado es de ${formatCOP(anticipo)} sobre un contrato de ` +
          `${formatCOP(valor)}, es decir el ${formatPct(pctAnticipo!)} del valor.`
        : anticipo !== null
          ? `El anticipo registrado es de ${formatCOP(anticipo)}.`
          : `El dataset no registra el monto del anticipo.`;

    return {
      contract_id: c.id,
      pattern_code: CODE,
      severity: severityOf(CODE),
      points: POINTS,
      detail:
        `El contrato habilita pago adelantado, es decir que se entrega dinero ` +
        `antes de recibir el bien o servicio. ${detalleMonto} El anticipo es una ` +
        `figura legal y frecuente; se señala aquí porque concentra riesgo cuando ` +
        `se combina con otros indicadores del mismo contrato.`,
      evidence: {
        pago_adelantado: true,
        valor_pago_adelantado: anticipo,
        valor_contrato: valor,
        pct_anticipo: pctAnticipo === null ? null : Number(pctAnticipo.toFixed(4)),
        // Deja explícito por qué no se aplicaron los 30 puntos de CLAUDE.md.
        ascenso_a_30_pendiente_de: "PROVEEDOR_RECIENTE (Capa C / Croma)",
      },
      source: "rules",
    };
  },
};
