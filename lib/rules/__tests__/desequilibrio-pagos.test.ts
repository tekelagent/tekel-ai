import { describe, expect, it } from "vitest";
import { desequilibrioPagos } from "../desequilibrio-pagos";
import { contract, soloCtx } from "./fixtures";

/**
 * Escenario base: contrato de 100 días (2025-01-01 a 2025-04-11) por $200M,
 * evaluado el día 10 — el 10% del plazo transcurrido. Solo varía lo pagado.
 */
function conPagado(valorPagado: number) {
  return contract({
    valor_contrato: 200_000_000,
    valor_pagado: valorPagado,
    fecha_inicio: "2025-01-01",
    fecha_fin: "2025-04-11",
  });
}
const HOY = "2025-01-11";
const run = (c: ReturnType<typeof contract>, hoy = HOY) =>
  desequilibrioPagos.run(c, soloCtx(c, hoy));

describe("DESEQUILIBRIO_PAGOS — fuente del desembolso", () => {
  it("usa el plan de pagos de SECOP cuando existe, no lo que declara la entidad", () => {
    // La entidad reporta cero, pero el plan de pagos prueba $70M desembolsados.
    // Sin esta preferencia el contrato sería invisible para la regla.
    const c = contract({
      valor_contrato: 200_000_000,
      valor_pagado: 0,
      pagos_filas: 5,
      pagos_confirmados: 70_000_000,
      fecha_inicio: "2025-01-01",
      fecha_fin: "2025-04-11",
    });
    const f = run(c);
    expect(f).not.toBeNull();
    expect(f!.evidence.valor_pagado).toBe(70_000_000);
    expect(f!.evidence.fuente_del_pago).toBe("plan_de_pagos_secop");
    expect(f!.evidence.valor_pagado_segun_entidad).toBe(0);
  });

  it("no dispara si el plan de pagos confirma que no ha salido nada", () => {
    const c = contract({
      valor_contrato: 200_000_000,
      // La entidad declara un pago alto...
      valor_pagado: 180_000_000,
      // ...pero ninguna factura figura pagada en el plan.
      pagos_filas: 4,
      pagos_confirmados: 0,
      fecha_inicio: "2025-01-01",
      fecha_fin: "2025-04-11",
    });
    expect(run(c)).toBeNull();
  });

  it("cae al dataset de contratos cuando no hay plan de pagos", () => {
    const f = run(conPagado(70_000_000))!;
    expect(f.evidence.fuente_del_pago).toBe("dataset_de_contratos");
  });
});

describe("DESEQUILIBRIO_PAGOS — dispara", () => {
  it("con una brecha de exactamente 25 pp (umbral inclusivo de METODOLOGIA §3)", () => {
    // 35% pagado contra 10% de tiempo = 25.00 pp
    const f = run(conPagado(70_000_000));
    expect(f).not.toBeNull();
    expect(f!.evidence.brecha_puntos_porcentuales).toBe(25);
  });

  it("con 25 puntos, severidad alta, confianza alta y foco entidad", () => {
    const f = run(conPagado(180_000_000))!;
    expect(f.points).toBe(25);
    expect(f.severity).toBe("alta");
    expect(f.confianza).toBe("alta");
    expect(f.foco).toBe("entidad");
    expect(f.source).toBe("rules");
  });

  it("con evidence de cifras concretas, no texto genérico", () => {
    const f = run(conPagado(70_000_000))!;
    expect(f.evidence).toMatchObject({
      valor_contrato: 200_000_000,
      valor_pagado: 70_000_000,
      valor_pendiente: 130_000_000,
      pct_pagado: 0.35,
      pct_tiempo_transcurrido: 0.1,
      dias_transcurridos: 10,
      dias_totales: 100,
      umbral_puntos_porcentuales: 25,
      plazo_minimo_dias: 60,
      evaluado_el: HOY,
    });
  });

  it("citando la norma solo desde el catálogo, sin inventarla", () => {
    const { detail } = run(conPagado(70_000_000))!;
    expect(detail).toContain("Ley 1474 de 2011, arts. 83-84");
    expect(detail).not.toMatch(/corrupci|delito|fraude|culpab/i);
  });
});

describe("DESEQUILIBRIO_PAGOS — no dispara", () => {
  it("con una brecha de 24 pp, justo debajo del umbral", () => {
    expect(run(conPagado(68_000_000))).toBeNull();
  });

  it("cuando los pagos van al ritmo del tiempo transcurrido", () => {
    expect(run(conPagado(24_000_000))).toBeNull();
  });

  it("cuando el plazo total no supera los 60 días (METODOLOGIA §3)", () => {
    const c = conPagado(180_000_000);
    c.fecha_fin = "2025-03-01"; // 59 días
    expect(run(c)).toBeNull();
  });

  it("pero sí con 61 días de plazo", () => {
    const c = conPagado(180_000_000);
    c.fecha_fin = "2025-03-03"; // 61 días
    expect(run(c)).not.toBeNull();
  });

  it("cuando el valor no llega al piso de materialidad", () => {
    const c = conPagado(45_000_000);
    c.valor_contrato = 50_000_000;
    expect(run(c)).toBeNull();
  });

  it("cuando el contrato ya terminó", () => {
    expect(run(conPagado(180_000_000), "2025-05-01")).toBeNull();
  });

  it("el mismo día en que vence, porque ya no queda plazo por delante", () => {
    expect(run(conPagado(180_000_000), "2025-04-11")).toBeNull();
  });

  it("cuando el contrato todavía no empieza", () => {
    expect(run(conPagado(180_000_000), "2024-12-15")).toBeNull();
  });

  it("en contratos que nunca se ejecutaron", () => {
    const c = conPagado(180_000_000);
    c.vigencia = "otro";
    expect(run(c)).toBeNull();
  });

  it("en contratos con valor reportado inverosímil", () => {
    const c = conPagado(180_000_000);
    c.valor_verificar = true;
    expect(run(c)).toBeNull();
  });
});

describe("DESEQUILIBRIO_PAGOS — bordes de datos ausentes", () => {
  it.each([
    ["valor_contrato nulo", { valor_contrato: null }],
    ["valor_contrato cero, que dividiría por cero", { valor_contrato: 0 }],
    ["valor_pagado nulo", { valor_pagado: null }],
    ["sin fecha de inicio", { fecha_inicio: null }],
    ["sin fecha de fin", { fecha_fin: null }],
    ["fecha de fin anterior a la de inicio", { fecha_fin: "2024-12-01" }],
    ["duración de cero días", { fecha_fin: "2025-01-01" }],
  ])("se abstiene con %s", (_titulo, patch) => {
    const c = conPagado(180_000_000);
    Object.assign(c, patch);
    expect(run(c)).toBeNull();
  });

  it("valor_pagado en cero nunca es desequilibrio", () => {
    expect(run(conPagado(0))).toBeNull();
  });
});
