/**
 * Registro de reglas de la Capa A.
 *
 * Añadir una regla = escribir su archivo y agregarla a este arreglo. El runner
 * no conoce reglas individuales, solo este registro, así que no hay ningún otro
 * sitio que tocar.
 *
 * Las reglas declaradas en el catálogo pero aún sin implementar
 * (ADICIONES_50, y las de Croma y LLM) no aparecen aquí: el catálogo es la
 * especificación completa, este arreglo es lo que hoy se ejecuta.
 */
import { concentracionProveedor } from "./concentracion-proveedor";
import { desequilibrioPagos } from "./desequilibrio-pagos";
import { diciembre } from "./diciembre";
import { fraccionamiento } from "./fraccionamiento";
import { pagoAdelantadoRiesgo } from "./pago-adelantado-riesgo";
import type { Rule } from "./types";

export const RULES: readonly Rule[] = [
  desequilibrioPagos,
  pagoAdelantadoRiesgo,
  diciembre,
  fraccionamiento,
  concentracionProveedor,
] as const;

export {
  concentracionProveedor,
  desequilibrioPagos,
  diciembre,
  fraccionamiento,
  pagoAdelantadoRiesgo,
};
