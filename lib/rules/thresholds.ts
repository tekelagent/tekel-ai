/**
 * Umbrales del motor — METODOLOGIA §3 y §4.
 *
 * Se concentran aquí, versionados, en vez de quedar dispersos como números
 * mágicos dentro de cada regla: así se auditan y se recalibran de un vistazo.
 * METODOLOGIA §6.4 pide reportar la distribución tras cada corrida y ajustar
 * estos números —nunca el mundo— si la calibración se sale de rango.
 *
 * Los valores marcados APROX no están en METODOLOGIA porque dependen de datos
 * que el corpus no trae. Se declaran en el `evidence` del hallazgo para que el
 * auditor sepa que puede recalcularlos con la cifra exacta de la entidad.
 */

/** Piso de materialidad para P1 y para "cuantía alta" en P2 (METODOLOGIA §4). */
export const PISO_MATERIALIDAD_COP = 100_000_000;

/**
 * Contratos mínimos del par (supervisor, proveedor) para MISMO_SUPERVISOR.
 *
 * UMBRAL RELATIVO AL CORPUS. Con los 20.000 contratos de Atlántico —el 10% del
 * universo del departamento— el máximo observado por par es 5, así que un
 * umbral de 10 daría cero. Al ingestar el universo completo hay que
 * reevaluarlo al alza.
 */
export const MISMO_SUPERVISOR_MIN = Number(process.env.MISMO_SUPERVISOR_MIN) || 4;

export const THRESHOLDS = {
  DESEQUILIBRIO_PAGOS: {
    /** METODOLOGIA §3: dispara si %pagado − %tiempo ≥ 25 puntos porcentuales. */
    brechaMinimaPp: 25,
    /** METODOLOGIA §3: plazo total > 60 días. Descarta contratos exprés. */
    plazoMinimoDias: 60,
  },

  ADICIONES_50: {
    /**
     * Ley 80 art. 40 limita la adición al 50% del valor inicial. El corpus no
     * trae valor inicial ni valor adicionado, así que la regla opera en modo
     * aproximado sobre la prórroga en TIEMPO y lo declara
     * (`evidence.aproximacion = true`), como prevé METODOLOGIA §3.
     */
    fraccionMinima: 0.5,
  },

  VALOR_ATIPICO: {
    /** METODOLOGIA §3: sin este mínimo de comparables, la regla se abstiene. */
    minComparables: 30,
    /** Percentil que el valor debe superar. */
    percentil: 95,
    /** Y además debe ser al menos este múltiplo de la mediana del grupo. */
    vecesMediana: 2,
  },

  EJECUCION_ANOMALA: {
    /** METODOLOGIA §3(a): terminado hace más de 6 meses y sin liquidar. */
    mesesSinLiquidar: 6,
    /** METODOLOGIA §3(b): pendiente de ejecución sobre el valor, ya terminado. */
    fraccionPendienteMinima: 0.2,
    /** METODOLOGIA §3(c): estados que indican terminación anormal o cesión. */
    estadosAnormales: ["terminado anormalmente", "cedido", "cedido parcialmente"],
  },

  FRACCIONAMIENTO: {
    /** METODOLOGIA §3: ≥3 contratos de la misma entidad al mismo proveedor. */
    minContratos: 3,
    /** METODOLOGIA §3: ventana de 12 meses. */
    ventanaDias: 365,
    /**
     * APROX. METODOLOGIA dice "bajo umbral de menor/mínima cuantía", que depende
     * del presupuesto anual de cada entidad en SMMLV — dato que el corpus no
     * trae. $100M aproxima la menor cuantía de una entidad mediana y se declara
     * en evidence para que el auditor recalcule con el tope real de la entidad.
     */
    valorMaximoCopAprox: 100_000_000,
    /**
     * Caracteres del objeto normalizado que se comparan. Comparar el objeto
     * completo no funciona: en SECOP cierra con el nombre del contratista o el
     * número del contrato, así que dos compras equivalentes nunca dan el mismo
     * string. Medido sobre 20.000 contratos de Atlántico: objeto completo daba 0
     * grupos, 60 caracteres da 4, y 30 agrupa por la mera fórmula de apertura.
     */
    objetoPrefijoChars: 60,
    /** METODOLOGIA §3: el piso de materialidad NO aplica aquí. Lo pequeño es la señal. */
    aplicaPisoMaterialidad: false,
  },

  CONCENTRACION_PROVEEDOR: {
    /** METODOLOGIA §3: default 8 contratos del mismo proveedor con la misma entidad. */
    minContratos: 8,
    /**
     * O bien esta fracción del valor contratado por la entidad en 24 meses.
     * METODOLOGIA deja X sin fijar; 30% señala captura parcial —la forma común—
     * sin castigar a entidades pequeñas con pocos proveedores naturales.
     */
    fraccionValorEntidad: 0.3,
    /** Ventana para el cómputo de la fracción. */
    ventanaValorDias: 730,
  },
} as const;

/** Cortes de nivel de riesgo. METODOLOGIA §4: 0-29 bajo · 30-64 medio · 65+ crítico. */
export const RISK_LEVELS = {
  medioDesde: 30,
  criticoDesde: 65,
  scoreMaximo: 100,
} as const;

/** Umbrales del triaje P1/P2/P3 (METODOLOGIA §4). */
export const PRIORIDAD = {
  /** P1 exige score crítico. */
  p1ScoreMinimo: 65,
  /** P1 exige convergencia de señales independientes. */
  p1PatronesIndependientes: 2,
  /** P2 vigente: banda media alta. */
  p2ScoreMinimoVigente: 40,
  p2ScoreMaximoVigente: 64,
  /** P2 histórico: ventana general de la acción fiscal, Ley 610/2000 art. 9. */
  p2VentanaFiscalAnios: 5,
  /** P3: resto con score ≥ 30. */
  p3ScoreMinimo: 30,
} as const;
