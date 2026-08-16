import { describe, expect, it } from "vitest";
import { detallePlataEnRiesgo, patronesIndependientes, plataEnRiesgo, triar } from "../priority";
import { PISO_MATERIALIDAD_COP } from "../thresholds";
import { contract, finding } from "./fixtures";

const HOY = "2026-08-15";
const opts = { today: HOY };

/** Hallazgo de un patrón concreto, con sus puntos reales del catálogo. */
const f = (pattern_code: string, points: number, extra = {}) =>
  finding({ pattern_code, points, ...extra });

describe("plataEnRiesgo — METODOLOGIA §4", () => {
  it("en vigentes es lo pendiente de ejecución", () => {
    const c = contract({ vigencia: "vigente", valor_pendiente_ejecucion: 500_000_000 });
    expect(plataEnRiesgo(c)).toBe(500_000_000);
  });

  it("en vigentes cae a valor menos pagado si no hay pendiente", () => {
    const c = contract({
      vigencia: "vigente",
      valor_pendiente_ejecucion: 0,
      valor_contrato: 800_000_000,
      valor_pagado: 300_000_000,
    });
    expect(plataEnRiesgo(c)).toBe(500_000_000);
  });

  it("nunca es negativa aunque se haya pagado de más", () => {
    const c = contract({
      vigencia: "vigente",
      valor_pendiente_ejecucion: 0,
      valor_contrato: 100_000_000,
      valor_pagado: 150_000_000,
    });
    expect(plataEnRiesgo(c)).toBe(0);
  });

  it("en históricos es lo ya pagado, como techo del posible detrimento", () => {
    const c = contract({ vigencia: "historico", valor_pagado: 700_000_000 });
    expect(plataEnRiesgo(c)).toBe(700_000_000);
  });

  it("marca sin_rastro cuando no hay pagos reportados ni plan de pagos", () => {
    const c = contract({
      vigencia: "vigente",
      valor_contrato: 900_000_000,
      valor_pagado: 0,
      valor_pendiente_ejecucion: 900_000_000,
      pagos_filas: null,
    });
    const d = detallePlataEnRiesgo(c);
    // La cifra sigue siendo el valor total —el desembolso tampoco consta—
    // pero queda marcada para que la UI no la presente como hecho.
    expect(d.valor).toBe(900_000_000);
    expect(d.procedencia).toBe("sin_rastro");
  });

  it("con plan de pagos y ninguna factura pagada, el cero queda corroborado", () => {
    const c = contract({
      vigencia: "vigente",
      valor_contrato: 900_000_000,
      valor_pagado: 0,
      valor_pendiente_ejecucion: 900_000_000,
      pagos_filas: 6,
      pagos_confirmados: 0,
      pagos_en_tramite: 400_000_000,
    });
    const d = detallePlataEnRiesgo(c);
    expect(d.valor).toBe(900_000_000);
    expect(d.procedencia).toBe("corroborado");
    expect(d.enTramite).toBe(400_000_000);
  });

  it("el plan de pagos manda sobre valor_pendiente_ejecucion cuando ambos existen", () => {
    const c = contract({
      vigencia: "vigente",
      valor_contrato: 1_000_000_000,
      // SECOP dice que queda todo pendiente...
      valor_pendiente_ejecucion: 1_000_000_000,
      valor_pagado: 0,
      // ...pero el plan de pagos prueba 300M ya desembolsados.
      pagos_filas: 4,
      pagos_confirmados: 300_000_000,
    });
    const d = detallePlataEnRiesgo(c);
    expect(d.valor).toBe(700_000_000);
    expect(d.procedencia).toBe("corroborado");
  });

  it("en históricos corroborados el techo es lo pagado según el plan", () => {
    const c = contract({
      vigencia: "historico",
      valor_pagado: 0,
      pagos_filas: 3,
      pagos_confirmados: 250_000_000,
    });
    const d = detallePlataEnRiesgo(c);
    expect(d.valor).toBe(250_000_000);
    expect(d.procedencia).toBe("corroborado");
  });

  it("no se corrobora nada si el valor reportado es inverosímil", () => {
    const c = contract({
      valor_verificar: true,
      pagos_filas: 5,
      pagos_confirmados: 100_000_000,
    });
    expect(detallePlataEnRiesgo(c).procedencia).toBe("sin_rastro");
    expect(plataEnRiesgo(c)).toBeNull();
  });

  it("es null cuando el valor reportado es inverosímil (METODOLOGIA §6.8)", () => {
    const c = contract({ valor_verificar: true, valor_pendiente_ejecucion: 9e15 });
    expect(plataEnRiesgo(c)).toBeNull();
  });

  it("es null en contratos que no llegaron a ejecutarse", () => {
    const c = contract({ vigencia: "otro", estado_contrato: "Borrador" });
    expect(plataEnRiesgo(c)).toBeNull();
  });
});

