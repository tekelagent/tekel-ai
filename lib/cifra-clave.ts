import type { Contract, Filters } from "./types"

/**
 * Qué cifra acompaña al valor del contrato en la tarjeta y en la cabecera.
 *
 * El problema que resuelve: 12.791 de los 16.830 contratos vigentes tienen
 * `plata_en_riesgo` exactamente igual a `valor_contrato`, porque no se ha
 * desembolsado nada. Mostrar las dos cifras juntas es correcto y a la vez
 * inútil — la segunda columna repite la primera y no ordena nada. Una tabla
 * donde el 76% de las filas dice lo mismo dos veces no ayuda a decidir a quién
 * mirar primero.
 *
 * Lo que sí discrimina es el plan de pagos: 9.560 contratos vigentes tienen
 * facturación aprobada o radicada pendiente de pago, con un promedio del 62,7%
 * del valor del contrato y variación real entre casos. Esa es la plata que
 * todavía se puede detener, y es la que merece el lugar destacado.
 *
 * Jerarquía, de lo más accionable a lo menos:
 *   1. Por salir       — facturas aprobadas o radicadas sin pagar. Se puede parar.
 *   2. Ya desembolsado — salió, con fecha. Ya no se para; se persigue.
 *   3. Sin movimiento  — hay plan de pagos y no se ha movido nada.
 *   4. Sin registro    — no hay rastro. No se afirma nada y no se inventa cifra.
 *
 * Nunca se repite `valor_contrato`: si lo único que se puede decir es "el
 * contrato entero", no se dice nada, porque esa cifra ya está al lado.
 */
export type CifraClave = {
  label: string
  /** null = no hay nada verificable que mostrar. La UI pinta un guion. */
  value: number | null
  /** Destaca en rojo solo lo que todavía se puede detener. */
  destacar: boolean
  /** Explicación corta para la ficha de detalle. */
  nota?: string
}

export function cifraClave(c: Contract, modo: Filters["modo"]): CifraClave {
  const tramite = c.pagos_en_tramite ?? 0
  const confirmado = c.pagos_confirmados ?? 0
  const conPlan = (c.pagos_filas ?? 0) > 0

  if (modo === "historico") {
    const pagado = confirmado > 0 ? confirmado : (c.plata_en_riesgo ?? 0)
    return {
      label: "Pagado bajo revisión",
      value: pagado > 0 ? pagado : null,
      destacar: false,
      nota:
        confirmado > 0
          ? `Verificado contra el plan de pagos de SECOP: ${c.pagos_filas} facturas.`
          : undefined,
    }
  }

  if (tramite > 0) {
    return {
      label: "Por salir",
      value: tramite,
      destacar: true,
      nota:
        "Facturas ya aprobadas o radicadas que todavía no se han pagado. " +
        "Es la plata que aún se puede detener.",
    }
  }

  if (confirmado > 0) {
    return {
      label: "Ya desembolsado",
      value: confirmado,
      destacar: false,
      nota: c.pagos_ultima_fecha
        ? `Último pago registrado el ${c.pagos_ultima_fecha}. Verificado en el plan de pagos.`
        : "Verificado en el plan de pagos de SECOP.",
    }
  }

  if (conPlan) {
    return {
      label: "Sin movimiento de pagos",
      value: null,
      destacar: false,
      nota:
        `Hay plan de pagos (${c.pagos_filas} ` +
        `${c.pagos_filas === 1 ? "factura" : "facturas"}) y ninguna se ha pagado ` +
        `ni aprobado. El contrato entero sigue sin ejecutarse.`,
    }
  }

  return {
    label: "Sin registro de pagos",
    value: null,
    destacar: false,
    nota:
      "No hay pagos reportados por la entidad ni facturas en el plan de pagos de " +
      "SECOP. No se puede afirmar cuánto se ha ejecutado.",
  }
}
