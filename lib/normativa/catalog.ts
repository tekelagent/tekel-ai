/**
 * Catálogo normativo — METODOLOGIA §3.
 *
 * Cada patrón declara el criterio normativo que sustenta la verificación.
 *
 * REGLA ANTI-ALUCINACIÓN (METODOLOGIA §3 y §6.5): ningún componente del sistema
 * —ni las reglas, ni el LLM— puede citar normas que no estén en este catálogo o
 * en texto recuperado en la misma sesión vía Croma Legalize / conceptos ANCP-CCE.
 * Los `detail` de los findings toman su referencia normativa de aquí, nunca de
 * texto generado.
 *
 * Las referencias son puntos de partida curados, transcritos de METODOLOGIA §3.
 * `sintesis` parafrasea el deber que la norma impone; NO es el texto del
 * artículo. El texto vigente se recupera en Capa C, y por eso el catálogo se
 * versiona: un catálogo estático se desactualiza.
 */

/** A quién apunta la verificación del hallazgo. */
export type Foco = "entidad" | "contratista" | "ambos";

export type CriterioNormativo = {
  /** Norma o cuerpo normativo de referencia. */
  norma: string;
  /** Artículo o disposición concreta. null cuando el criterio es principial. */
  articulo: string | null;
  /** Paráfrasis del deber que impone. No es el texto del artículo. */
  sintesis: string;
  foco: Foco;
  /**
   * Fuente para recuperar el texto vigente en Capa C.
   * `legalize` para normas con articulado; `concepto-cce` para doctrina
   * interpretativa de la ANCP-CCE.
   */
  verificarEn: "legalize" | "concepto-cce" | "ambas" | null;
};

/**
 * Versión del catálogo. Va en la trazabilidad de cada expediente
 * (METODOLOGIA §5.6) para que un hallazgo emitido hoy siga siendo interpretable
 * cuando el catálogo cambie.
 */
export const CATALOGO_NORMATIVO_VERSION = "2026-08-15";

