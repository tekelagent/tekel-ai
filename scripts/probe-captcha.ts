#!/usr/bin/env tsx
/**
 * S3 — anatomía del muro de reCAPTCHA de SECOP II.
 *
 * S2 dejó claro que el muro no se esquiva con sigilo. Antes de pagar un
 * solucionador hay que saber exactamente qué se está comprando, y sobre todo
 * CUÁNTAS veces hay que comprarlo:
 *
 *   1. Variante exacta (v2 / v3 / enterprise) y sitekey → fija el precio unitario.
 *   2. ¿El muro es por sesión o por página? → fija la cantidad. Si una sola
 *      resolución habilita la sesión completa, 255 contratos cuestan 1 captcha,
 *      no 255. Es la diferencia entre centavos y decenas de dólares.
 *
 * La prueba de (2) es directa: se visita una página, se vuelve a visitar otra
 * distinta en el MISMO contexto y se mira si el interstitial reaparece.
 *
 * Uso:
 *   infisical run --env=dev -- pnpm probe-captcha
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const { values: args } = parseArgs({
  options: {
    notices: { type: "string", default: "CO1.NTC.9048155,CO1.NTC.10051804" },
    out: { type: "string", default: "data/probe-captcha.json" },
    headed: { type: "boolean", default: false },
  },
});

const NOTICES = args.notices.split(",").map((s) => s.trim());
const detalle = (n: string) =>
  `https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=${n}&isFromPublicArea=True&isModal=False`;

async function main() {
  console.log(`S3 — anatomía del captcha de SECOP II\n${"═".repeat(74)}`);

  const browser = await chromium.launch({ headless: !args.headed, channel: "chrome" });
  const ctx = await browser.newContext({
    locale: "es-CO",
    timezoneId: "America/Bogota",
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  const scriptsRecaptcha = new Set<string>();
  const endpointsCaptcha = new Set<string>();
  page.on("request", (req) => {
    const u = req.url();
    if (/recaptcha/i.test(u)) {
      if (req.resourceType() === "script") scriptsRecaptcha.add(u.split("&")[0]);
      else endpointsCaptcha.add(`${req.method()} ${u.slice(0, 130)}`);
    }
    if (/Captcha|Validate|Verify/i.test(u) && /secop/i.test(u)) {
      endpointsCaptcha.add(`${req.method()} ${u.slice(0, 130)}`);
    }
  });

  const visitas: Array<Record<string, unknown>> = [];

  for (const [i, notice] of NOTICES.entries()) {
    console.log(`\n▸ visita ${i + 1}: ${notice}`);
    await page.goto(detalle(notice), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const urlFinal = page.url();
    const html = await page.content();
    const hayMuro = /GoogleReCaptcha/i.test(urlFinal) || /No soy un robot|g-recaptcha/i.test(html);

    // El texto del badge distingue Enterprise de la versión gratuita mejor que
    // cualquier heurística sobre el HTML.
    const badgeEnterprise = /reCAPTCHA Enterprise/i.test(html);
    const sitekey =
      html.match(/data-sitekey=["']([A-Za-z0-9_-]{20,})["']/i)?.[1] ??
      html.match(/["']sitekey["']\s*:\s*["']([A-Za-z0-9_-]{20,})["']/i)?.[1] ??
      null;

    // A dónde manda el token una vez resuelto: es el endpoint que habilita la sesión.
    const formAction = html.match(/<form[^>]+action=["']([^"']+)["']/i)?.[1] ?? null;
    const postUrl = html.match(/url\s*:\s*["']([^"']*(?:Captcha|Validate)[^"']*)["']/i)?.[1] ?? null;

    const cookies = await ctx.cookies();
    console.log(`  url final: ${urlFinal.slice(0, 100)}`);
    console.log(`  muro: ${hayMuro ? "SÍ" : "NO"}${badgeEnterprise ? " · Enterprise" : ""}`);
    console.log(`  sitekey: ${sitekey ?? "—"}`);
    console.log(`  form action: ${formAction ?? "—"} · ajax: ${postUrl ?? "—"}`);
    console.log(`  cookies: ${cookies.map((c) => c.name).join(", ")}`);

    visitas.push({
      notice,
      urlFinal,
      hayMuro,
      badgeEnterprise,
      sitekey,
      formAction,
      postUrl,
      cookies: cookies.map((c) => ({ name: c.name, domain: c.domain, expires: c.expires })),
    });
  }

  await ctx.close();
  await browser.close();

  console.log(`\n${"═".repeat(74)}\nSCRIPTS DE RECAPTCHA CARGADOS`);
  for (const s of scriptsRecaptcha) console.log(`  ${s}`);
  console.log(`\nENDPOINTS DE VALIDACIÓN`);
  for (const e of endpointsCaptcha) console.log(`  ${e}`);

  console.log(`\n${"═".repeat(74)}\nALCANCE DEL MURO`);
  const conMuro = visitas.filter((v) => v.hayMuro).length;
  if (conMuro === visitas.length) {
    console.log(`  El interstitial aparece en las ${visitas.length} visitas del MISMO contexto.`);
    console.log(`  Sin resolverlo no se libera la sesión: el conteo de captchas`);
    console.log(`  depende de si la resolución es por sesión (probar con un solve real).`);
  } else if (conMuro > 0) {
    console.log(`  El muro aparece en ${conMuro} de ${visitas.length}: NO es incondicional.`);
  } else {
    console.log(`  Ninguna visita topó con el muro.`);
  }

  const esEnterprise = visitas.some((v) => v.badgeEnterprise);
  console.log(`\n  variante: reCAPTCHA ${esEnterprise ? "ENTERPRISE (widget checkbox v2)" : "v2"}`);
  console.log(`  sitekey:  ${visitas.find((v) => v.sitekey)?.sitekey ?? "no extraído"}`);

  mkdirSync("data", { recursive: true });
  writeFileSync(args.out, JSON.stringify({ visitas, scriptsRecaptcha: [...scriptsRecaptcha], endpointsCaptcha: [...endpointsCaptcha] }, null, 2));
  console.log(`\nDetalle en ${args.out}`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