describe("patronesIndependientes — corroboración de METODOLOGIA §4", () => {
  it("cuenta familias distintas, no hallazgos", () => {
    // ejecucion + seleccion = 2 familias
    expect(
      patronesIndependientes([f("DESEQUILIBRIO_PAGOS", 25), f("FRACCIONAMIENTO", 30)]),
    ).toBe(2);
  });

  it("dos patrones de la misma familia cuentan como uno", () => {
    // FRACCIONAMIENTO y CONCENTRACION_PROVEEDOR son ambos 'seleccion'
    expect(
      patronesIndependientes([f("FRACCIONAMIENTO", 30), f("CONCENTRACION_PROVEEDOR", 20)]),
    ).toBe(1);
  });

  it("los agravantes puros no cuentan para independencia", () => {
    expect(
      patronesIndependientes([
        f("DESEQUILIBRIO_PAGOS", 25),
        f("DICIEMBRE", 10),
        f("PAGO_ADELANTADO_RIESGO", 10),
      ]),
    ).toBe(1);
  });

  it("solo agravantes da cero señales independientes", () => {
    expect(patronesIndependientes([f("DICIEMBRE", 10), f("PAGO_ADELANTADO_RIESGO", 10)])).toBe(0);
  });
});

describe("triar — P1", () => {
  const vigenteGrande = () =>
    contract({
      vigencia: "vigente",
      valor_contrato: 2_000_000_000,
      valor_pendiente_ejecucion: 900_000_000,
      fecha_firma: "2025-06-01",
    });

  it("vigente, crítico, dos familias y sobre el piso de materialidad", () => {
    const t = triar(
      vigenteGrande(),
      [f("DESEQUILIBRIO_PAGOS", 25), f("FRACCIONAMIENTO", 30), f("ADICIONES_50", 40)],
      opts,
    );
    expect(t.risk_score).toBe(95);
    expect(t.risk_level).toBe("critico");
    expect(t.prioridad).toBe("P1");
  });

  it("una inhabilidad activa con confianza alta es P1 siempre, sin más requisitos", () => {
    const c = contract({ vigencia: "historico", valor_pagado: 1_000_000 });
    const t = triar(c, [f("INHABILIDAD_REP_LEGAL", 45, { confianza: "alta" })], opts);
    expect(t.prioridad).toBe("P1");
    expect(t.porque_ahora.join(" ")).toContain("inhabilidad activa");
  });

  it("una inhabilidad con confianza baja NO fuerza P1", () => {
    const c = contract({ vigencia: "historico", valor_pagado: 1_000_000 });
    const t = triar(c, [f("MOROSO_BDME", 40, { confianza: "baja" })], opts);
    expect(t.prioridad).not.toBe("P1");
  });

  it("no es P1 si las señales son de una sola familia, aunque el score sea crítico", () => {
    // seleccion + seleccion = 1 familia independiente
    const t = triar(
      vigenteGrande(),
      [f("FRACCIONAMIENTO", 30), f("CONCENTRACION_PROVEEDOR", 20), f("PLIEGO_SASTRE", 25)],
      opts,
    );
    expect(t.risk_level).toBe("critico");
    expect(t.prioridad).not.toBe("P1");
  });

  it("no es P1 si la plata en riesgo no llega al piso de materialidad", () => {
    const c = contract({
      vigencia: "vigente",
      valor_contrato: 50_000_000,
      valor_pendiente_ejecucion: 1_000_000,
    });
    const t = triar(c, [f("DESEQUILIBRIO_PAGOS", 25), f("FRACCIONAMIENTO", 30), f("ADICIONES_50", 40)], opts);
    expect(t.risk_level).toBe("critico");
    expect(t.prioridad).not.toBe("P1");
  });

  it("no es P1 si es histórico, por muy crítico que sea", () => {
    const c = contract({ vigencia: "historico", valor_pagado: 5_000_000_000, fecha_fin: "2025-01-01" });
    const t = triar(c, [f("DESEQUILIBRIO_PAGOS", 25), f("FRACCIONAMIENTO", 30), f("ADICIONES_50", 40)], opts);
    expect(t.prioridad).toBe("P2");
  });
});

describe("triar — P2", () => {
  it("crítico histórico dentro de la ventana fiscal de 5 años", () => {
    const c = contract({ vigencia: "historico", valor_pagado: 900_000_000, fecha_fin: "2024-01-15" });
    const t = triar(c, [f("EJECUCION_ANOMALA", 25), f("FRACCIONAMIENTO", 30), f("ADICIONES_50", 40)], opts);
    expect(t.prioridad).toBe("P2");
    expect(t.porque_ahora.join(" ")).toContain("dentro de la ventana");
  });

  it("crítico histórico fuera de la ventana de 5 años baja a P3", () => {
    const c = contract({ vigencia: "historico", valor_pagado: 900_000_000, fecha_fin: "2018-01-15" });
    const t = triar(c, [f("EJECUCION_ANOMALA", 25), f("FRACCIONAMIENTO", 30), f("ADICIONES_50", 40)], opts);
    expect(t.prioridad).toBe("P3");
  });

  it("vigente en banda media 40-64 con plata sobre el piso", () => {
    const c = contract({ vigencia: "vigente", valor_pendiente_ejecucion: 400_000_000 });
    const t = triar(c, [f("DESEQUILIBRIO_PAGOS", 25), f("CONCENTRACION_PROVEEDOR", 20)], opts);
    expect(t.risk_score).toBe(45);
    expect(t.prioridad).toBe("P2");
  });

  it("vigente en banda media pero por debajo del piso cae a P3", () => {
    const c = contract({ vigencia: "vigente", valor_pendiente_ejecucion: 10_000_000 });
    const t = triar(c, [f("DESEQUILIBRIO_PAGOS", 25), f("CONCENTRACION_PROVEEDOR", 20)], opts);
    expect(t.prioridad).toBe("P3");
  });
});

