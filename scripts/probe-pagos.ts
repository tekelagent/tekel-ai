#!/usr/bin/env tsx
/**
 * Sondeo del dataset SECOP II - Plan de pagos (uymx-8p3j) contra nuestro corpus.
 *
 * Por qué existe: 12.784 contratos vigentes reportan valor_pagado = 0 en el
 * dataset de contratos, y 7.929 de ellos están "En ejecución". Ese cero no es
 * "no se ha pagado", es "la entidad no reportó". Este dataset trae el plan de
 * pagos factura por factura, con `fecha_real_de_pago`, así que puede convertir
 * un vacío en un hecho verificable.
 *
 * Antes de ingestar 20,8 millones de filas hay que medir tres cosas:
 *   1. ¿Qué fracción de nuestros contratos tiene filas allá? (cobertura)
 *   2. ¿En qué estados están y cuántos traen fecha real de pago? (utilidad)
 *   3. ¿El total facturado cuadra con valor_contrato? (sanidad)
 *
 * Uso: infisical run --env=dev -- pnpm tsx scripts/probe-pagos.ts
 */
import { createClient } from "@supabase/supabase-js";

const DATASET = "uymx-8p3j";
const BASE = `https://www.datos.gov.co/resource/${DATASET}.json`;
const TOKEN = process.env.SOCRATA_APP_TOKEN;

/** IDs por consulta. Socrata acepta URLs largas, pero 40 mantiene la latencia sana. */
const LOTE = 40;
/** Contratos a sondear por cada grupo. Muestra, no censo. */
const MUESTRA = 200;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

type FilaPago = {
  id_del_contrato: string;
  estado?: string;
  valor_a_pagar?: string;
  fecha_real_de_pago?: string;
};

async function socrata(where: string, limit = 5000): Promise<FilaPago[]> {
  const url = `${BASE}?$where=${encodeURIComponent(where)}&$limit=${limit}`;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const res = await fetch(url, {
        headers: TOKEN ? { "X-App-Token": TOKEN } : {},
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as FilaPago[];
    } catch (e) {
      if (intento === 3) throw e;
      await new Promise((r) => setTimeout(r, 1500 * intento));
    }
  }
  return [];
}

function enLotes<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

type Contrato = {
  id_contrato: string;
  valor_contrato: number | null;
  valor_pagado: number | null;
  estado_contrato: string | null;
};

async function sondear(etiqueta: string, contratos: Contrato[]) {
  console.log(`\n===== ${etiqueta} (${contratos.length} contratos) =====`);
  const porId = new Map(contratos.map((c) => [c.id_contrato, c]));
  const filasPorContrato = new Map<string, FilaPago[]>();

  for (const lote of enLotes([...porId.keys()], LOTE)) {
    const lista = lote.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    const filas = await socrata(`id_del_contrato in(${lista})`);
    for (const f of filas) {
      const arr = filasPorContrato.get(f.id_del_contrato) ?? [];
      arr.push(f);
      filasPorContrato.set(f.id_del_contrato, arr);
    }
    process.stdout.write(".");
  }
  console.log("");

  const conFilas = filasPorContrato.size;
  console.log(
    `Cobertura       : ${conFilas}/${contratos.length} ` +
      `(${((conFilas / contratos.length) * 100).toFixed(1)}%) tienen plan de pagos`,
  );

  const porEstado = new Map<string, number>();
  let conFechaReal = 0;
  let totalFilas = 0;
  for (const filas of filasPorContrato.values()) {
    for (const f of filas) {
      totalFilas++;
      const e = f.estado ?? "(vacío)";
      porEstado.set(e, (porEstado.get(e) ?? 0) + 1);
      if (f.fecha_real_de_pago) conFechaReal++;
    }
  }
  console.log(`Filas de pago   : ${totalFilas}`);
  console.log(
    `Con fecha real  : ${conFechaReal} (${totalFilas ? ((conFechaReal / totalFilas) * 100).toFixed(1) : 0}%)`,
  );
  console.log("Estados:");
  for (const [e, n] of [...porEstado].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${e.padEnd(34)} ${n}`);
  }

  // Sanidad: ¿lo pagado según el plan cabe dentro del valor del contrato?
  let cuadran = 0;
  let exceden = 0;
  let sinPagoConfirmado = 0;
  const ejemplos: string[] = [];
  for (const [id, filas] of filasPorContrato) {
    const c = porId.get(id)!;
    const pagado = filas
      .filter((f) => f.fecha_real_de_pago)
      .reduce((s, f) => s + num(f.valor_a_pagar), 0);
    const valor = c.valor_contrato ?? 0;
    if (pagado === 0) sinPagoConfirmado++;
    else if (valor > 0 && pagado <= valor * 1.05) cuadran++;
    else exceden++;
    if (ejemplos.length < 4 && pagado > 0) {
      ejemplos.push(
        `  ${id}  contrato=${valor.toLocaleString("es-CO")}  ` +
          `pagado_plan=${pagado.toLocaleString("es-CO")}  ` +
          `pagado_secop=${(c.valor_pagado ?? 0).toLocaleString("es-CO")}`,
      );
    }
  }
  console.log(
    `Sanidad         : ${cuadran} cuadran, ${exceden} exceden el valor, ` +
      `${sinPagoConfirmado} sin ningún pago confirmado`,
  );
  if (ejemplos.length) {
    console.log("Ejemplos con pago confirmado:");
    ejemplos.forEach((e) => console.log(e));
  }
}

async function main() {
  // Grupo 1: el agujero. Vigentes, en ejecución, sin pago reportado en SECOP.
  const { data: huecos, error: e1 } = await supabase
    .from("contracts")
    .select("id_contrato,valor_contrato,valor_pagado,estado_contrato")
    .eq("vigencia", "vigente")
    .eq("valor_pagado", 0)
    .ilike("estado_contrato", "%ejecu%")
    .limit(MUESTRA);
  if (e1) throw new Error(e1.message);

  // Grupo 2: control. Vigentes que SÍ reportan pagos — para validar que el
  // plan de pagos coincide con lo que SECOP ya dice.
  const { data: control, error: e2 } = await supabase
    .from("contracts")
    .select("id_contrato,valor_contrato,valor_pagado,estado_contrato")
    .eq("vigencia", "vigente")
    .gt("valor_pagado", 0)
    .limit(MUESTRA);
  if (e2) throw new Error(e2.message);

  await sondear("SIN pago reportado (el agujero)", (huecos ?? []) as Contrato[]);
  await sondear("CON pago reportado (control)", (control ?? []) as Contrato[]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
