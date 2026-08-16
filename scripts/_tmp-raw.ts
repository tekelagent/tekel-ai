import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const out: string[] = [];
const log = (s: string) => { out.push(s); writeFileSync("data/raw-check.txt", out.join("\n")); };

async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data } = await sb
    .from("contracts")
    .select("id_contrato,raw")
    .in("prioridad", ["P1", "P2"])
    .limit(300);

  let conProceso = 0;
  for (const c of data ?? []) {
    const p = (c.raw as any)?.proceso_de_compra;
    if (p && /^CO1\./.test(String(p))) conProceso++;
  }
  log(`contratos revisados: ${data?.length}`);
  log(`con proceso_de_compra en raw: ${conProceso}`);
  log(`ejemplo raw keys: ${Object.keys(((data ?? [])[0]?.raw as any) ?? {}).slice(0, 40).join(", ")}`);
}
main().catch((e) => log("ERROR " + e.message));
