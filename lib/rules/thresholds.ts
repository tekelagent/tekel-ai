/**
 * Umbrales de las reglas — calibración conservadora.
 *
 * CLAUDE.md fija los `pattern_code` y sus pesos, pero no estos parámetros. Se
 * concentran aquí, en un solo archivo versionado, en vez de quedar dispersos
 * como números mágicos dentro de cada regla: así se auditan y se recalibran de
 * un vistazo.
 *
 * Criterio: ante un jurado, un hallazgo que no aguanta escrutinio cuesta más
 * que un hallazgo que falta. Todos los umbrales están del lado estricto.
 */

export const THRESHOLDS = {
  DESEQUILIBRIO_PAGOS: {
    /**
     * Brecha mínima, en puntos porcentuales, entre el % pagado del contrato y
     * el % de tiempo transcurrido. 30 pp = te pagaron casi un tercio del
     * contrato por adelantado respecto al avance esperado.
     */
    brechaMinimaPp: 30,
  },

  FRACCIONAMIENTO: {
    /** Contratos mínimos dentro de la ventana para considerarlo un patrón. */
    minContratos: 4,
    /** Ancho de la ventana deslizante sobre `fecha_firma`. */
    ventanaDias: 90,
    /** Techo de cuantía: por encima de esto ya no es "contrato pequeño". */
    valorMaximoCop: 50_000_000,
    /**
     * Caracteres del objeto normalizado que se comparan entre contratos.
     *
     * Comparar el objeto completo no funciona con datos reales: en SECOP el
     * objeto es una descripción larga y casi única, que suele cerrar con el
     * nombre del contratista, el número del contrato o la vigencia. Dos compras
     * equivalentes casi nunca producen el mismo string entero, pero sí
     * comparten el arranque. Medido sobre los 20.000 contratos de Atlántico:
     * objeto completo daba 0 grupos, 60 caracteres da 4, y 30 da 15 a costa de
     * agrupar por la mera fórmula de apertura ("prestacion de servicios prof…").
     */
    objetoPrefijoChars: 60,
  },

  CONCENTRACION_PROVEEDOR: {
    /** Contratos mínimos del mismo proveedor con la misma entidad. */
    minContratos: 10,
  },
} as const;

/** Cortes de nivel de riesgo. CLAUDE.md: 0-29 bajo · 30-64 medio · 65+ crítico. */
export const RISK_LEVELS = {
  medioDesde: 30,
  criticoDesde: 65,
  scoreMaximo: 100,
} as const;
