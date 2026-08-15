/**
 * Utilidades de formato y fecha para las reglas.
 *
 * Las fechas se manejan como strings `YYYY-MM-DD` y se parsean siempre en UTC:
 * usar la zona horaria local haría que un mismo contrato disparara o no una
 * regla según dónde corra el script.
 */

/** Milisegundos de un día. */
const DIA_MS = 86_400_000;

/** Marcas diacríticas combinantes (tildes, diéresis) que deja `normalize("NFD")`. */
const DIACRITICOS = /[̀-ͯ]/g;

/** Parsea `YYYY-MM-DD` a epoch UTC. Devuelve null si no tiene ese formato. */
export function parseDate(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
}

/** Días calendario entre dos fechas `YYYY-MM-DD`. null si alguna no es válida. */
export function daysBetween(from: string | null, to: string | null): number | null {
  const a = parseDate(from);
  const b = parseDate(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / DIA_MS);
}

/** Mes 1-12 de una fecha `YYYY-MM-DD`, o null. */
export function monthOf(s: string | null): number | null {
  const m = /^\d{4}-(\d{2})-\d{2}/.exec(s ?? "");
  return m ? Number(m[1]) : null;
}

/** Pesos colombianos sin decimales, para los textos de `detail`. */
export function formatCOP(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

/** Porcentaje con un decimal, para los textos de `detail`. */
export function formatPct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/**
 * Normaliza un objeto contractual para poder compararlo entre contratos:
 * minúsculas, sin tildes, sin puntuación y con espacios colapsados.
 * "PRESTACIÓN DE SERVICIOS." y "prestacion de servicios" pasan a ser iguales.
 */
export function normalizeObjeto(s: string | null): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clave de comparación de objetos contractuales: el objeto normalizado
 * recortado a sus primeros `chars` caracteres.
 *
 * En SECOP el objeto cierra a menudo con datos que varían entre contratos
 * equivalentes (nombre del contratista, número de contrato, vigencia), así que
 * comparar el texto completo no agrupa nada. El prefijo conserva el núcleo del
 * objeto y descarta esa cola variable.
 */
export function objetoKey(objeto: string | null, chars: number): string {
  return normalizeObjeto(objeto).slice(0, chars);
}

/** true si el número es utilizable en aritmética (no null, no NaN). */
export function isNum(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}
