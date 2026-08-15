import { describe, expect, it } from "vitest";
import { desequilibrioPagos } from "../desequilibrio-pagos";
import { contract, soloCtx } from "./fixtures";

/**
 * Escenario base: contrato de 100 días (2025-01-01 a 2025-04-11) evaluado el
 * día 10, es decir con el 10% del plazo transcurrido. Cuánto se ha pagado es lo
 * único que varía entre casos.
 */
function conPagado(valorPagado: number) {
  return contract({
    valor_contrato: 100_000_000,
    valor_pagado: valorPagado,
    fecha_inicio: "2025-01-01",
    fecha_fin: "2025-04-11",
  });
}
const HOY = "2025-01-11";

describe("DESEQUILIBRIO_PAGOS — dispara", () => {
  it("con una brecha de exactamente 30 pp (el umbral es inclusivo)", () => {
    // 40% pagado contra 10% de tiempo transcurrido = 30.00 pp
    const c = conPagado(40_000_000);
    const f = desequilibrioPagos.run(c, soloCtx(c, HOY));
    expect(f).not.toBeNull();
    expect(f!.evidence.brecha_puntos_porcentuales).toBe(30);
  });

  it("con una brecha amplia, y pesa 25 puntos con severidad alta", () => {
    const c = conPagado(90_000_000);
    const f = desequilibrioPagos.run(c, soloCtx(c, HOY))!;
    expect(f.points).toBe(25);
    expect(f.severity).toBe("alta");
    expect(f.pattern_code).toBe("DESEQUILIBRIO_PAGOS");
    expect(f.source).toBe("rules");
  });

  it("aunque lo pagado supere el valor del contrato", () => {
    const c = conPagado(120_000_000);
    const f = desequilibrioPagos.run(c, soloCtx(c, HOY))!;
    expect(f.evidence.pct_pagado).toBeGreaterThan(1);
    expect(f.evidence.valor_pendiente).toBeLessThan(0);
  });

  it("con evidence que trae las cifras concretas, no texto genérico", () => {
    const c = conPagado(40_000_000);
    const f = desequilibrioPagos.run(c, soloCtx(c, HOY))!;
    expect(f.evidence).toMatchObject({
      valor_contrato: 100_000_000,
      valor_pagado: 40_000_000,
      valor_pendiente: 60_000_000,
      pct_pagado: 0.4,
      pct_tiempo_transcurrido: 0.1,
      dias_transcurridos: 10,
      dias_totales: 100,
      umbral_puntos_porcentuales: 30,
      evaluado_el: HOY,
    });
  });

  it("con un detail en español que cita las cifras y no acusa", () => {
    const c = conPagado(40_000_000);
    const { detail } = desequilibrioPagos.run(c, soloCtx(c, HOY))!;
    expect(detail).toContain("40.0%");
    expect(detail).toContain("10.0%");
    expect(detail).toMatch(/\$100\.000\.000|\$100,000,000/);
    // Nunca afirma culpabilidad: CLAUDE.md lo prohíbe explícitamente.
    expect(detail).not.toMatch(/corrupci|delito|fraude|culpab|rob/i);
  });
});

describe("DESEQUILIBRIO_PAGOS — no dispara", () => {
  it("con una brecha de 29 pp, justo debajo del umbral", () => {
    const c = conPagado(39_000_000);
    expect(desequilibrioPagos.run(c, soloCtx(c, HOY))).toBeNull();
  });

  it("cuando los pagos van al ritmo del tiempo transcurrido", () => {
    const c = conPagado(12_000_000);
    expect(desequilibrioPagos.run(c, soloCtx(c, HOY))).toBeNull();
  });

  it("cuando el contrato ya terminó", () => {
    const c = conPagado(90_000_000);
    expect(desequilibrioPagos.run(c, soloCtx(c, "2025-05-01"))).toBeNull();
  });

  it("el mismo día en que vence, porque ya no queda plazo por delante", () => {
    const c = conPagado(90_000_000);
    expect(desequilibrioPagos.run(c, soloCtx(c, "2025-04-11"))).toBeNull();
  });

  it("cuando el contrato todavía no empieza", () => {
    const c = conPagado(90_000_000);
    expect(desequilibrioPagos.run(c, soloCtx(c, "2024-12-15"))).toBeNull();
  });
});

describe("DESEQUILIBRIO_PAGOS — bordes de datos ausentes o inválidos", () => {
  it("valor_contrato nulo", () => {
    const c = contract({ valor_contrato: null, valor_pagado: 40_000_000 });
    expect(desequilibrioPagos.run(c, soloCtx(c, HOY))).toBeNull();
  });

  it("valor_contrato en cero, que dividiría por cero", () => {
    const c = conPagado(40_000_000);
    c.valor_contrato = 0;
    expect(desequilibrioPagos.run(c, soloCtx(c, HOY))).toBeNull();
  });

  it("valor_pagado nulo", () => {
    const c = conPagado(0);
    c.valor_pagado = null;
    expect(desequilibrioPagos.run(c, soloCtx(c, HOY))).toBeNull();
  });

  it("valor_pagado en cero no dispara: cero pagos nunca es desequilibrio", () => {
    const c = conPagado(0);
    expect(desequilibrioPagos.run(c, soloCtx(c, HOY))).toBeNull();
  });

  it("sin fecha de inicio", () => {
    const c = conPagado(90_000_000);
    c.fecha_inicio = null;
    expect(desequilibrioPagos.run(c, soloCtx(c, HOY))).toBeNull();
  });

  it("sin fecha de fin", () => {
    const c = conPagado(90_000_000);
    c.fecha_fin = null;
    expect(desequilibrioPagos.run(c, soloCtx(c, HOY))).toBeNull();
  });

  it("con fecha de fin anterior a la de inicio", () => {
    const c = conPagado(90_000_000);
    c.fecha_fin = "2024-12-01";
    expect(desequilibrioPagos.run(c, soloCtx(c, HOY))).toBeNull();
  });

  it("con duración de cero días", () => {
    const c = conPagado(90_000_000);
    c.fecha_fin = c.fecha_inicio;
    expect(desequilibrioPagos.run(c, soloCtx(c, HOY))).toBeNull();
  });
});
