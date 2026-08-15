import { describe, expect, it } from "vitest";
import { PATTERNS, pointsOf, severityFromPoints, severityOf } from "../catalog";

describe("severityFromPoints", () => {
  it.each([
    [45, "critica"],
    [40, "critica"],
    [39, "alta"],
    [20, "alta"],
    [19, "media"],
    [10, "media"],
    [0, "media"],
  ] as const)("%i puntos -> %s", (puntos, severidad) => {
    expect(severityFromPoints(puntos)).toBe(severidad);
  });
});

/**
 * Este bloque es una guardia sobre la especificación: los pesos vienen de la
 * tabla de CLAUDE.md y no deben cambiar por accidente. Si alguien edita un
 * peso, este test falla y obliga a que sea una decisión consciente.
 */
describe("catálogo de patrones — pesos fijos de CLAUDE.md", () => {
  it.each([
    ["INHABILIDAD_REP_LEGAL", 45],
    ["PROVEEDOR_RECIENTE", 40],
    ["ADICIONES_50", 40],
    ["FRACCIONAMIENTO", 30],
    ["PLIEGO_SASTRE", 25],
    ["DESEQUILIBRIO_PAGOS", 25],
    ["PLAZO_RELAMPAGO", 25],
    ["SANCIONES_PREVIAS", 25],
    ["CONCENTRACION_PROVEEDOR", 20],
    ["OBJETO_CIIU_INCOHERENTE", 20],
    ["PAGO_ADELANTADO_RIESGO", 10],
    ["DICIEMBRE", 10],
    ["OBJETO_DIFUSO", 10],
  ] as const)("%s pesa %i puntos", (code, puntos) => {
    expect(pointsOf(code)).toBe(puntos);
  });

  it("declara los 13 patrones de la especificación", () => {
    expect(Object.keys(PATTERNS)).toHaveLength(13);
  });

  it("la severidad se deriva del peso, sin criterio paralelo", () => {
    expect(severityOf("INHABILIDAD_REP_LEGAL")).toBe("critica");
    expect(severityOf("FRACCIONAMIENTO")).toBe("alta");
    expect(severityOf("DICIEMBRE")).toBe("media");
  });

  it("ADICIONES_50 sigue marcado como no implementado", () => {
    // El dataset jbjy-vk9h no trae valor inicial ni valor adicionado.
    // Requiere cruce con SECOP II - Adiciones (cb9c-h8sn).
    expect(PATTERNS.ADICIONES_50.implemented).toBe(false);
  });
});
