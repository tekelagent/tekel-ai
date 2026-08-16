import type { Contract } from "./types"

export type GroupRanking = {
  key: string
  label: string
  contratos: number
  criticos: number
  valorTotal: number
  plataEnRiesgo: number
  scorePromedio: number | null
}

function buildRanking(
  contracts: Contract[],
  keyOf: (c: Contract) => string,
): GroupRanking[] {
  const byKey = new Map<string, Contract[]>()
  for (const c of contracts) {
    const key = keyOf(c)
    if (!key) continue
    const list = byKey.get(key) ?? []
    list.push(c)
    byKey.set(key, list)
  }

  const rows: GroupRanking[] = []
  for (const [key, list] of byKey) {
    const scored = list.filter((c) => c.risk_score != null)
    const scorePromedio =
      scored.length > 0
        ? Math.round(scored.reduce((s, c) => s + (c.risk_score ?? 0), 0) / scored.length)
        : null
    rows.push({
      key,
      label: key,
      contratos: list.length,
      criticos: list.filter((c) => c.risk_level === "critico").length,
      valorTotal: list.reduce((s, c) => s + c.valor_contrato, 0),
      plataEnRiesgo: list.reduce((s, c) => s + (c.plata_en_riesgo ?? 0), 0),
      scorePromedio,
    })
  }

  return rows.sort((a, b) => b.plataEnRiesgo - a.plataEnRiesgo)
}

/** Ranking de entidades contratantes, ordenado por plata en riesgo acumulada. */
export function rankByEntidad(contracts: Contract[]): GroupRanking[] {
  return buildRanking(contracts, (c) => c.nombre_entidad)
}

/** Ranking de departamentos, ordenado por plata en riesgo acumulada. */
export function rankByDepartamento(contracts: Contract[]): GroupRanking[] {
  return buildRanking(contracts, (c) => c.departamento)
}

export type ContractorProfile = {
  nit: string
  nombre: string
  contratos: Contract[]
  entidades: string[]
  valorTotal: number
  plataEnRiesgo: number
  scorePromedio: number | null
  criticos: number
}

/** Agrupa todos los contratos de un proveedor por NIT/documento, a través de entidades y tiempo. */
export function contractorProfile(
  contracts: Contract[],
  documento: string,
): ContractorProfile | null {
  const contratos = contracts
    .filter((c) => c.documento_proveedor === documento)
    .sort((a, b) => (a.fecha_firma < b.fecha_firma ? 1 : -1))
  if (contratos.length === 0) return null

  const scored = contratos.filter((c) => c.risk_score != null)
  const scorePromedio =
    scored.length > 0
      ? Math.round(scored.reduce((s, c) => s + (c.risk_score ?? 0), 0) / scored.length)
      : null

  return {
    nit: documento,
    nombre: contratos[0].proveedor,
    contratos,
    entidades: Array.from(new Set(contratos.map((c) => c.nombre_entidad))),
    valorTotal: contratos.reduce((s, c) => s + c.valor_contrato, 0),
    plataEnRiesgo: contratos.reduce((s, c) => s + (c.plata_en_riesgo ?? 0), 0),
    scorePromedio,
    criticos: contratos.filter((c) => c.risk_level === "critico").length,
  }
}
