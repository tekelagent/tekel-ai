#!/usr/bin/env tsx
/**
 * Carga los snapshots de PACO a las tablas paco_*.
 *
 * Idempotente por reemplazo: cada tabla se vacía y se recarga entera. Son
 * fotos con fecha, no un flujo incremental, así que reemplazar es más honesto
 * que intentar mezclar dos snapshots distintos.
 *
 * Uso:
 *   infisical run --env=dev -- pnpm load-paco
 *   infisical run --env=dev -- pnpm load-paco --check   (valida mapeo, no carga)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values: args } = parseArgs({
  options: {
    dir: { type: "string", default: "data/paco" },
    check: { type: "boolean", default: false },
    fecha: { type: "string" },
  },
});

const DIR = args.dir;
const SNAPSHOT = args.fecha ?? new Date().toISOString().slice(0, 10);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!args.check && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null;

/** Parser CSV mínimo con comillas y saltos de línea embebidos. */
function parseCSV(texto: string, sep = ","): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (enComillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else enComillas = false;
      } else campo += ch;
      continue;
    }
    if (ch === '"') enComillas = true;
    else if (ch === sep) {
      fila.push(campo);
      campo = "";
    } else if (ch === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else if (ch !== "\r") campo += ch;
  }
  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}

const limpiar = (s: string | undefined): string | null => {
  const v = (s ?? "").trim();
  if (!v || v.toLowerCase() === "nan" || v.toLowerCase() === "no definido") return null;
  return v;
};

/** Solo dígitos: los documentos vienen con puntos, guiones y DV pegado. */
const soloDigitos = (s: string | undefined): string | null => {
  const v = (s ?? "").replace(/\D/g, "");
  return v.length >= 5 ? v : null;
};

