/**
 * Punto de entrada de la Capa A.
 *
 * Solo re-exporta: el registro de reglas vive en `registry.ts` y el runner en
 * `runner.ts`, para que el runner pueda importar `RULES` sin crear un ciclo
 * a través de este barril.
 */
export * from "./catalog";
export * from "./format";
export * from "./registry";
export * from "./runner";
export * from "./score";
export * from "./thresholds";
export * from "./types";
