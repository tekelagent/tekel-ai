/**
 * Registro de reglas de la Capa A — METODOLOGIA §3.
 *
 * Añadir una regla = escribir su archivo y agregarla a este arreglo. El runner
 * no conoce reglas individuales, solo este registro.
 *
 * Los patrones declarados en el catálogo pero de otra capa (Croma, LLM) no
 * aparecen aquí: el catálogo es la especificación completa, este arreglo es lo
 * que hoy ejecuta la Capa A.
 */
import { adiciones50 } from "./adiciones-50";
import { concentracionProveedor } from "./concentracion-proveedor";
import { desequilibrioPagos } from "./desequilibrio-pagos";
import { diciembre } from "./diciembre";
import { ejecucionAnomala } from "./ejecucion-anomala";
import { fraccionamiento } from "./fraccionamiento";
import { pagoAdelantadoRiesgo } from "./pago-adelantado-riesgo";
import { valorAtipico } from "./valor-atipico";
import type { Rule } from "./types";

export const RULES: readonly Rule[] = [
  desequilibrioPagos,
  adiciones50,
  valorAtipico,
  ejecucionAnomala,
  fraccionamiento,
  concentracionProveedor,
  pagoAdelantadoRiesgo,
  diciembre,
] as const;

export {
  adiciones50,
  concentracionProveedor,
  desequilibrioPagos,
  diciembre,
  ejecucionAnomala,
  fraccionamiento,
  pagoAdelantadoRiesgo,
  valorAtipico,
};
