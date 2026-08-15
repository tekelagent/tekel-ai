/**
 * PAGO_ADELANTADO_RIESGO — 10 pts, foco entidad. SOLO AGRAVANTE.
 * METODOLOGIA §3: Ley 1474/2011 art. 91, manejo de anticipos.
 *
 * El contrato habilita pago por anticipado: sale dinero antes de que exista
 * contraprestación.
 *
 * METODOLOGIA §3 indica que el peso sube a 30 si además el proveedor es
 * reciente. Esa condición depende de PROVEEDOR_RECIENTE, que es un hallazgo de
 * Croma (Capa C) y no está disponible aquí. La Capa A emite los 10 puntos base;
 * el ascenso a 30 corresponde a la Capa C cuando corra.
 *
 * METODOLOGIA §3 también marca este patrón como agravante puro: nunca eleva
 * prioridad por sí solo (ver `soloAgravante` en el catálogo y `priority.ts`).
 */
import { citaNormativa } from "../normativa/catalog";
import { makeFinding } from "./finding";
import { formatCOP, formatPct, isNum } from "./format";
import { esComputable } from "./types";
import type { ContractRow, Finding, Rule, RuleContext } from "./types";

const CODE = "PAGO_ADELANTADO_RIESGO" as const;

export const pagoAdelantadoRiesgo: Rule = {
  code: CODE,

  run(c: ContractRow, _ctx: RuleContext): Finding | null {
    if (!esComputable(c)) return null;

    // El dataset trae "No Definido" en muchas filas, que el mapeo convierte en
    // null. Solo un true explícito dispara: un desconocido no es un sí.
    if (c.pago_adelantado !== true) return null;

    const anticipo = isNum(c.valor_pago_adelantado) ? c.valor_pago_adelantado : null;
    const valor = isNum(c.valor_contrato) && c.valor_contrato > 0 ? c.valor_contrato : null;
    const pctAnticipo = anticipo !== null && valor !== null ? anticipo / valor : null;

    const detalleMonto =
      pctAnticipo !== null
        ? `El anticipo registrado es de ${formatCOP(anticipo!)} sobre un contrato de ` +
          `${formatCOP(valor!)}, el ${formatPct(pctAnticipo)} del valor.`
        : anticipo !== null
          ? `El anticipo registrado es de ${formatCOP(anticipo)}.`
          : `El dataset no registra el monto del anticipo.`;

    return makeFinding({
      contract: c,
      code: CODE,
      // La completitud depende de que el monto del anticipo esté publicado.
      confianza: pctAnticipo !== null ? "alta" : "media",
      detail:
        `El contrato habilita pago adelantado, es decir que se entrega dinero antes ` +
        `de recibir el bien o servicio. ${detalleMonto} El anticipo es una figura ` +
        `legal y frecuente; se señala porque concentra riesgo cuando coincide con ` +
        `otros indicadores del mismo contrato, y porque la norma exige que esos ` +
        `recursos se administren de forma separada. Criterio: ${citaNormativa(CODE)}.`,
      evidence: {
        pago_adelantado: true,
        valor_pago_adelantado: anticipo,
        valor_contrato: valor,
        pct_anticipo: pctAnticipo === null ? null : Number(pctAnticipo.toFixed(4)),
        solo_agravante: true,
        ascenso_a_30_pendiente_de: "PROVEEDOR_RECIENTE (Capa C / Croma)",
      },
    });
  },
};
