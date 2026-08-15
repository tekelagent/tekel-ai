/**
 * FRACCIONAMIENTO — 30 pts, pesa en ambos modos.
 *
 * Un mismo proveedor firma con una misma entidad varios contratos pequeños, del
 * mismo objeto, muy juntos en el tiempo. Partir una compra grande en varias
 * pequeñas permite esquivar la modalidad de selección que le correspondería y
 * la competencia que esa modalidad exige.
 *
 * Necesita mirar otros contratos, así que recibe el agrupamiento ya calculado
 * en `ctx`: la regla sigue siendo pura y no toca la base de datos.
 */
import { severityOf } from "./catalog";
import { daysBetween, formatCOP, isNum, normalizeObjeto } from "./format";
import { THRESHOLDS } from "./thresholds";
import { entitySupplierKey } from "./types";
import type { ContractRow, Finding, Rule, RuleContext } from "./types";

const CODE = "FRACCIONAMIENTO" as const;
const POINTS = 30;

export const fraccionamiento: Rule = {
  code: CODE,

  run(c: ContractRow, ctx: RuleContext): Finding | null {
    const { minContratos, ventanaDias, valorMaximoCop } = THRESHOLDS.FRACCIONAMIENTO;

    const key = entitySupplierKey(c);
    if (!key) return null;
    if (!c.fecha_firma) return null;
    // El contrato evaluado tiene que ser él mismo "pequeño": un contrato grande
    // no es una porción de nada.
    if (!isNum(c.valor_contrato) || c.valor_contrato > valorMaximoCop) return null;

    const objetoNorm = normalizeObjeto(c.objeto);
    if (!objetoNorm) return null;

    const candidatos = (ctx.peersByEntitySupplier.get(key) ?? [])
      .filter(
        (p) =>
          p.fecha_firma !== null &&
          isNum(p.valor_contrato) &&
          p.valor_contrato <= valorMaximoCop &&
          normalizeObjeto(p.objeto) === objetoNorm,
      )
      .sort((a, b) => (a.fecha_firma! < b.fecha_firma! ? -1 : 1));

    if (candidatos.length < minContratos) return null;

    // Ventana deslizante sobre fecha_firma, con dos punteros sobre la lista ya
    // ordenada. Nos quedamos con la ventana más poblada que contenga al
    // contrato evaluado.
    let mejor: ContractRow[] | null = null;
    let inicio = 0;
    for (let fin = 0; fin < candidatos.length; fin++) {
      while (
        inicio < fin &&
        (daysBetween(candidatos[inicio].fecha_firma, candidatos[fin].fecha_firma) ?? 0) > ventanaDias
      ) {
        inicio++;
      }
      const ventana = candidatos.slice(inicio, fin + 1);
      if (ventana.length < minContratos) continue;
      if (!ventana.some((p) => p.id === c.id)) continue;
      if (!mejor || ventana.length > mejor.length) mejor = ventana;
    }

    if (!mejor) return null;

    const valorTotal = mejor.reduce((acc, p) => acc + (p.valor_contrato ?? 0), 0);
    const desde = mejor[0].fecha_firma!;
    const hasta = mejor[mejor.length - 1].fecha_firma!;
    const spanDias = daysBetween(desde, hasta) ?? 0;

    return {
      contract_id: c.id,
      pattern_code: CODE,
      severity: severityOf(CODE),
      points: POINTS,
      detail:
        `Este contrato es uno de ${mejor.length} firmados entre ${c.nombre_entidad ?? "la entidad"} ` +
        `y el mismo proveedor en ${spanDias} días (${desde} a ${hasta}), todos por el mismo ` +
        `objeto y cada uno por debajo de ${formatCOP(valorMaximoCop)}. Sumados llegan a ` +
        `${formatCOP(valorTotal)}. Contratar por separado lo que pudo contratarse junto ` +
        `permite quedar bajo el tope de modalidades que exigen más competencia. ` +
        `Cada contrato es verificable individualmente en SECOP.`,
      evidence: {
        contratos_en_ventana: mejor.length,
        umbral_contratos: minContratos,
        ventana_dias: ventanaDias,
        dias_reales_entre_extremos: spanDias,
        valor_maximo_por_contrato: valorMaximoCop,
        valor_total_ventana: valorTotal,
        objeto_normalizado: objetoNorm,
        nit_entidad: c.nit_entidad,
        documento_proveedor: c.documento_proveedor,
        fecha_desde: desde,
        fecha_hasta: hasta,
        contratos: mejor.map((p) => ({
          id_contrato: p.id_contrato,
          fecha_firma: p.fecha_firma,
          valor_contrato: p.valor_contrato,
        })),
      },
      source: "rules",
    };
  },
};
