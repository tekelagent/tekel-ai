import type { Contract, Finding } from "@/lib/types"

type Tone = {
  text: string
  bg: string
  border: string
  ring: string // color usable en fill/stroke SVG (hex via var)
}

/** Tono por prioridad. P1 rojo, P2 ámbar, P3 gris. */
export function priorityTone(p: Contract["prioridad"]): Tone {
  switch (p) {
    case "P1":
      return {
        text: "text-crit",
        bg: "bg-crit-soft",
        border: "border-crit/30",
        ring: "var(--crit)",
      }
    case "P2":
      return {
        text: "text-warn",
        bg: "bg-warn-soft",
        border: "border-warn/30",
        ring: "var(--warn)",
      }
    case "P3":
      return {
        text: "text-p3",
        bg: "bg-muted",
        border: "border-hairline",
        ring: "var(--p3)",
      }
    default:
      return {
        text: "text-muted-foreground",
        bg: "bg-muted",
        border: "border-hairline",
        ring: "var(--p3)",
      }
  }
}

/** Color de la barra/anillo según nivel de riesgo. */
export function riskColor(level: Contract["risk_level"]): string {
  switch (level) {
    case "critico":
      return "var(--crit)"
    case "medio":
      return "var(--warn)"
    case "bajo":
      return "var(--ok)"
    default:
      return "var(--p3)"
  }
}

export function riskLabel(level: Contract["risk_level"]): string {
  switch (level) {
    case "critico":
      return "CRÍTICO"
    case "medio":
      return "MEDIO"
    case "bajo":
      return "BAJO"
    default:
      return "SIN CLASIFICAR"
  }
}

/** Color de la línea lateral de un hallazgo según severidad. */
export function severityColor(s: Finding["severity"]): string {
  switch (s) {
    case "critica":
      return "var(--crit)"
    case "alta":
      return "var(--warn)"
    case "media":
      return "var(--p3)"
  }
}

export function severityLabel(s: Finding["severity"]): string {
  return { critica: "Severidad crítica", alta: "Severidad alta", media: "Severidad media" }[s]
}

export function confianzaLabel(c: Finding["confianza"]): string {
  return { alta: "Confianza alta", media: "Confianza media", baja: "Confianza baja" }[c]
}

export function focoLabel(f: Finding["foco"]): string {
  return { entidad: "Foco: entidad", contratista: "Foco: contratista", ambos: "Foco: ambos" }[f]
}

export function sourceLabel(s: Finding["source"]): string {
  return {
    rules: "Regla sobre datos oficiales",
    llm: "Análisis semántico (IA)",
    croma: "Cruce con registros",
  }[s]
}
