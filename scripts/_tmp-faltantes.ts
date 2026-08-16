import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const UA = "TekelAgent/0.1 (auditoria de contratacion publica)";
const DATASETS = ["dmgg-8hin", "nbae-kzan", "3skv-9na7", "kgcd-kt7i", "f8va-cf4m"];
const out: string[] = [];
const log = (s: string) => {
  out.push(s);
  writeFileSync("data/faltantes.txt", out.join("\n"));
};

async function soc(ds: string, qs: string) {
  const h: Record<string, string> = { "User-Agent": UA };
  if (process.env.SOCRATA_APP_TOKEN) h["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  try {
    const r = await fetch(`https://www.datos.gov.co/resource/${ds}.json?${qs}`, { headers: h });
    return r.ok ? ((await r.json()) as any[]) : [];
  } catch {
    return [];
  }
}

async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: contratos } = await sb
    .from("contracts")
    .select("id_contrato,nombre_entidad,proveedor,url_proceso,prioridad,fecha_firma,vigencia,modalidad,valor_contrato")
    .in("prioridad", ["P1", "P2"]);

  // documents tiene 15k filas y Supabase corta en 1000: hay que paginar.
  const conDocs = new Set<string>();
  for (let desde = 0; ; desde += 1000) {
    const { data } = await sb
      .from("documents")
      .select("id_contrato")
      .range(desde, desde + 999);
    if (!data?.length) break;
    for (const d of data) conDocs.add(String(d.id_contrato));
    if (data.length < 1000) break;
  }

  const faltantes = (contratos ?? []).filter((c) => !conDocs.has(String(c.id_contrato)));
  log(`contratos P1+P2: ${contratos?.length} · con documentos: ${conDocs.size} · sin: ${faltantes.length}`);

  for (const c of faltantes) {
    log(`\n${"=".repeat(66)}\n${c.prioridad} ${c.id_contrato}`);
    log(`  entidad:   ${c.nombre_entidad}`);
    log(`  proveedor: ${c.proveedor}`);
    log(`  modalidad: ${c.modalidad} · firma ${c.fecha_firma} · ${c.vigencia}`);
    log(`  valor:     ${c.valor_contrato}`);
    log(`  url:       ${c.url_proceso}`);

    for (const ds of DATASETS) {
      const r = await soc(ds, `$where=n_mero_de_contrato='${c.id_contrato}'&$limit=5`);
      if (r.length) log(`  ${ds} por contrato: ${r.length} filas`);
    }

    const cont = await soc("jbjy-vk9h", `id_contrato=${c.id_contrato}&$limit=1`);
    if (!cont.length) {
      log(`  jbjy-vk9h: SIN FILA en el dataset fuente`);
      continue;
    }
    const idsCo1 = [...new Set(Object.entries(cont[0])
      .filter(([, v]) => /^CO1\./.test(String(v)))
      .map(([k, v]) => `${k}=${v}`))];
    log(`  identificadores: ${idsCo1.join(" · ")}`);
    log(`  proceso_de_compra: ${cont[0].proceso_de_compra ?? "—"}`);

    for (const val of new Set(idsCo1.map((s) => s.split("=")[1]))) {
      for (const ds of DATASETS) {
        const r = await soc(ds, `proceso=${val}&$limit=10`);
        if (r.length) {
          log(`  ➜ ${ds} por proceso=${val}: ${r.length} documentos`);
          for (const d of r.slice(0, 8)) log(`      ${String(d.nombre_archivo).slice(0, 62)}`);
        }
      }
    }
  }
  log(`\nFIN`);
}
main().catch((e) => log(`ERROR ${e.message}`));