describe("triar — P3 y sin prioridad", () => {
  it("score 30 es el mínimo para entrar al triaje", () => {
    const c = contract();
    expect(triar(c, [f("FRACCIONAMIENTO", 30)], opts).prioridad).toBe("P3");
  });

  it("score 29 no entra al triaje", () => {
    const c = contract();
    const t = triar(c, [f("VALOR_ATIPICO", 25), f("DICIEMBRE", 4)], opts);
    expect(t.risk_score).toBe(29);
    expect(t.prioridad).toBeNull();
    expect(t.porque_ahora).toEqual([]);
  });

  it("un contrato sin hallazgos no tiene prioridad", () => {
    expect(triar(contract(), [], opts).prioridad).toBeNull();
  });

  it("los contratos que nunca se ejecutaron quedan fuera del triaje", () => {
    const c = contract({ vigencia: "otro", estado_contrato: "Borrador" });
    const t = triar(c, [f("FRACCIONAMIENTO", 30), f("ADICIONES_50", 40)], opts);
    expect(t.prioridad).toBeNull();
  });
});

describe("DICIEMBRE solo — jamás prioriza (METODOLOGIA §3)", () => {
  it("un contrato con solo DICIEMBRE no alcanza el triaje", () => {
    const t = triar(contract(), [f("DICIEMBRE", 10)], opts);
    expect(t.risk_score).toBe(10);
    expect(t.prioridad).toBeNull();
  });

  it("ni siquiera junto a PAGO_ADELANTADO_RIESGO, el otro agravante puro", () => {
    const t = triar(contract(), [f("DICIEMBRE", 10), f("PAGO_ADELANTADO_RIESGO", 10)], opts);
    expect(t.risk_score).toBe(20);
    expect(t.prioridad).toBeNull();
  });

  it("aunque el contrato sea enorme y esté vigente", () => {
    const c = contract({
      vigencia: "vigente",
      valor_contrato: 50_000_000_000,
      valor_pendiente_ejecucion: 40_000_000_000,
    });
    const t = triar(c, [f("DICIEMBRE", 10), f("PAGO_ADELANTADO_RIESGO", 10)], opts);
    expect(t.prioridad).toBeNull();
  });

  it("aporta puntos pero no señales independientes cuando acompaña a otras", () => {
    const c = contract({ vigencia: "vigente", valor_pendiente_ejecucion: 900_000_000 });
    const t = triar(
      c,
      [f("DESEQUILIBRIO_PAGOS", 25), f("FRACCIONAMIENTO", 30), f("DICIEMBRE", 10)],
      opts,
    );
    expect(t.risk_score).toBe(65);
    // 2 familias independientes (ejecucion, seleccion); DICIEMBRE no suma familia
    expect(t.prioridad).toBe("P1");
    expect(t.porque_ahora.join(" ")).toContain("no priorizan por sí solos");
  });
});

describe("porque_ahora — razones compuestas desde los datos", () => {
  it("cuantifica la plata que aún se puede detener en vigentes", () => {
    const c = contract({ vigencia: "vigente", valor_pendiente_ejecucion: 2_340_000_000 });
    const t = triar(c, [f("DESEQUILIBRIO_PAGOS", 25), f("FRACCIONAMIENTO", 30), f("ADICIONES_50", 40)], opts);
    expect(t.porque_ahora.join(" ")).toContain("2.340.000.000");
    expect(t.porque_ahora.join(" ")).toContain("sin desembolsar");
  });

  it("avisa cuando el valor reportado es inverosímil", () => {
    const c = contract({ vigencia: "vigente", valor_verificar: true });
    const t = triar(c, [f("FRACCIONAMIENTO", 30)], opts);
    expect(t.porque_ahora.join(" ")).toContain("inverosímil");
  });

  it("usa el piso de materialidad configurable", () => {
    const c = contract({ vigencia: "vigente", valor_pendiente_ejecucion: 50_000_000 });
    const findings = [f("DESEQUILIBRIO_PAGOS", 25), f("FRACCIONAMIENTO", 30), f("ADICIONES_50", 40)];
    expect(triar(c, findings, opts).prioridad).not.toBe("P1");
    expect(
      triar(c, findings, { today: HOY, pisoMaterialidad: 10_000_000 }).prioridad,
    ).toBe("P1");
  });

  it("el piso por defecto es el de METODOLOGIA §4", () => {
    expect(PISO_MATERIALIDAD_COP).toBe(100_000_000);
  });
});
