const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
})

/** Formatea un valor en pesos colombianos completos: $25.358.000.000 */
export function formatCOP(value: number): string {
  return copFormatter.format(value)
}

/** Formatea un número entero con separadores de miles es-CO: 20.000 */
export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

/**
 * Abreviador a millones / miles de millones.
 * 25358000000 -> "$25.358 millones"
 * 900000000000 -> "$900.000 millones"
 */
export function abbreviateCOP(value: number): string {
  const millones = value / 1_000_000
  if (Math.abs(millones) >= 1_000_000) {
    const billones = millones / 1_000_000
    return `$${numberFormatter.format(Math.round(billones))} billones`
  }
  return `$${numberFormatter.format(Math.round(millones))} millones`
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

/** "2023-11-28" -> "28 de noviembre de 2023" */
export function formatDateLong(iso: string): string {
  const d = parseISO(iso)
  if (!d) return iso
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

/** "2023-11-28" -> "28 nov 2023" */
export function formatDateShort(iso: string): string {
  const d = parseISO(iso)
  if (!d) return iso
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`
}

/** Antigüedad relativa a partir de una fecha de constitución. */
export function relativeAge(iso: string, from: Date = new Date("2026-08-15")): string {
  const d = parseISO(iso)
  if (!d) return ""
  let months =
    (from.getFullYear() - d.getFullYear()) * 12 + (from.getMonth() - d.getMonth())
  if (from.getDate() < d.getDate()) months -= 1
  if (months < 1) return "menos de un mes"
  if (months < 12) return `${months} ${months === 1 ? "mes" : "meses"}`
  const years = Math.floor(months / 12)
  const rem = months % 12
  const yearsTxt = `${years} ${years === 1 ? "año" : "años"}`
  if (rem === 0) return yearsTxt
  return `${yearsTxt} y ${rem} ${rem === 1 ? "mes" : "meses"}`
}

function parseISO(iso: string): Date | null {
  const parts = iso.split("-").map(Number)
  if (parts.length < 3 || parts.some(Number.isNaN)) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}
