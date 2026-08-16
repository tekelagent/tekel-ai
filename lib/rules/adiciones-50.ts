/**
 * ADICIONES_50 — 40 pts, foco entidad. MODO APROXIMADO.
 * METODOLOGIA §3: Ley 80/1993 art. 40 parágrafo, adición máxima 50% del valor
 * inicial medido en SMMLV.
 *
 * ADVERTENCIA DE ALCANCE, declarada en cada hallazgo (`evidence.aproximacion`):
 *
 * La norma limita la adición en VALOR. El dataset de contratos de SECOP II
 * (jbjy-vk9h) no trae valor inicial ni valor adicionado —se verificó sobre la
 * columna `raw` del corpus ingestado: solo existe `dias_adicionados` y el valor
 * ya consolidado—. Así que esta regla mide la prórroga en TIEMPO como proxy,
 * que es lo que METODOLOGIA §3 autoriza explícitamente para este caso.
 *
 * Prorrogar el plazo NO es adicionar el valor: un contrato puede extenderse sin
 * un peso adicional. Por eso el hallazgo sale con confianza BAJA y declara la
 * aproximación, para que el auditor pida el otrosí y verifique el valor real.
 */
import { citaNormativa } from "../normativa/catalog";
import { makeFinding } from "./finding";
import { daysBetween, formatCOP, formatPct, isNum } from "./format";
import { THRESHOLDS } from "./thresholds";
import { esComputable } from "./types";
import type { ContractRow, Finding, Rule, RuleContext } from "./types";

const CODE = "ADICIONES_50" as const;

export const adiciones50: Rule = {
  code: CODE,

  run(c: ContractRow, ctx: RuleContext): Finding | null {
    if (!esComputable(c)) return null;

    const { fraccionMinima } = THRESHOLDS.ADICIONES_50;

    // ── v2: medición EXACTA cuando el proceso publica el valor adjudicado ──
    // Ahí sí se compara valor contra valor, que es lo que limita la norma.
    const proceso = c.proceso_de_compra ? ctx.procesos.get(c.proceso_de_compra) : undefined;
    const inicial =
      proceso && isNum(proceso.valor_adjudicacion) && proceso.valor_adjudicacion > 0
        ? proceso.valor_adjudicacion
        : null;

    if (inicial !== null && isNum(c.valor_contrato) && c.valor_contrato > inicial) {
      const adicion = c.valor_contrato - inicial;
      const fraccion = adicion / inicial;
      if (fraccion >= fraccionMinima) {
        return makeFinding({
          contract: c,
          code: CODE,
          // Valor contra valor: es la magnitud que la norma limita.
          confianza: "alta",
          detail:
            `El contrato se adjudicó por ${formatCOP(inicial)} y hoy figura por ` +
            `${formatCOP(c.valor_contrato)}: una adición de ${formatCOP(adicion)}, el ` +
            `${formatPct(fraccion)} del valor inicial. La ley limita la adición al 50% ` +
            `de ese valor inicial. Criterio: ${citaNormativa(CODE)}.`,
          evidence: {
            aproximacion: false,
            magnitud_medida: "valor",
            valor_adjudicado_inicial: inicial,
            valor_contrato_actual: c.valor_contrato,
            valor_adicionado: adicion,
            fraccion_adicion: Number(fraccion.toFixed(4)),
            fraccion_minima_exigida: fraccionMinima,
            // La norma mide en SMMLV; en pesos corrientes es una aproximación
            // aceptable en contratos de corta duración (METODOLOGIA §3).
            comparacion_en_pesos_corrientes: true,
            proceso_de_compra: c.proceso_de_compra,
            fuente: "SECOP II — Procesos de Contratación (p6dx-8zbt)",
          },
        });
      }
      // Con valor inicial conocido y adición por debajo del 50%, no hay
      // hallazgo: la medición exacta manda sobre el proxy de tiempo.
      return null;
    }

    // ── v1: sin valor inicial publicado, proxy por prórroga en tiempo ──
    if (!isNum(c.dias_adicionados) || c.dias_adicionados <= 0) return null;
    if (!c.fecha_inicio || !c.fecha_fin) return null;

    const duracionTotal = daysBetween(c.fecha_inicio, c.fecha_fin);
    if (duracionTotal === null || duracionTotal <= 0) return null;

    // fecha_fin ya incluye la prórroga, así que el plazo original es la
    // diferencia menos los días adicionados.
    const duracionOriginal = duracionTotal - c.dias_adicionados;
    if (duracionOriginal <= 0) return null;

    const fraccion = c.dias_adicionados / duracionOriginal;
    if (fraccion < fraccionMinima) return null;

    return makeFinding({
      contract: c,
      code: CODE,
      // Mide tiempo, no valor: es un proxy, y se dice.
      confianza: "baja",
      detail:
        `El plazo del contrato se amplió en ${c.dias_adicionados} días sobre un plazo ` +
        `original de ${duracionOriginal} días: un ${formatPct(fraccion)} más de tiempo` +
        (isNum(c.valor_contrato) ? `, sobre un valor de ${formatCOP(c.valor_contrato)}` : "") +
        `. IMPORTANTE: SECOP no publica el valor inicial ni el valor adicionado en este ` +
        `dataset, así que esta señal mide la prórroga en TIEMPO, no la adición en VALOR ` +
        `que limita la norma. Prorrogar el plazo no implica haber adicionado dinero. ` +
        `Para verificar hay que pedir el otrosí y comparar el valor inicial contra el ` +
        `adicionado. Criterio: ${citaNormativa(CODE)}.`,
      evidence: {
        // Bandera que la UI y el expediente deben respetar.
        aproximacion: true,
        aproximacion_motivo:
          "El dataset SECOP II jbjy-vk9h no publica valor inicial ni valor adicionado; " +
          "se usa la prórroga en días como proxy de la adición.",
        magnitud_medida: "tiempo",
        magnitud_de_la_norma: "valor (SMMLV)",
        dias_adicionados: c.dias_adicionados,
        duracion_original_dias: duracionOriginal,
        duracion_total_dias: duracionTotal,
        fraccion_prorroga: Number(fraccion.toFixed(4)),
        fraccion_minima_exigida: fraccionMinima,
        valor_contrato: c.valor_contrato,
        fecha_inicio: c.fecha_inicio,
        fecha_fin: c.fecha_fin,
        dataset_con_valor_real: "SECOP II - Adiciones (cb9c-h8sn), no ingestado aún",
      },
    });
  },
};
