/**
 * FRACCIONAMIENTO — 30 pts, foco entidad.
 * METODOLOGIA §3: Ley 80 art. 24, transparencia y selección objetiva.
 *
 * Un mismo proveedor firma con una misma entidad varios contratos pequeños, de
 * objetos similares, dentro de una ventana de 12 meses. Partir una compra grande
 * en varias pequeñas permite esquivar la modalidad de selección que le
 * correspondería, y con ella la competencia que esa modalidad exige.
 *
 * METODOLOGIA §3: el piso de materialidad NO aplica aquí. Lo pequeño es la señal.
 *
 * Necesita mirar otros contratos, así que recibe el agrupamiento ya calculado
 * en `ctx`: la regla sigue siendo pura y no toca la base de datos.
 */
import { citaNormativa } from "../normativa/catalog";
import { makeFinding } from "./finding";
import { daysBetween, formatCOP, isNum, objetoKey } from "./format";
import { THRESHOLDS } from "./thresholds";
import { entitySupplierKey, esComputable } from "./types";
import type { ContractRow, Finding, Rule, RuleContext } from "./types";

const CODE = "FRACCIONAMIENTO" as const;

export const fraccionamiento: Rule = {
  code: CODE,

  run(c: ContractRow, ctx: RuleContext): Finding | null {
    if (!esComputable(c)) return null;

    const { minContratos, ventanaDias, valorMaximoCopAprox, objetoPrefijoChars } =
      THRESHOLDS.FRACCIONAMIENTO;

    const key = entitySupplierKey(c);
    if (!key) return null;
    if (!c.fecha_firma) return null;
    // El contrato evaluado tiene que ser él mismo pequeño: un contrato grande
    // no es una porción de nada.
    if (!isNum(c.valor_contrato) || c.valor_contrato > valorMaximoCopAprox) return null;

    const objetoClave = objetoKey(c.objeto, objetoPrefijoChars);
    if (!objetoClave) return null;

    const candidatos = (ctx.peersByEntitySupplier.get(key) ?? [])
      .filter(
        (p) =>
          esComputable(p) &&
          p.fecha_firma !== null &&
          isNum(p.valor_contrato) &&
          p.valor_contrato <= valorMaximoCopAprox &&
          objetoKey(p.objeto, objetoPrefijoChars) === objetoClave,
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

    return makeFinding({
      contract: c,
      code: CODE,
      // El techo de cuantía es una aproximación de la menor cuantía real de la
      // entidad, que depende de su presupuesto en SMMLV.
      confianza: "media",
      detail:
        `Este contrato es uno de ${mejor.length} firmados entre ` +
        `${c.nombre_entidad ?? "la entidad"} y el mismo proveedor en ${spanDias} días ` +
        `(${desde} a ${hasta}), todos por objetos equivalentes y cada uno por debajo de ` +
        `${formatCOP(valorMaximoCopAprox)}. Sumados llegan a ${formatCOP(valorTotal)}. ` +
        `Contratar por separado lo que pudo contratarse junto permite quedar bajo el ` +
        `tope de las modalidades que exigen más competencia. Cada contrato es ` +
        `verificable individualmente en SECOP. Criterio: ${citaNormativa(CODE)}.`,
      evidence: {
        contratos_en_ventana: mejor.length,
        umbral_contratos: minContratos,
        ventana_dias: ventanaDias,
        dias_reales_entre_extremos: spanDias,
        valor_maximo_por_contrato: valorMaximoCopAprox,
        // El tope real depende del presupuesto anual de la entidad en SMMLV.
        valor_maximo_es_aproximacion: true,
        valor_total_ventana: valorTotal,
        objeto_clave: objetoClave,
        objeto_prefijo_chars: objetoPrefijoChars,
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
    });
  },
};