const aNumero = (s: string | undefined): number | null => {
  const v = Number((s ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) ? v : null;
};

const aFecha = (s: string | undefined): string | null => {
  const v = (s ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};

function leer(path: string): string {
  return readFileSync(path, "utf8");
}

/** El único .txt dentro de una carpeta descomprimida. */
function txtEn(carpeta: string): string | null {
  const p = join(DIR, carpeta);
  try {
    if (!statSync(p).isDirectory()) return null;
    const f = readdirSync(p).find((x) => x.endsWith(".txt") || x.endsWith(".csv"));
    return f ? join(p, f) : null;
  } catch {
    return null;
  }
}

type Cargador = {
  tabla: string;
  archivo: string | null;
  /** Mapea filas crudas (sin encabezado) a filas de la tabla. */
  mapear: (filas: string[][]) => Record<string, unknown>[];
  conEncabezado: boolean;
};

const CARGADORES: Cargador[] = [
  {
    tabla: "paco_responsabilidades_fiscales",
    archivo: join(DIR, "responsabilidades_fiscales.csv"),
    conEncabezado: true,
    mapear: (filas) =>
      filas
        .map((f) => ({
          documento: soloDigitos(f[1]),
          nombre: limpiar(f[0]),
          entidad_afectada: limpiar(f[2]),
          departamento: limpiar(f[6]),
          municipio: limpiar(f[7]),
          snapshot_fecha: SNAPSHOT,
          raw: { responsable: f[0], documento: f[1], entidad: f[2], tr: f[3], r: f[4], ente: f[5] },
        }))
        .filter((r) => r.documento),
  },
  {
    tabla: "paco_colusiones",
    archivo: join(DIR, "colusiones_en_contratacion_SIC.csv"),
    conEncabezado: true,
    mapear: (filas) =>
      filas
        .map((f) => ({
          documento: soloDigitos(f[9]),
          nombre: limpiar(f[8]),
          tipo_persona: limpiar(f[7]),
          caso: limpiar(f[3]),
          falta: limpiar(f[4]),
          resolucion_sancion: limpiar(f[6]),
          multa_inicial: aNumero(f[10]),
          fecha_radicacion: aFecha(f[1]),
          snapshot_fecha: SNAPSHOT,
          raw: { radicado: f[2], apertura: f[5], anio: f[11] },
        }))
        .filter((r) => r.documento),
  },
  {
    tabla: "paco_multas",
    archivo: txtEn("multas_SECOP_Cleaned"),
    // Sin encabezado: la primera línea ya es un registro.
    conEncabezado: false,
    mapear: (filas) =>
      filas
        .map((f) => ({
          documento: soloDigitos(f[5]),
          nombre: limpiar(f[6]),
          entidad: limpiar(f[0]),
          nit_entidad: soloDigitos(f[1]),
          resolucion: limpiar(f[4]),
          referencia: limpiar(f[7]),
          valor_multa: aNumero(f[8]),
          fecha: aFecha(f[9]),
          url: limpiar(f[10]),
          snapshot_fecha: SNAPSHOT,
          raw: { orden: f[2], tipo_entidad: f[3], extra: f.slice(11) },
        }))
        .filter((r) => r.documento),
  },
  {
    tabla: "paco_siri",
    archivo: txtEn("antecedentes_SIRI_sanciones_Cleaned"),
    conEncabezado: false,
    mapear: (filas) =>
      filas
        .map((f) => {
          const fecha = aFecha(f[19]);
          const anios = aNumero(f[14]) ?? 0;
          const meses = aNumero(f[15]) ?? 0;
          const dias = aNumero(f[16]) ?? 0;
          // Vigencia solo cuando la sanción declara plazo. Sin plazo no se
          // afirma inhabilidad activa: el hallazgo saldrá con confianza media.
          let vigenteHasta: string | null = null;
          if (fecha && (anios || meses || dias)) {
            const d = new Date(`${fecha}T00:00:00Z`);
            d.setUTCFullYear(d.getUTCFullYear() + Math.floor(anios));
            d.setUTCMonth(d.getUTCMonth() + Math.floor(meses));
            d.setUTCDate(d.getUTCDate() + Math.floor(dias));
            vigenteHasta = d.toISOString().slice(0, 10);
          }
          return {
            documento: soloDigitos(f[5]),
            tipo_documento: limpiar(f[4]),
            nombre: [f[8], f[9], f[6], f[7]].map((x) => (x ?? "").trim()).filter(Boolean).join(" "),
            sancion: limpiar(f[13]),
            duracion_anios: aNumero(f[14]),
            duracion_meses: aNumero(f[15]),
            duracion_dias: aNumero(f[16]),
            fecha_providencia: fecha,
            vigente_hasta: vigenteHasta,
            entidad: limpiar(f[21]),
            cargo: limpiar(f[10]),
            snapshot_fecha: SNAPSHOT,
            raw: { id_siri: f[0], tipo: f[1], calidad: f[2], instancia: f[17], autoridad: f[18], radicado: f[20], duracion_txt: f[27] },
          };
        })
        .filter((r) => r.documento),
  },
  {
    tabla: "paco_obras_inconclusas",
    archivo: join(DIR, "MD-2000-2011.xls"),
    conEncabezado: true,
    mapear: (filas) =>
      filas
        .map((f) => ({
          // Índices del encabezado real del archivo (81 columnas).
          codigo_secop: limpiar(f[47]),
          documento: soloDigitos(f[30]),
          nombre: limpiar(f[31]),
          nit_entidad: soloDigitos(f[76]),
          entidad: limpiar(f[77]) ?? limpiar(f[52]),
          objeto: limpiar(f[43]),
          valor_contrato: aNumero(f[44]),
          estado: limpiar(f[10]),
          departamento: limpiar(f[35]),
          ciudad: limpiar(f[37]),
          snapshot_fecha: SNAPSHOT,
          raw: { cod_obra: f[2], numero_contrato: f[41], esta_secop: f[46], clase_obra: f[64] },
        }))
        .filter((r) => r.codigo_secop || r.documento),
  },
];

async function main() {
  console.log(`Carga PACO — snapshot ${SNAPSHOT}${args.check ? " (solo validación)" : ""}\n`);

  for (const c of CARGADORES) {
    if (!c.archivo) {
      console.log(`  ${c.tabla.padEnd(34)} SIN ARCHIVO`);
      continue;
    }
    let filas: string[][];
    try {
      filas = parseCSV(leer(c.archivo));
    } catch (err) {
      console.log(`  ${c.tabla.padEnd(34)} ERROR leyendo: ${(err as Error).message}`);
      continue;
    }
    const datos = c.conEncabezado ? filas.slice(1) : filas;
    const mapeadas = c.mapear(datos);

    console.log(`  ${c.tabla.padEnd(34)} ${String(datos.length).padStart(6)} filas -> ${String(mapeadas.length).padStart(6)} con documento`);

    if (args.check) {
      // Validación del mapeo contra filas reales, antes de la carga masiva.
      for (const m of mapeadas.slice(0, 3)) {
        const vista = Object.fromEntries(
          Object.entries(m).filter(([k]) => k !== "raw" && k !== "snapshot_fecha"),
        );
        console.log(`      ${JSON.stringify(vista)}`);
      }
      console.log("");
      continue;
    }

    // Reemplazo completo: los snapshots no se mezclan.
    const { error: delErr } = await supabase!.from(c.tabla).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (delErr) {
      console.log(`      ERROR vaciando: ${delErr.message}`);
      continue;
    }
    for (let i = 0; i < mapeadas.length; i += 500) {
      const { error } = await supabase!.from(c.tabla).insert(mapeadas.slice(i, i + 500));
      if (error) {
        console.log(`      ERROR insertando: ${error.message}`);
        break;
      }
    }
    console.log(`      cargadas ${mapeadas.length}`);
  }

  console.log(`\n${args.check ? "Validación" : "Carga"} terminada.`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
