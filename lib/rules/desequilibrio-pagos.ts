/**
 * DESEQUILIBRIO_PAGOS — 25 pts, pesa en contratos vigentes.
 *
 * El dinero sale más rápido que el avance del contrato: se ha desembolsado un
 * porcentaje del valor muy superior al porcentaje de tiempo transcurrido. Es el
 * patrón que señala plata en riesgo HOY, todavía recuperable.
 */
import { severityOf } from "./catalog";
import { daysBetween, formatCOP, formatPct, isNum } from "./format";
import { THRESHOLDS } from "./thresholds";
import type { ContractRow, Finding, Rule, RuleContext } from "./types";

const CODE = "DESEQUILIBRIO_PAGOS" as const;
const POINTS = 25;

export const desequilibrioPagos: Rule = {
  code: CODE,

  run(c: ContractRow, ctx: RuleContext): Finding | null {
    // Sin valor de contrato no hay denominador para el % pagado.
    if (!isNum(c.valor_contrato) || c.valor_contrato <= 0) return null;
    if (!isNum(c.valor_pagado) || c.valor_pagado < 0) return null;
    if (!c.fecha_inicio || !c.fecha_fin) return null;

    const duracionDias = daysBetween(c.fecha_inicio, c.fecha_fin);
    if (duracionDias === null || duracionDias <= 0) return null;

    const transcurridosDias = daysBetween(c.fecha_inicio, ctx.today);
    if (transcurridosDias === null) return null;

    // Aún no arranca: no hay avance contra el cual comparar.
    if (transcurridosDias < 0) return null;
    // Ya terminó: el desfase deja de ser "plata en riesgo" y pasa a ser materia
    // de las reglas de auditoría histórica.
    if (transcurridosDias >= duracionDias) return null;

    const pctTiempo = transcurridosDias / duracionDias;
    const pctPagado = c.valor_pagado / c.valor_contrato;
    const brechaPp = (pctPagado - pctTiempo) * 100;

    if (brechaPp < THRESHOLDS.DESEQUILIBRIO_PAGOS.brechaMinimaPp) return null;

    const pendiente = c.valor_contrato - c.valor_pagado;

    return {
      contract_id: c.id,
      pattern_code: CODE,
      severity: severityOf(CODE),
      points: POINTS,
      detail:
        `Ha transcurrido el ${formatPct(pctTiempo)} del plazo del contrato, ` +
        `pero ya se ha desembolsado el ${formatPct(pctPagado)} de su valor: ` +
        `${formatCOP(c.valor_pagado)} de ${formatCOP(c.valor_contrato)}. ` +
        `Es una diferencia de ${brechaPp.toFixed(1)} puntos porcentuales entre ` +
        `lo pagado y el avance esperado por tiempo. Quedan ${formatCOP(pendiente)} ` +
        `por desembolsar y ${duracionDias - transcurridosDias} días de plazo.`,
      evidence: {
        valor_contrato: c.valor_contrato,
        valor_pagado: c.valor_pagado,
        valor_pendiente: pendiente,
        pct_pagado: Number(pctPagado.toFixed(4)),
        pct_tiempo_transcurrido: Number(pctTiempo.toFixed(4)),
        brecha_puntos_porcentuales: Number(brechaPp.toFixed(2)),
        umbral_puntos_porcentuales: THRESHOLDS.DESEQUILIBRIO_PAGOS.brechaMinimaPp,
        fecha_inicio: c.fecha_inicio,
        fecha_fin: c.fecha_fin,
        dias_transcurridos: transcurridosDias,
        dias_totales: duracionDias,
        evaluado_el: ctx.today,
      },
      source: "rules",
    };
  },
};
