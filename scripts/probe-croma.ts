#!/usr/bin/env tsx
/**
 * Sondeo de la API de Croma — planeación de la Capa C.
 *
 * NO guarda nada en base de datos. Solo determina, por endpoint:
 * accesible sí/no, forma de la respuesta, y costo/créditos si la plataforma lo
 * expone en cabeceras o cuerpo.
 *
 * Uso:
 *   infisical run --env=dev -- pnpm probe-croma
 *   infisical run --env=dev -- pnpm probe-croma --nit 901100455
 *
 * La llave nunca se imprime, ni entera ni parcial.
 */
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    nit: { type: "string", default: "901100455" },
    base: { type: "string" },
  },
});

const API_KEY = process.env.CROMA_API_KEY;
if (!API_KEY) {
  console.error("Falta CROMA_API_KEY. Lanza con: infisical run --env=dev -- pnpm probe-croma");
  process.exit(1);
}

const NIT = args.nit;

/** Candidatos de URL base, en orden de probabilidad. */
const BASES = args.base
  ? [args.base]
  : [
      "https://api.usecroma.com/v1",
      "https://api.usecroma.com",
      "https://api.croma.gov.co/v1",
      "https://usecroma.com/api/v1",
    ];

/** Formas de autenticación a probar. */
const AUTHS: Array<{ nombre: string; headers: Record<string, string> }> = [
  { nombre: "Bearer", headers: { Authorization: `Bearer ${API_KEY}` } },
  { nombre: "X-API-Key", headers: { "X-API-Key": API_KEY } },
  { nombre: "x-croma-key", headers: { "x-croma-key": API_KEY } },
];

const UA = "TekelAgent/0.1 (auditoria de contratacion publica; +https://github.com/tekelagent/tekel-ai)";

/** Los 8 endpoints que usará la Capa C, con sus parámetros de prueba. */
const ENDPOINTS = [
  { clave: "rues/entity-by-nit", paths: ["rues-entity-by-nit", "colombia/rues/entity-by-nit"], params: { nit: NIT } },
  { clave: "contraloria/fiscal-records", paths: ["contraloria-fiscal-records", "colombia/contraloria/fiscal-records"], params: { document: NIT } },
  { clave: "procuraduria/disciplinary-records", paths: ["procuraduria-disciplinary-records", "colombia/procuraduria/disciplinary-records"], params: { document: NIT } },
  { clave: "contaduria/state-delinquent-debtors", paths: ["contaduria-state-delinquent-debtor-records", "colombia/contaduria/state-delinquent-debtors"], params: { document: NIT } },
  { clave: "secop/contracts-by-provider", paths: ["secop-contracts-by-provider", "colombia/secop/contracts-by-provider"], params: { document: NIT } },
  { clave: "secop/sanctions-by-provider", paths: ["secop-sanctions-by-provider", "colombia/secop/sanctions-by-provider"], params: { document: NIT } },
  { clave: "legalize/laws", paths: ["colombia-laws-search", "legalize/laws", "colombia/laws/search"], params: { query: "ley 80 de 1993" } },
  { clave: "ancp-cce/conceptos-search", paths: ["ancp-cce-conceptos-search", "colombia/ancp-cce/conceptos-search"], params: { query: "adición 50%" } },
];

/** Cabeceras que suelen llevar información de cuota o costo. */
const CABECERAS_COSTO = [
  "x-credits-remaining",
  "x-credits-used",
  "x-ratelimit-remaining",
  "x-ratelimit-limit",
  "x-request-cost",
  "x-quota-remaining",
];

function describirForma(v: unknown, prof = 0): string {
  if (v === null) return "null";
  if (Array.isArray(v)) {
    return prof >= 2 ? "array" : `array[${v.length}] de ${v.length ? describirForma(v[0], prof + 1) : "?"}`;
  }
  if (typeof v === "object") {
    const k = Object.keys(v as object);
    if (prof >= 2) return `object{${k.length} claves}`;
    return `{ ${k.slice(0, 12).join(", ")}${k.length > 12 ? ", …" : ""} }`;
  }
  return typeof v;
}

async function intentar(url: string, headers: Record<string, string>) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, {
      headers: { ...headers, Accept: "application/json", "User-Agent": UA },
      signal: ctrl.signal,
    });
    const texto = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(texto);
    } catch {
      /* no era JSON */
    }
    const costo: Record<string, string> = {};
    for (const h of CABECERAS_COSTO) {
      const v = res.headers.get(h);
      if (v) costo[h] = v;
    }
    return { status: res.status, json, texto, costo };
  } catch (err) {
    return { status: 0, json: null, texto: String((err as Error).message), costo: {} };
  } finally {
    clearTimeout(t);
  }
}

/** Determina base + esquema de auth probando el endpoint más simple. */
async function descubrirBase(): Promise<{ base: string; auth: (typeof AUTHS)[number] } | null> {
  console.log("Descubriendo URL base y esquema de autenticación…\n");
  for (const base of BASES) {
    for (const auth of AUTHS) {
      const url = `${base}/rues-entity-by-nit?nit=${NIT}`;
      const r = await intentar(url, auth.headers);
      const marca = r.status === 200 ? "OK" : r.status === 401 || r.status === 403 ? "auth" : String(r.status);
      console.log(`  ${String(marca).padStart(4)}  ${auth.nombre.padEnd(12)} ${base}`);
      if (r.status === 200) return { base, auth };
      // 401/403 significa que la base existe pero la auth no encaja: seguimos
      // probando esquemas sobre esa misma base.
    }
  }
  return null;
}

async function main() {
  console.log(`Sondeo Croma — NIT de prueba: ${NIT}`);
  console.log(`(la llave nunca se imprime)\n`);

  const encontrado = await descubrirBase();
  if (!encontrado) {
    console.log("\nNinguna combinación de base + auth devolvió 200.");
    console.log("Los códigos de arriba dicen si la base existe (401/403) o no (0/404).");
    console.log("Hace falta la URL base real de la documentación autenticada de Croma.");
    return;
  }

  const { base, auth } = encontrado;
  console.log(`\nBase: ${base}   ·   Auth: ${auth.nombre}\n`);
  console.log("═".repeat(78));

  for (const ep of ENDPOINTS) {
    console.log(`\n${ep.clave}`);
    let ok = false;
    for (const path of ep.paths) {
      const qs = new URLSearchParams(ep.params as Record<string, string>).toString();
      const url = `${base}/${path}?${qs}`;
      const r = await intentar(url, auth.headers);
      if (r.status === 200) {
        ok = true;
        console.log(`  accesible:  SÍ   (${path})`);
        console.log(`  forma:      ${describirForma(r.json)}`);
        if (Object.keys(r.costo).length) {
          console.log(`  costo:      ${JSON.stringify(r.costo)}`);
        } else {
          console.log(`  costo:      la plataforma no lo expone en cabeceras`);
        }
        break;
      }
      console.log(`  ${String(r.status).padStart(4)}  ${path}`);
    }
    if (!ok) console.log(`  accesible:  NO`);
    // Cortesía hacia la API.
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n${"═".repeat(78)}`);
  console.log("Sondeo terminado. No se guardó nada en base de datos.");
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
