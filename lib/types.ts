export type Contract = {
  id_contrato: string
  nombre_entidad: string
  proveedor: string
  documento_proveedor: string
  objeto: string
  valor_contrato: number
  plata_en_riesgo: number | null
  vigencia: "vigente" | "historico" | "otro"
  estado_contrato: string
  departamento: string
  ciudad: string
  tipo_de_contrato: string
  modalidad: string
  fecha_firma: string
  risk_score: number | null
  risk_level: "bajo" | "medio" | "critico" | null
  prioridad: "P1" | "P2" | "P3" | null
  porque_ahora: string[]
  url_proceso: string
  valor_verificar: boolean
}

export type Finding = {
  pattern_code: string
  severity: "critica" | "alta" | "media"
  points: number
  confianza: "alta" | "media" | "baja"
  foco: "entidad" | "contratista" | "ambos"
  detail: string
  evidence: Record<string, string | number>
  norma: string
  source: "rules" | "llm" | "croma"
}

export type AnalysisState = {
  status: "queued" | "running" | "needs_upload" | "done" | "error"
  stage: "forense" | "docs" | "pliego" | null
  log: { ts: string; msg: string }[]
}

export type ForensicProfile = {
  empresa?: {
    razon_social: string
    nit: string
    fecha_constitucion: string
    antiguedad_texto: string
    representante: string
    actividades: string[]
  }
  checks: {
    nombre: string
    resultado: "ok" | "alerta" | "omitido"
    detalle: string
  }[]
  contratos_previos?: {
    count: number
    muestra: { entidad: string; valor: number; fecha: string }[]
  }
  sanciones_count: number
  consultado_en: string
}

export type PliegoCita = {
  archivo: string
  pagina: number
  cita: string
  hallazgo: string
  pattern_code: string
}

export type OtrosiExtract = {
  valor_inicial: number
  valor_adicionado: number
  porcentaje: number
  cita: string
  pagina: number
}

export type Filters = {
  q: string
  modo: "vigente" | "historico"
  prioridad: string[]
  risk_level: string[]
  departamento: string
  ciudad: string
  tipo: string
  modalidad: string
  valor_min: number | null
  patrones: string[]
  orden: "plata" | "score" | "fecha" | "valor"
}
