/**
 * VALOR_ATIPICO — 25 pts, foco ambos.
 * METODOLOGIA §3: Ley 80 arts. 25-26, economía y planeación.
 *
 * El valor del contrato queda fuera del rango de sus comparables: mismo tipo de
 * contrato, mismo departamento.
 *
 * Condiciones de exclusión (METODOLOGIA §3): requiere ≥30 comparables; dispara
 * solo si valor > percentil 95 Y ≥ 2× mediana del grupo. Sin comparables
 * suficientes, se abstiene — no baja el listón, se calla.
 *
 * El pool de comparables excluye los contratos con `valor_verificar` y los de
 * valor ≤ 0 (METODOLOGIA §6.8): un valor imposible dentro del grupo desplazaría
 * el percentil y haría que contratos normales parecieran baratos.
 */
import { citaNormativa } from "../normativa/catalog";
import { makeFinding } from "./finding";
import { formatCOP, isNum } from "./format";
import { THRESHOLDS } from "./thresholds";
import { comparablesKey, esComputable } from "./types";
import type { ContractRow, Finding, Rule, RuleContext } from "./types";

const CODE = "VALOR_ATIPICO" as const;

export const valorAtipico: Rule = {
  code: CODE,

  run(c: ContractRow, ctx: RuleContext): Finding | null {
    if (!esComputable(c)) return null;

    const { minComparables, percentil, vecesMediana } = THRESHOLDS.VALOR_ATIPICO;

    if (!isNum(c.valor_contrato) || c.valor_contrato <= 0) return null;

    const clave = comparablesKey(c);
    if (!clave) return null;

    const grupo = ctx.comparables.get(clave);
    // Abstención sobre invención: sin masa crítica de comparables no hay
    // rango contra el cual comparar.
    if (!grupo || grupo.n < minComparables) return null;
    if (grupo.mediana <= 0) return null;

    const superaPercentil = c.valor_contrato > grupo.p95;
    const ratio = c.valor_contrato / grupo.mediana;
    const superaMediana = ratio >= vecesMediana;
    // METODOLOGIA exige AMBAS condiciones, no cualquiera de las dos.
    if (!superaPercentil || !superaMediana) return null;

    return makeFinding({
      contract: c,
      code: CODE,
      // La completitud aquí es el tamaño del grupo de comparables.
      confianza: grupo.n >= 100 ? "alta" : "media",
      detail:
        `El contrato vale ${formatCOP(c.valor_contrato)}, mientras que la mediana de ` +
        `los ${grupo.n} contratos comparables —mismo tipo (${c.tipo_de_contrato}) y ` +
        `mismo departamento— es ${formatCOP(grupo.mediana)}. Es ${ratio.toFixed(1)} ` +
        `veces la mediana y supera el percentil ${percentil} del grupo ` +
        `(${formatCOP(grupo.p95)}). Un valor atípico puede responder a un alcance ` +
        `mayor o a condiciones particulares; se señala para que la estimación del ` +
        `valor quede documentada. Criterio: ${citaNormativa(CODE)}.`,
      evidence: {
        valor_contrato: c.valor_contrato,
        comparables_n: grupo.n,
        comparables_minimo_exigido: minComparables,
        mediana_grupo: grupo.mediana,
        percentil_95_grupo: grupo.p95,
        ratio_sobre_mediana: Number(ratio.toFixed(2)),
        ratio_minimo_exigido: vecesMediana,
        grupo_comparables: clave,
        tipo_de_contrato: c.tipo_de_contrato,
        departamento: c.departamento,
      },
    });
  },
};
