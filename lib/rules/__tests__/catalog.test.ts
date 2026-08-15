import { describe, expect, it } from "vitest";
import {
  PATTERNS,
  esSoloAgravante,
  familiaOf,
  focoOf,
  pointsOf,
  severityFromPoints,
  severityOf,
} from "../catalog";
import { NORMATIVA, citaNormativa } from "../../normativa/catalog";

describe("severityFromPoints", () => {
  it.each([
    [45, "critica"],
    [40, "critica"],
    [39, "alta"],
    [20, "alta"],
    [19, "media"],
    [10, "media"],
  ] as const)("%i puntos -> %s", (puntos, severidad) => {
    expect(severityFromPoints(puntos)).toBe(severidad);
  });
});

/**
 * Guardia sobre la especificación: los pesos vienen de la tabla de
 * METODOLOGIA §3 y no deben cambiar por accidente. Si alguien edita un peso,
 * este test falla y obliga a que sea una decisión consciente.
 */
describe("catálogo de patrones — pesos fijos de METODOLOGIA §3", () => {
  it.each([
    ["INHABILIDAD_REP_LEGAL", 45],
    ["PROVEEDOR_RECIENTE", 40],
    ["ADICIONES_50", 40],
    ["MOROSO_BDME", 40],
    ["FRACCIONAMIENTO", 30],
    ["PLIEGO_SASTRE", 25],
    ["DESEQUILIBRIO_PAGOS", 25],
    ["PLAZO_RELAMPAGO", 25],
    ["SANCIONES_PREVIAS", 25],
    ["VALOR_ATIPICO", 25],
    ["EJECUCION_ANOMALA", 25],
    ["CONCENTRACION_PROVEEDOR", 20],
    ["OBJETO_CIIU_INCOHERENTE", 20],
    ["PAGO_ADELANTADO_RIESGO", 10],
    ["DICIEMBRE", 10],
    ["OBJETO_DIFUSO", 10],
  ] as const)("%s pesa %i puntos", (code, puntos) => {
    expect(pointsOf(code)).toBe(puntos);
  });

  it("declara los 16 patrones de la especificación", () => {
    expect(Object.keys(PATTERNS)).toHaveLength(16);
  });

  it("todo patrón tiene criterio normativo, sin excepciones", () => {
    for (const code of Object.keys(PATTERNS)) {
      expect(NORMATIVA[code as keyof typeof NORMATIVA]).toBeDefined();
    }
  });

  it("la severidad se deriva del peso, sin criterio paralelo", () => {
    expect(severityOf("INHABILIDAD_REP_LEGAL")).toBe("critica");
    expect(severityOf("FRACCIONAMIENTO")).toBe("alta");
    expect(severityOf("DICIEMBRE")).toBe("media");
  });

  it("el foco sale del catálogo normativo, no de una segunda copia", () => {
    expect(focoOf("DESEQUILIBRIO_PAGOS")).toBe("entidad");
    expect(focoOf("PROVEEDOR_RECIENTE")).toBe("contratista");
    expect(focoOf("VALOR_ATIPICO")).toBe("ambos");
  });
});

describe("agravantes puros — METODOLOGIA §3", () => {
  it("DICIEMBRE y PAGO_ADELANTADO_RIESGO nunca priorizan por sí solos", () => {
    expect(esSoloAgravante("DICIEMBRE")).toBe(true);
    expect(esSoloAgravante("PAGO_ADELANTADO_RIESGO")).toBe(true);
  });

  it("los demás patrones sí cuentan para independencia", () => {
    expect(esSoloAgravante("DESEQUILIBRIO_PAGOS")).toBe(false);
    expect(esSoloAgravante("FRACCIONAMIENTO")).toBe(false);
    expect(esSoloAgravante("VALOR_ATIPICO")).toBe(false);
  });
});

describe("familias — regla de corroboración de METODOLOGIA §4", () => {
  it("agrupa por el deber normativo que sustentan", () => {
    expect(familiaOf("DICIEMBRE")).toBe("planeacion");
    expect(familiaOf("VALOR_ATIPICO")).toBe("planeacion");
    expect(familiaOf("FRACCIONAMIENTO")).toBe("seleccion");
    expect(familiaOf("CONCENTRACION_PROVEEDOR")).toBe("seleccion");
    expect(familiaOf("DESEQUILIBRIO_PAGOS")).toBe("ejecucion");
    expect(familiaOf("EJECUCION_ANOMALA")).toBe("ejecucion");
    expect(familiaOf("INHABILIDAD_REP_LEGAL")).toBe("contratista");
  });
});

describe("anti-alucinación normativa — METODOLOGIA §6.5", () => {
  it("citaNormativa compone solo desde el catálogo", () => {
    expect(citaNormativa("ADICIONES_50")).toBe("Ley 80 de 1993, art. 40, parágrafo");
    expect(citaNormativa("DESEQUILIBRIO_PAGOS")).toBe("Ley 1474 de 2011, arts. 83-84");
  });

  it("omite el artículo cuando el criterio es principial, sin inventarlo", () => {
    expect(citaNormativa("MOROSO_BDME")).not.toContain("art.");
  });
});
