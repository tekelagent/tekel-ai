#!/usr/bin/env tsx
/**
 * S1 — spike: identificar el endpoint interno que sirve los adjuntos de SECOP II.
 *
 * SECOP II es una SPA: el HTML no trae los enlaces de documentos, así que se
 * carga la página con un navegador y se capturan TODAS las respuestas XHR/fetch
 * hasta encontrar la que devuelve los DocumentId.
 *
 * Objetivo: saber si esa petición es replicable con fetch puro (rama a) o si
 * necesita navegador (rama b). De eso depende toda la estrategia de descubrimiento.
 *
 * Imágenes, CSS y fuentes se bloquean: no aportan y multiplican el tiempo.
 *
 * Uso:
 *   pnpm spike-secop-xhr
 *   pnpm spike-secop-xhr --notice CO1.NTC.10051804 --headed
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const { values: args } = parseArgs({
  options: {
    notice: { type: "string", default: "CO1.NTC.10051804" },
    headed: { type: "boolean", default: false },
    timeout: { type: "string", default: "90000" },
    out: { type: "string", default: "data/spike-xhr.json" },
  },
});

const NOTICE = args.notice;
const TIMEOUT = Number(args.timeout) || 90_000;
const URL_PROCESO = `https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=${NOTICE}&isFromPublicArea=True&isModal=False`;

type Captura = {
  url: string;
  metodo: string;
  status: number;
  tipo: string;
  bytes: number;
  /** true si el cuerpo menciona DocumentId o nombres de archivo. */
  pareceDocumentos: boolean;
  requestHeaders: Record<string, string>;
  postData: string | null;
  muestra: string;
};

const PISTA_DOCS = /DocumentId|RetrieveFile|\.pdf|nombreDocumento|documentName|Attachment/i;

async function main() {
  console.log(`S1 — spike de XHR sobre SECOP II`);
  console.log(`notice: ${NOTICE}`);
  console.log(`url:    ${URL_PROCESO}\n${"═".repeat(74)}`);

  const browser = await chromium.launch({ headless: !args.headed });
  const ctx = await browser.newContext({
    userAgent:
      "TekelAgent/0.1 (auditoria de contratacion publica; +https://github.com/tekelagent/tekel-ai)",
    viewport: { width: 1400, height: 900 },
  });
  const page = await ctx.newPage();

  // Bloquear lo que no aporta: el spike busca datos, no pixeles.
  await page.route("**/*", (route) => {
    const t = route.request().resourceType();
    if (t === "image" || t === "stylesheet" || t === "font" || t === "media") {
      return route.abort();
    }
    return route.continue();
  });

  const capturas: Captura[] = [];

  page.on("response", async (res) => {
    const req = res.request();
    const tipo = req.resourceType();
    if (tipo !== "xhr" && tipo !== "fetch") return;
    let cuerpo = "";
    try {
      cuerpo = await res.text();
    } catch {
      /* respuesta no legible */
    }
    capturas.push({
      url: res.url(),
      metodo: req.method(),
      status: res.status(),
      tipo: res.headers()["content-type"] ?? "",
      bytes: cuerpo.length,
      pareceDocumentos: PISTA_DOCS.test(cuerpo),
      requestHeaders: req.headers(),
      postData: req.postData(),
      muestra: cuerpo.slice(0, 1200),
    });
  });

  try {
    await page.goto(URL_PROCESO, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
    // La SPA tarda en poblar; se espera a que la red se calme.
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT }).catch(() => {});

    // Intento de abrir la sección de documentos: los textos varían entre versiones.
    const candidatos = [
      "text=/documentos del proceso/i",
      "text=/ver documentos/i",
      "text=/documentos/i",
      "text=/anexos/i",
      "[id*='Document' i]",
      "a:has-text('Documento')",
    ];
    for (const sel of candidatos) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2500 })) {
          console.log(`  clic en: ${sel}`);
          await el.click({ timeout: 5000 });
          await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
          break;
        }
      } catch {
        /* siguiente candidato */
      }
    }
    await page.waitForTimeout(4000);
  } catch (err) {
    console.log(`  navegación: ${(err as Error).message.slice(0, 200)}`);
  }

  const html = await page.content().catch(() => "");
  const idsEnHtml = [...new Set([...html.matchAll(/DocumentId=([A-Za-z0-9._-]+)/gi)].map((m) => m[1]))];

  await browser.close();

  console.log(`\nXHR/fetch capturados: ${capturas.length}`);
  const conDocs = capturas.filter((c) => c.pareceDocumentos);
  console.log(`Con pistas de documentos: ${conDocs.length}`);
  console.log(`DocumentId en el DOM final: ${idsEnHtml.length}`);
  if (idsEnHtml.length) console.log(`  ${idsEnHtml.slice(0, 10).join(", ")}`);

  console.log(`\n${"═".repeat(74)}\nTODAS LAS PETICIONES XHR/FETCH`);
  for (const c of capturas) {
    console.log(
      `  ${c.pareceDocumentos ? "★" : " "} ${c.metodo.padEnd(5)} ${String(c.status).padEnd(4)} ${String(c.bytes).padStart(7)}b  ${c.url.slice(0, 110)}`,
    );
  }

  for (const c of conDocs) {
    console.log(`\n${"─".repeat(74)}`);
    console.log(`★ ${c.metodo} ${c.url}`);
    console.log(`  status ${c.status} · ${c.tipo} · ${c.bytes} bytes`);
    console.log(`  request headers:`);
    for (const [k, v] of Object.entries(c.requestHeaders)) {
      if (/^(accept|content-type|x-|cookie|authorization|referer|origin)/i.test(k)) {
        console.log(`    ${k}: ${String(v).slice(0, 120)}`);
      }
    }
    if (c.postData) console.log(`  body: ${c.postData.slice(0, 500)}`);
    console.log(`  muestra: ${c.muestra.slice(0, 700)}`);
  }

  writeFileSync(args.out, JSON.stringify({ notice: NOTICE, idsEnHtml, capturas }, null, 2));
  console.log(`\nDetalle completo en ${args.out}`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
