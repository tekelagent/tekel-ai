/**
 * EJECUCION_ANOMALA — 25 pts, foco entidad.
 * METODOLOGIA §3: Ley 80 art. 60 / Ley 1150 art. 11, deber de liquidación.
 *
 * Aplica a contratos históricos. Tres condiciones alternativas (METODOLOGIA §3):
 *
 *   (a) terminado hace más de 6 meses y sin liquidar
 *   (b) valor_pendiente_ejecucion > 20% del valor, estando terminado
 *   (c) el estado indica terminación anormal o cesión
 *
 * `evidence.condicion` deja registrado cuál disparó.
 *
 * La condición (a) depende de que el campo de liquidación sea fiable en el
 * corpus. Verificado sobre los 20.000 contratos de Atlántico: `liquidaci_n`
 * viene poblado al 100% con dos valores limpios (Si/No), así que se usa.
 */
import { citaNormativa } from "../normativa/catalog";
import { makeFinding } from "./finding";
import { daysBetween, formatCOP, formatPct, isNum } from "./format";
import { THRESHOLDS } from "./thresholds";
import { esComputable } from "./types";
import type { Confianza, ContractRow, Finding, Rule, RuleContext } from "./types";

const CODE = "EJECUCION_ANOMALA" as const;

/** Lee la bandera de liquidación de la fila cruda; no está mapeada a columna. */
function liquidado(c: ContractRow): boolean | null {
  const v = c.raw?.["liquidaci_n"];
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "si" || s === "sí") return true;
  if (s === "no") return false;
  return null;
}

export const ejecucionAnomala: Rule = {
  code: CODE,

  run(c: ContractRow, ctx: RuleContext): Finding | null {
    if (!esComputable(c)) return null;
    // Es un patrón de auditoría histórica: mira lo que ya terminó.
    if (c.vigencia !== "historico") return null;

    const { mesesSinLiquidar, fraccionPendienteMinima, estadosAnormales } =
      THRESHOLDS.EJECUCION_ANOMALA;

    const estado = (c.estado_contrato ?? "").trim().toLowerCase();
    const diasDesdeFin = daysBetween(c.fecha_fin, ctx.today);

    let condicion: "a" | "b" | "c" | null = null;
    let confianza: Confianza = "media";
    let detalle = "";
    const evidence: Record<string, unknown> = {
      estado_contrato: c.estado_contrato,
      fecha_fin: c.fecha_fin,
      valor_contrato: c.valor_contrato,
      evaluado_el: ctx.today,
    };

    // (c) primero: un estado explícito es la señal más fuerte y no depende de
    // ningún cálculo.
    if ((estadosAnormales as readonly string[]).includes(estado)) {
      condicion = "c";
      confianza = "alta";
      detalle =
        `El contrato figura en SECOP con estado "${c.estado_contrato}", que indica ` +
        `que no terminó de la forma prevista.`;
      evidence.estados_anormales_considerados = estadosAnormales;
    } else if (
      isNum(c.valor_pendiente_ejecucion) &&
      isNum(c.valor_contrato) &&
      c.valor_contrato > 0 &&
      c.valor_pendiente_ejecucion / c.valor_contrato > fraccionPendienteMinima
    ) {
      // (b) quedó ejecución sin completar en un contrato ya terminado.
      condicion = "b";
      confianza = "media";
      const frac = c.valor_pendiente_ejecucion / c.valor_contrato;
      detalle =
        `El contrato terminó con ${formatCOP(c.valor_pendiente_ejecucion)} ` +
        `pendientes de ejecución, el ${formatPct(frac)} de su valor de ` +
        `${formatCOP(c.valor_contrato)}.`;
      evidence.valor_pendiente_ejecucion = c.valor_pendiente_ejecucion;
      evidence.fraccion_pendiente = Number(frac.toFixed(4));
      evidence.fraccion_minima_exigida = fraccionPendienteMinima;
    } else {
      // (a) terminado hace más de 6 meses y sin liquidar.
      const liq = liquidado(c);
      const diasUmbral = mesesSinLiquidar * 30;
      if (liq === false && diasDesdeFin !== null && diasDesdeFin > diasUmbral) {
        condicion = "a";
        confianza = "alta";
        const meses = Math.floor(diasDesdeFin / 30);
        detalle =
          `El contrato terminó hace ${meses} meses (${c.fecha_fin}) y SECOP lo ` +
          `reporta sin liquidar. La liquidación es el acto en el que la entidad ` +
          `cierra cuentas y deja constancia de lo efectivamente recibido.`;
        evidence.liquidado = false;
        evidence.dias_desde_fin = diasDesdeFin;
        evidence.dias_umbral = diasUmbral;
        evidence.meses_umbral = mesesSinLiquidar;
      }
    }

    if (!condicion) return null;

    evidence.condicion = condicion;

    return makeFinding({
      contract: c,
      code: CODE,
      confianza,
      detail: `${detalle} Criterio: ${citaNormativa(CODE)}.`,
      evidence,
    });
  },
};
