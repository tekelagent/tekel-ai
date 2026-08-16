import Link from "next/link"
import { AlertTriangle, Building2, Landmark, Wallet } from "lucide-react"
import type { ContractorProfile } from "@/lib/aggregate"
import type { Contract } from "@/lib/types"
import { abbreviateCOP, formatDateShort } from "@/lib/format"
import { ContractCard } from "./contract-card"
import { riskColor } from "./meta"

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="card-soft flex items-center gap-3 p-4">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ backgroundColor: tone ?? "var(--brand-via)" }}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="label-eyebrow leading-none">{label}</p>
        <p className="num mt-1 truncate text-base font-semibold tabular-nums text-foreground">
          {value}
        </p>
      </div>
    </div>
  )
}

export function ContractorView({
  profile,
  patronesByContract,
}: {
  profile: ContractorProfile
  patronesByContract: Record<string, string[]>
}) {
  const scoreColor =
    profile.scorePromedio != null
      ? riskColor(
          profile.scorePromedio >= 60 ? "critico" : profile.scorePromedio >= 35 ? "medio" : "bajo",
        )
      : "var(--p3)"

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">
      <Link
        href="/"
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        Volver al panel
      </Link>

      <span className="badge-pill border border-hairline bg-surface text-muted-foreground">
        Perfil de contratista
      </span>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground text-balance md:text-4xl">
        {profile.nombre}
      </h1>
      <p className="num mt-1 text-sm text-muted-foreground tabular-nums">NIT {profile.nit}</p>

      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">
        Todos los contratos de este proveedor a través de {profile.entidades.length}{" "}
        {profile.entidades.length === 1 ? "entidad" : "entidades"} y el tiempo. Útil para detectar
        concentración de contratación o captura de una misma entidad.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={Wallet} label="Valor total" value={abbreviateCOP(profile.valorTotal)} />
        <StatTile
          icon={AlertTriangle}
          label="Plata en riesgo"
          value={profile.plataEnRiesgo > 0 ? abbreviateCOP(profile.plataEnRiesgo) : "—"}
          tone="var(--crit)"
        />
        <StatTile
          icon={Landmark}
          label="Score promedio"
          value={profile.scorePromedio != null ? String(profile.scorePromedio) : "—"}
          tone={scoreColor}
        />
        <StatTile
          icon={Building2}
          label="Entidades distintas"
          value={String(profile.entidades.length)}
        />
      </div>

      <section aria-labelledby="entidades-h" className="mt-8">
        <h2 id="entidades-h" className="text-sm font-semibold text-foreground">
          Entidades con las que ha contratado
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {profile.entidades.map((e) => (
            <span
              key={e}
              className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-foreground"
            >
              <Landmark className="size-3 text-muted-foreground" aria-hidden />
              {e}
            </span>
          ))}
        </div>
      </section>

      <section aria-labelledby="linea-h" className="mt-8">
        <h2 id="linea-h" className="text-sm font-semibold text-foreground">
          Línea de tiempo de contratos
        </h2>
        <div className="card-soft mt-3 overflow-hidden">
          <ol>
            {profile.contratos.map((c: Contract, i: number) => (
              <li
                key={c.id_contrato}
                className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: riskColor(c.risk_level) }}
                  aria-hidden
                />
                <span className="num w-20 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatDateShort(c.fecha_firma)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {c.nombre_entidad}
                </span>
                <span className="num shrink-0 text-sm font-medium tabular-nums text-foreground">
                  {abbreviateCOP(c.valor_contrato)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="contratos-h" className="mt-8">
        <h2 id="contratos-h" className="text-sm font-semibold text-foreground">
          Contratos ({profile.contratos.length})
        </h2>
        <div className="mt-3 flex flex-col gap-3">
          {profile.contratos.map((c) => (
            <ContractCard
              key={c.id_contrato}
              contract={c}
              modo={c.vigencia === "historico" ? "historico" : "vigente"}
              patrones={patronesByContract[c.id_contrato] ?? []}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
