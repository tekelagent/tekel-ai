export type PatternInfo = {
  label: string
  descripcion: string
  fuente: "Datos SECOP" | "Registros oficiales" | "Documentos"
  norma: string
}

export const PATTERNS: Record<string, PatternInfo> = {
  ADICIONES_50: {
    label: "Adiciones sobre el límite legal",
    descripcion:
      "El contrato se adicionó por encima del 50% del valor inicial permitido por la ley.",
    fuente: "Datos SECOP",
    norma: "Ley 80 de 1993, art. 40",
  },
  VALOR_ATIPICO: {
    label: "Valor atípico frente a comparables",
    descripcion:
      "El valor se aparta de forma significativa de contratos comparables por objeto y región.",
    fuente: "Datos SECOP",
    norma: "Ley 1474 de 2011, art. 88",
  },
  EJECUCION_ANOMALA: {
    label: "Ejecución anómala",
    descripcion:
      "Los tiempos o hitos de ejecución muestran un comportamiento inconsistente con lo pactado.",
    fuente: "Datos SECOP",
    norma: "Ley 80 de 1993, art. 4",
  },
  DICIEMBRE: {
    label: "Firma en diciembre",
    descripcion:
      "Contrato firmado en el cierre de vigencia fiscal, patrón asociado a ejecución apresurada.",
    fuente: "Datos SECOP",
    norma: "Ley 819 de 2003, art. 8",
  },
  CONCENTRACION_PROVEEDOR: {
    label: "Concentración de contratos",
    descripcion:
      "Un mismo proveedor concentra una proporción elevada de contratos de la entidad.",
    fuente: "Datos SECOP",
    norma: "Ley 1474 de 2011, art. 84",
  },
  FRACCIONAMIENTO: {
    label: "Fraccionamiento contractual",
    descripcion:
      "Objetos similares divididos en varios contratos para evitar procesos de mayor cuantía.",
    fuente: "Datos SECOP",
    norma: "Ley 80 de 1993, art. 24",
  },
  PAGO_ADELANTADO_RIESGO: {
    label: "Anticipo con riesgo",
    descripcion:
      "Anticipo elevado sin garantías proporcionales al riesgo del desembolso.",
    fuente: "Datos SECOP",
    norma: "Ley 1474 de 2011, art. 91",
  },
  DESEQUILIBRIO_PAGOS: {
    label: "Pagos adelantados al avance",
    descripcion:
      "Los pagos ejecutados superan el avance físico o financiero reportado.",
    fuente: "Datos SECOP",
    norma: "Ley 80 de 1993, art. 27",
  },
  LICITANTE_UNICO: {
    label: "Oferente único",
    descripcion:
      "Proceso competitivo con un único oferente habilitado, señal de baja pluralidad.",
    fuente: "Datos SECOP",
    norma: "Ley 1150 de 2007, art. 2",
  },
  PLAZO_RELAMPAGO: {
    label: "Plazo de ofertas exprés",
    descripcion:
      "El plazo para presentar ofertas fue inusualmente corto para la complejidad del objeto.",
    fuente: "Datos SECOP",
    norma: "Decreto 1082 de 2015",
  },
  MISMO_SUPERVISOR: {
    label: "Supervisor concentrado",
    descripcion:
      "Un mismo supervisor concentra la vigilancia de múltiples contratos del proveedor.",
    fuente: "Datos SECOP",
    norma: "Ley 1474 de 2011, art. 83",
  },
  OBJETO_DIFUSO: {
    label: "Objeto contractual difuso",
    descripcion:
      "El objeto del contrato es genérico o ambiguo, dificultando la verificación de entregables.",
    fuente: "Documentos",
    norma: "Ley 80 de 1993, art. 30",
  },
  INHABILIDAD_REP_LEGAL: {
    label: "Antecedente inhabilitante",
    descripcion:
      "El representante legal registra un antecedente que podría constituir inhabilidad.",
    fuente: "Registros oficiales",
    norma: "Ley 80 de 1993, art. 8",
  },
  SANCIONES_PREVIAS: {
    label: "Multas y sanciones previas",
    descripcion:
      "El contratista registra multas o sanciones en contratos anteriores.",
    fuente: "Registros oficiales",
    norma: "Ley 1474 de 2011, art. 90",
  },
  COLUSION_PREVIA: {
    label: "Colusión sancionada (SIC)",
    descripcion:
      "El proveedor fue sancionado por la SIC por acuerdos colusorios en procesos previos.",
    fuente: "Registros oficiales",
    norma: "Ley 1340 de 2009",
  },
  ANTECEDENTE_OBRA_INCONCLUSA: {
    label: "Obras inconclusas previas",
    descripcion:
      "El contratista figura en el registro de obras inconclusas del Estado.",
    fuente: "Registros oficiales",
    norma: "Ley 2020 de 2020",
  },
  MOROSO_BDME: {
    label: "Deudor moroso del Estado",
    descripcion:
      "El proveedor aparece en el Boletín de Deudores Morosos del Estado (BDME).",
    fuente: "Registros oficiales",
    norma: "Ley 901 de 2004",
  },
  PROVEEDOR_RECIENTE: {
    label: "Empresa recién creada",
    descripcion:
      "La empresa fue constituida poco antes de resultar adjudicataria del contrato.",
    fuente: "Registros oficiales",
    norma: "Ley 1474 de 2011, art. 84",
  },
  OBJETO_CIIU_INCOHERENTE: {
    label: "Actividad ajena al objeto",
    descripcion:
      "La actividad económica registrada (CIIU) no corresponde con el objeto contratado.",
    fuente: "Registros oficiales",
    norma: "Decreto 1082 de 2015",
  },
  PLIEGO_SASTRE: {
    label: "Pliego a la medida",
    descripcion:
      "Requisitos del pliego direccionados para favorecer a un proponente específico.",
    fuente: "Documentos",
    norma: "Ley 1474 de 2011, art. 88",
  },
  RED_SOCIETARIA: {
    label: "Red societaria compartida",
    descripcion:
      "Vínculos societarios entre oferentes que comprometen la independencia de las ofertas.",
    fuente: "Registros oficiales",
    norma: "Ley 1340 de 2009",
  },
  MODIFICACIONES_SUCESIVAS: {
    label: "Modificaciones sucesivas",
    descripcion:
      "Cadena de otrosíes que alteran de forma sustancial las condiciones iniciales.",
    fuente: "Documentos",
    norma: "Ley 80 de 1993, art. 40",
  },
}

export function patternLabel(code: string): string {
  return PATTERNS[code]?.label ?? code
}