export const NORMATIVA = {
  INHABILIDAD_REP_LEGAL: {
    norma: "Ley 80 de 1993",
    articulo: "art. 8",
    sintesis:
      "Régimen de inhabilidades e incompatibilidades para contratar con el Estado. " +
      "Los antecedentes se verifican en SIRI y SIBOR.",
    foco: "ambos",
    verificarEn: "legalize",
  },
  PROVEEDOR_RECIENTE: {
    norma: "Ley 80 de 1993 / Ley 1150 de 2007",
    articulo: "Ley 80 art. 29; Ley 1150 art. 5",
    sintesis:
      "Deber de selección objetiva: la entidad debe verificar capacidad e " +
      "idoneidad del contratista antes de adjudicar.",
    foco: "contratista",
    verificarEn: "legalize",
  },
  ADICIONES_50: {
    norma: "Ley 80 de 1993",
    articulo: "art. 40, parágrafo",
    sintesis:
      "Los contratos no pueden adicionarse en más del 50% de su valor inicial, " +
      "medido en SMMLV.",
    foco: "entidad",
    verificarEn: "ambas",
  },
  MOROSO_BDME: {
    norma: "Régimen del Boletín de Deudores Morosos del Estado",
    articulo: null,
    sintesis:
      "La inclusión en el BDME genera inhabilidad para contratar con el Estado " +
      "mientras la deuda esté vigente.",
    foco: "contratista",
    verificarEn: "legalize",
  },
  FRACCIONAMIENTO: {
    norma: "Ley 80 de 1993",
    articulo: "art. 24",
    sintesis:
      "Principios de transparencia y selección objetiva. Partir una compra para " +
      "quedar bajo el tope de una modalidad menos competida los desconoce.",
    foco: "entidad",
    verificarEn: "ambas",
  },
  PLIEGO_SASTRE: {
    norma: "Ley 80 de 1993 / Decreto 1082 de 2015",
    articulo: "Ley 80 art. 24",
    sintesis:
      "Libre concurrencia y selección objetiva: los requisitos del pliego no " +
      "pueden restringir la competencia sin justificación técnica.",
    foco: "entidad",
    verificarEn: "ambas",
  },
  DESEQUILIBRIO_PAGOS: {
    norma: "Ley 1474 de 2011",
    articulo: "arts. 83-84",
    sintesis:
      "Deberes de supervisión e interventoría: el seguimiento técnico, " +
      "administrativo y financiero debe respaldar cada desembolso.",
    foco: "entidad",
    verificarEn: "legalize",
  },
  PLAZO_RELAMPAGO: {
    norma: "Decreto 1082 de 2015",
    articulo: null,
    sintesis:
      "Plazos razonables de publicidad: la ventana para presentar ofertas debe " +
      "permitir concurrencia real.",
    foco: "entidad",
    verificarEn: "legalize",
  },
  SANCIONES_PREVIAS: {
    norma: "Historial sancionatorio en SECOP",
    articulo: null,
    sintesis:
      "Las sanciones previas del proveedor son indicio de riesgo de " +
      "incumplimiento, no inhabilidad automática.",
    foco: "contratista",
    verificarEn: null,
  },
  VALOR_ATIPICO: {
    norma: "Ley 80 de 1993",
    articulo: "arts. 25-26",
    sintesis:
      "Principios de economía y planeación, y responsabilidad por la " +
      "estimación del valor del contrato frente a comparables de mercado.",
    foco: "ambos",
    verificarEn: "legalize",
  },
  EJECUCION_ANOMALA: {
    norma: "Ley 80 de 1993 / Ley 1150 de 2007",
    articulo: "Ley 80 art. 60; Ley 1150 art. 11",
    sintesis:
      "Deber de liquidación del contrato dentro de los plazos previstos, y " +
      "constancia de la ejecución efectivamente recibida.",
    foco: "entidad",
    verificarEn: "legalize",
  },
  CONCENTRACION_PROVEEDOR: {
    norma: "Ley 80 de 1993",
    articulo: "art. 24",
    sintesis:
      "Principio de selección objetiva. La concentración sostenida de contratos " +
      "en un proveedor es indicio de direccionamiento o captura, no prueba.",
    foco: "ambos",
    verificarEn: "concepto-cce",
  },
  OBJETO_CIIU_INCOHERENTE: {
    norma: "Ley 80 de 1993 / Ley 1150 de 2007",
    articulo: "Ley 80 art. 29; Ley 1150 art. 5",
    sintesis:
      "Idoneidad y capacidad: el objeto social registrado en RUES debe guardar " +
      "relación con el objeto contratado.",
    foco: "contratista",
    verificarEn: "legalize",
  },
  PAGO_ADELANTADO_RIESGO: {
    norma: "Ley 1474 de 2011",
    articulo: "art. 91",
    sintesis:
      "Manejo de anticipos: los recursos entregados por anticipado deben " +
      "administrarse en patrimonio autónomo y destinarse exclusivamente al contrato.",
    foco: "entidad",
    verificarEn: "legalize",
  },
  DICIEMBRE: {
    norma: "Ley 80 de 1993",
    articulo: "arts. 25-26",
    sintesis:
      "Principios de economía y planeación. Contratar al cierre de la vigencia " +
      "fiscal es indicio de deficiencia de planeación, nunca infracción por sí sola.",
    foco: "entidad",
    verificarEn: "legalize",
  },
  OBJETO_DIFUSO: {
    norma: "Ley 80 de 1993",
    articulo: "arts. 25-26",
    sintesis:
      "Deber de planeación: el objeto debe estar definido con precisión " +
      "suficiente para determinar qué se contrata y por cuánto.",
    foco: "entidad",
    verificarEn: "legalize",
  },
} as const satisfies Record<string, CriterioNormativo>;

export type PatternCode = keyof typeof NORMATIVA;

export function criterioDe(code: PatternCode): CriterioNormativo {
  return NORMATIVA[code];
}

export function focoDe(code: PatternCode): Foco {
  return NORMATIVA[code].foco;
}

/**
 * Referencia normativa citable, compuesta SOLO desde el catálogo.
 * Es la única forma autorizada de escribir una norma en un `detail`.
 */
export function citaNormativa(code: PatternCode): string {
  const c = NORMATIVA[code];
  return c.articulo ? `${c.norma}, ${c.articulo}` : c.norma;
}
