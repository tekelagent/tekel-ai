#!/usr/bin/env tsx
/**
 * S7 — prueba de aceptación: un contrato FUERA del corpus atraviesa toda la
 * cadena sin intervención.
 *
 * Socrata → reglas → forense (Croma) → documentos → pliego → expediente.
 *
 * Imprime el log completo tal como lo verá el usuario en la plataforma.
 *
 * Uso:
 *   pnpm e2e-analisis
 *   pnpm e2e-analisis --contrato CO1.PCCNTR.320645 --base http://localhost:3000
 */
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    contrato: { type: "string", default: "CO1.PCCNTR.320645" },
    base: { type: "string", default: "http://localhost:3000" },
    "max-pasos": { type: "string", default: "8" },
  },
});

const BASE = args.base.replace(/\/$/, "");
const ID = args.contrato;
const MAX_PASOS = Number(args["max-pasos"]) || 8;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Estado = {
  status: string;
  stage: string | null;
  log: Array<{ ts: string; msg: string }>;
  cost_usd: number;
  terminado: boolean;
  error?: string;
  traido_en_vivo?: boolean;
  desde_cache?: boolean;
};

async function llamar(path: string, metodo = "POST"): Promise<Estado> {
  const res = await fetch(`${BASE}${path}`, { method: metodo });
  const json = (await res.json()) as Estado;
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

function pintar(log: Array<{ ts: string; msg: string }>, desde: number) {
  for (const l of log.slice(desde)) {
    const hora = l.ts.slice(11, 19);
    console.log(`  ${hora}  ${l.msg}`);
  }
  return log.length;
}

async function main() {
  console.log(`Prueba de aceptación E2E`);
  console.log(`Contrato: ${ID}  (fuera del corpus)`);
  console.log(`Base:     ${BASE}\n${"═".repeat(76)}`);

  const t0 = Date.now();

  console.log(`\n▸ START`);
  const inicio = await llamar(`/api/analysis/${encodeURIComponent(ID)}/start`);
  console.log(
    `  traído en vivo: ${inicio.traido_en_vivo ? "sí" : "no"} · desde caché: ${inicio.desde_cache ? "sí" : "no"}`,
  );
  let vistas = pintar(inicio.log ?? [], 0);

  let estado: Estado = inicio;
  for (let paso = 1; paso <= MAX_PASOS && !estado.terminado; paso++) {
    console.log(`\n▸ ADVANCE ${paso}`);
    estado = await llamar(`/api/analysis/${encodeURIComponent(ID)}/advance`);
    vistas = pintar(estado.log ?? [], vistas);
    console.log(`  → status: ${estado.status} · stage: ${estado.stage ?? "—"}`);
    if (estado.status === "needs_upload") {
      console.log(`  (el flujo espera el PDF del usuario; en la UI aquí aparece el dropzone)`);
      break;
    }
    await sleep(500);
  }

  console.log(`\n${"═".repeat(76)}\n▸ EXPEDIENTE`);
  const res = await fetch(`${BASE}/api/contracts/${encodeURIComponent(ID)}`);
  const exp = (await res.json()) as any;
  if (!res.ok) {
    console.log(`  error: ${exp.error}`);
    return;
  }

  const e = exp.expediente;
  console.log(`  ${e.encabezado.id_contrato}`);
  console.log(`  entidad:     ${e.encabezado.entidad}`);
  console.log(`  contratista: ${e.encabezado.contratista} (${e.encabezado.documento_proveedor})`);
  console.log(`  valor:       ${e.encabezado.valor_contrato}`);
  console.log(`  vigencia:    ${e.encabezado.vigencia}`);
  console.log(`  prioridad:   ${e.triaje.prioridad ?? "sin prioridad"} · score ${e.triaje.risk_score}`);
  console.log(`  plata en riesgo: ${e.triaje.plata_en_riesgo}`);
  console.log(`\n  hallazgos (${e.hallazgos.length}):`);
  for (const h of e.hallazgos) {
    console.log(`    · ${h.pattern_code} — confianza ${h.confianza}, foco ${h.foco}`);
  }
  console.log(`\n  por qué ahora:`);
  for (const r of e.triaje.porque_ahora) console.log(`    · ${r}`);

  const c = exp.capa_c;
  console.log(`\n  Capa C: ${c ? `${c.status} · costo $${c.costo_usd}` : "no ejecutada"}`);
  if (c?.forensic) {
    const f = c.forensic as any;
    console.log(`    llamadas Croma: ${f.llamadas} · omitidas: ${(f.omitidos ?? []).length}`);
    console.log(`    RUES: ${f.rues ? "consultado" : "—"} · Contraloría: ${f.contraloria ? "consultado" : "—"}`);
    console.log(`    Procuraduría: ${f.procuraduria ? "consultado" : "—"} · Contaduría: ${f.contaduria ? "consultado" : "—"}`);
  }

  console.log(`\n${"═".repeat(76)}`);
  console.log(`Tiempo total: ${((Date.now() - t0) / 1000).toFixed(1)}s · estado final: ${estado.status}`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
