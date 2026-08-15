/**
 * DESEQUILIBRIO_PAGOS — 25 pts, foco entidad (supervisión).
 * METODOLOGIA §3: Ley 1474/2011 arts. 83-84, deberes de supervisión.
 *
 * El dinero sale más rápido que el avance del contrato. Es el patrón que señala
 * plata en riesgo HOY, todavía recuperable.
 *
 * Condiciones de exclusión (METODOLOGIA §3): requiere fecha_inicio, fecha_fin y
 * valor_pagado no nulos; plazo total > 60 días; valor > piso de materialidad.
 * Dispara si %pagado − %tiempo ≥ 25 pp.
 */
import { citaNormativa } from "../normativa/catalog";
import { makeFinding } from "./finding";
import { daysBetween, formatCOP, formatPct, isNum } from "./format";
import { THRESHOLDS } from "./thresholds";
import type { ContractRow, Finding, Rule, RuleContext } from "./types";
import { esComputable } from "./types";

const CODE = "DESEQUILIBRIO_PAGOS" as const;

export const desequilibrioPagos: Rule = {
  code: CODE,

  run(c: ContractRow, ctx: RuleContext): Finding | null {
    if (!esComputable(c)) return null;

    const { brechaMinimaPp, plazoMinimoDias } = THRESHOLDS.DESEQUILIBRIO_PAGOS;

    // Los tres campos son obligatorios: sin ellos la regla se abstiene en vez
    // de suponer (METODOLOGIA §6.1).
    if (!c.fecha_inicio || !c.fecha_fin) return null;
    if (!isNum(c.valor_pagado) || c.valor_pagado < 0) return null;
    if (!isNum(c.valor_contrato) || c.valor_contrato <= 0) return null;

    // Materialidad: no inundar a los equipos con contratos pequeños.
    if (c.valor_contrato < ctx.pisoMaterialidad) return null;

    const duracionDias = daysBetween(c.fecha_inicio, c.fecha_fin);
    if (duracionDias === null || duracionDias <= plazoMinimoDias) return null;

    const transcurridosDias = daysBetween(c.fecha_inicio, ctx.today);
    if (transcurridosDias === null) return null;
    // Aún no arranca: no hay avance contra el cual comparar.
    if (transcurridosDias < 0) return null;
    // Ya terminó: el desfase deja de ser plata en riesgo.
    if (transcurridosDias >= duracionDias) return null;

    const pctTiempo = transcurridosDias / duracionDias;
    const pctPagado = c.valor_pagado / c.valor_contrato;
    // Se redondea ANTES de comparar: en coma flotante 0.35 - 0.10 da
    // 24.999999999999996, que dejaría fuera el borde exacto del umbral.
    const brechaPp = Number(((pctPagado - pctTiempo) * 100).toFixed(4));
    if (brechaPp < brechaMinimaPp) return null;

    const pendiente = c.valor_contrato - c.valor_pagado;

    return makeFinding({
      contract: c,
      code: CODE,
      // Los tres campos requeridos están presentes por construcción.
      confianza: "alta",
      detail:
        `Ha transcurrido el ${formatPct(pctTiempo)} del plazo del contrato, pero ya ` +
        `se ha desembolsado el ${formatPct(pctPagado)} de su valor: ` +
        `${formatCOP(c.valor_pagado)} de ${formatCOP(c.valor_contrato)}. Son ` +
        `${brechaPp.toFixed(1)} puntos porcentuales de diferencia entre lo pagado y ` +
        `el avance esperado por tiempo. Quedan ${formatCOP(pendiente)} por desembolsar ` +
        `y ${duracionDias - transcurridosDias} días de plazo. ` +
        `Criterio: ${citaNormativa(CODE)}.`,
      evidence: {
        valor_contrato: c.valor_contrato,
        valor_pagado: c.valor_pagado,
        valor_pendiente: pendiente,
        pct_pagado: Number(pctPagado.toFixed(4)),
        pct_tiempo_transcurrido: Number(pctTiempo.toFixed(4)),
        brecha_puntos_porcentuales: Number(brechaPp.toFixed(2)),
        umbral_puntos_porcentuales: brechaMinimaPp,
        fecha_inicio: c.fecha_inicio,
        fecha_fin: c.fecha_fin,
        dias_transcurridos: transcurridosDias,
        dias_totales: duracionDias,
        plazo_minimo_dias: plazoMinimoDias,
        piso_materialidad: ctx.pisoMaterialidad,
        evaluado_el: ctx.today,
      },
    });
  },
};
