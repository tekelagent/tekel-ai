#!/usr/bin/env tsx
/**
 * S2 — ¿el muro de reCAPTCHA de SECOP II cae con un navegador sigiloso?
 *
 * El spike anterior (`spike-secop-xhr.ts`) concluyó "rama c": ni con navegador
 * aparecen los adjuntos. Pero ese spike se presentó con
 * `User-Agent: TekelAgent/0.1 (…)`, bloqueó imágenes/CSS/fuentes y corrió
 * headless. Cualquiera de las tres cosas basta para que un WAF sirva el
 * interstitial de captcha. O sea: midió su propia huella, no la política de
 * SECOP.
 *
 * Este spike separa las dos hipótesis con una escalera de variantes que van de
 * "lo que hicimos antes" a "Chrome de verdad conducido por Playwright". La
 * pregunta que responde es binaria y decide la Fase 2:
 *
 *   ¿existe alguna configuración de navegador que llegue al detalle del proceso
 *   sin captcha? Si sí → discover-stealth.ts. Si no → solucionador de pago.
 *
 * Cuando hay captcha, extrae lo necesario para cotizarlo: sitekey y variante
 * (v2 checkbox / v3 invisible / enterprise).
 *
 * Uso:
 *   infisical run --env=dev -- pnpm spike-stealth
 *   infisical run --env=dev -- pnpm spike-stealth --variantes D,E --targets 3
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values: args } = parseArgs({
  options: {
    /** Sublista de variantes a correr, por letra. */
    variantes: { type: "string", default: "A,B,C,D,E" },
    /** Cuántos contratos P1 usar como objetivo. */
    targets: { type: "string", default: "1" },
    /** Notice UID explícito, en vez de consultar Supabase. */
    notice: { type: "string" },
    out: { type: "string", default: "data/spike-stealth.json" },
    timeout: { type: "string", default: "60000" },
  },
});

const TIMEOUT = Number(args.timeout) || 60_000;
const N_TARGETS = Number(args.targets) || 1;
const PEDIDAS = new Set(args.variantes.split(",").map((s) => s.trim().toUpperCase()));

const UA_TEKEL =
  "TekelAgent/0.1 (auditoria de contratacion publica; +https://github.com/tekelagent/tekel-ai)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Pausa con jitter: los intervalos exactos son en sí mismos una señal de bot. */
const pausaHumana = (base: number) => sleep(base + Math.floor(Math.random() * base * 0.6));

// ── Definición de las variantes ─────────────────────────────────────────────
// La escalera va de la huella más obvia a la más humana. Cada peldaño cambia
// UNA familia de señales, para que el resultado diga cuál era la que importaba.
type Variante = {
  letra: string;
  nombre: string;
  descripcion: string;
  stealth: boolean;
  headless: boolean;
  /** "chromium" = el que trae Playwright; "chrome" = el Chrome instalado. */
  canal: "chromium" | "chrome";
  /** UA propio, o null para dejar el nativo del navegador (lo más coherente). */
  ua: string | null;
  /** Bloquear imágenes/CSS/fuentes acelera, pero es una señal de scraper. */
  bloquearRecursos: boolean;
  /** Perfil en disco: cookies y estado que persisten entre corridas. */
  persistente: boolean;
};

const VARIANTES: Variante[] = [
  {
    letra: "A",
    nombre: "control (spike anterior)",
    descripcion: "headless + UA TekelAgent + bloqueo de recursos",
    stealth: false,
    headless: true,
    canal: "chromium",
    ua: UA_TEKEL,
    bloquearRecursos: true,
    persistente: false,
  },
  {
    letra: "B",
    nombre: "UA nativo",
    descripcion: "headless, UA del navegador, sin bloqueo",
    stealth: false,
    headless: true,
    canal: "chromium",
    ua: null,
    bloquearRecursos: false,
    persistente: false,
  },
  {
    letra: "C",
    nombre: "stealth headless",
    descripcion: "playwright-extra + stealth, headless",
    stealth: true,
    headless: true,
    canal: "chromium",
    ua: null,
    bloquearRecursos: false,
    persistente: false,
  },
  {
    letra: "D",
    nombre: "stealth con ventana",
    descripcion: "playwright-extra + stealth, headed",
    stealth: true,
    headless: false,
    canal: "chromium",
    ua: null,
    bloquearRecursos: false,
    persistente: false,
  },
  {
    letra: "E",
    nombre: "Chrome real persistente",
    descripcion: "canal chrome instalado, headed, perfil en disco",
    stealth: false,
    headless: false,
    canal: "chrome",
    ua: null,
    bloquearRecursos: false,
    persistente: true,
  },
];

// ── Señales que se leen de la página ────────────────────────────────────────
const RE_CAPTCHA_URL = /GoogleReCaptcha|\/Common\/Captcha/i;
const RE_DOC_ID = /DocumentId=([A-Za-z0-9._-]+)/gi;

type Resultado = {
  variante: string;
  notice: string;
  urlFinal: string;
  captcha: boolean;
  /** Datos para cotizar el solucionador, si hay muro. */
  sitekey: string | null;
  tipoCaptcha: string | null;
  documentIds: string[];
  xhrConDocs: number;
  ms: number;
  error: string | null;
  screenshot: string | null;
};

/**
 * Lee la huella del captcha desde el HTML y los scripts cargados.
 * Distinguir v2/v3/enterprise importa: el precio y la API del solucionador
 * cambian con cada uno.
 */
function leerCaptcha(html: string, urlsScripts: string[]) {
  const esEnterprise =
    urlsScripts.some((u) => /recaptcha\/enterprise\.js/i.test(u)) ||
    /grecaptcha\.enterprise/i.test(html);
  const cargaApi = urlsScripts.some((u) => /recaptcha\/(api|enterprise)\.js/i.test(u));

  let sitekey: string | null = null;
  for (const re of [
    /data-sitekey=["']([A-Za-z0-9_-]{20,})["']/i,
    /grecaptcha\.(?:enterprise\.)?(?:execute|render)\s*\(\s*["']([A-Za-z0-9_-]{20,})["']/i,
    /['"]sitekey['"]\s*:\s*["']([A-Za-z0-9_-]{20,})["']/i,
    /render=([A-Za-z0-9_-]{20,})/i,
  ]) {
    const m = html.match(re) ?? urlsScripts.join(" ").match(re);
    if (m) {
      sitekey = m[1];
      break;
    }
  }

  // v2 pinta una caja con checkbox; v3 corre invisible y solo puntúa.
  const hayWidget = /g-recaptcha|recaptcha-checkbox/i.test(html);
  const hayRender = urlsScripts.some((u) => /recaptcha\/api\.js\?render=/i.test(u));
  let tipo: string | null = null;
  if (esEnterprise) tipo = hayWidget ? "enterprise (checkbox)" : "enterprise (score/invisible)";
  else if (hayRender && !hayWidget) tipo = "v3 (invisible)";
  else if (hayWidget) tipo = "v2 (checkbox)";
  else if (cargaApi) tipo = "recaptcha (variante no determinada)";

  return { sitekey, tipo };
}

/** Abre un contexto de navegador según la variante. Devuelve contexto + cierre. */
async function abrirContexto(v: Variante) {
  const argsChrome = [
    // La bandera más citada: sin ella Chrome anuncia que lo controla un test.
    "--disable-blink-features=AutomationControlled",
    "--no-first-run",
    "--no-default-browser-check",
  ];

  const opcionesContexto = {
    locale: "es-CO",
    timezoneId: "America/Bogota",
    viewport: { width: 1440, height: 900 },
    ...(v.ua ? { userAgent: v.ua } : {}),
  };

  // playwright-extra envuelve el launcher para inyectar las evasiones del
  // plugin stealth antes de que corra el JS de la página.
  let launcher: typeof import("playwright").chromium;
  if (v.stealth) {
    const { chromium: chromiumExtra } = await import("playwright-extra");
    const StealthPlugin = (await import("puppeteer-extra-plugin-stealth")).default;
    (chromiumExtra as unknown as { use: (p: unknown) => void }).use(StealthPlugin());
    launcher = chromiumExtra as unknown as typeof import("playwright").chromium;
  } else {
    launcher = (await import("playwright")).chromium;
  }

  if (v.persistente) {
    const dir = `data/perfil-chrome-${v.letra}`;
    mkdirSync(dir, { recursive: true });
    const ctx = await launcher.launchPersistentContext(dir, {
      headless: v.headless,
      channel: v.canal,
      args: argsChrome,
      ...opcionesContexto,
    });
    return { ctx, cerrar: () => ctx.close() };
  }

  const browser = await launcher.launch({
    headless: v.headless,
    channel: v.canal,
    args: argsChrome,
  });
  const ctx = await browser.newContext(opcionesContexto);
  return {
    ctx,
    cerrar: async () => {
      await ctx.close();
      await browser.close();
    },
  };
}

async function correrVariante(v: Variante, notice: string, url: string): Promise<Resultado> {
  const t0 = Date.now();
  const base: Resultado = {
    variante: `${v.letra} — ${v.nombre}`,
    notice,
    urlFinal: "",
    captcha: false,
    sitekey: null,
    tipoCaptcha: null,
    documentIds: [],
    xhrConDocs: 0,
    ms: 0,
    error: null,
    screenshot: null,
  };

  let cerrar: (() => Promise<void>) | null = null;
  try {
    const abierto = await abrirContexto(v);
    cerrar = abierto.cerrar;
    const page = await abierto.ctx.newPage();

    if (v.bloquearRecursos) {
      await page.route("**/*", (route) => {
        const t = route.request().resourceType();
        return t === "image" || t === "stylesheet" || t === "font" || t === "media"
          ? route.abort()
          : route.continue();
      });
    }

    const urlsScripts: string[] = [];
    const idsXhr = new Set<string>();
    let xhrConDocs = 0;

    page.on("request", (req) => {
      if (req.resourceType() === "script") urlsScripts.push(req.url());
    });
    page.on("response", async (res) => {
      const tipo = res.request().resourceType();
      if (tipo !== "xhr" && tipo !== "fetch") return;
      let cuerpo = "";
      try {
        cuerpo = await res.text();
      } catch {
        return;
      }
      const hits = [...cuerpo.matchAll(RE_DOC_ID)].map((m) => m[1]);
      // El JSON interno a veces trae el id suelto, sin la URL de descarga.
      const sueltos = [...cuerpo.matchAll(/"documentId"\s*:\s*"?([A-Za-z0-9._-]{6,})"?/gi)].map(
        (m) => m[1],
      );
      if (hits.length || sueltos.length) xhrConDocs++;
      for (const id of [...hits, ...sueltos]) idsXhr.add(id);
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT }).catch(() => {});

    // Gesto humano mínimo: algunos WAF puntúan la ausencia total de eventos de
    // entrada. No es "simular a una persona", es no parecer un cron.
    await page.mouse.move(300 + Math.random() * 400, 250 + Math.random() * 300);
    await pausaHumana(700);
    await page.mouse.wheel(0, 400 + Math.random() * 400);
    await pausaHumana(900);

    base.urlFinal = page.url();
    let html = await page.content().catch(() => "");
    base.captcha = RE_CAPTCHA_URL.test(page.url()) || /recaptcha/i.test(html);

    // Sin muro: intentar llegar a la lista de documentos del proceso.
    if (!base.captcha) {
      for (const sel of [
        "text=/documentos del proceso/i",
        "text=/ver documentos/i",
        "a:has-text('Documento')",
        "text=/anexos/i",
      ]) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 2000 })) {
            await el.click({ timeout: 5000 });
            await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
            await pausaHumana(1200);
            break;
          }
        } catch {
          /* siguiente candidato */
        }
      }
      html = await page.content().catch(() => html);
    }

    if (base.captcha) {
      const { sitekey, tipo } = leerCaptcha(html, urlsScripts);
      base.sitekey = sitekey;
      base.tipoCaptcha = tipo;
    }

    for (const m of html.matchAll(RE_DOC_ID)) idsXhr.add(m[1]);
    base.documentIds = [...idsXhr];
    base.xhrConDocs = xhrConDocs;

    mkdirSync("data/spike-stealth", { recursive: true });
    const shot = `data/spike-stealth/${v.letra}-${notice}.png`;
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    base.screenshot = shot;
  } catch (err) {
    base.error = (err as Error).message.slice(0, 200);
  } finally {
    if (cerrar) await cerrar().catch(() => {});
    base.ms = Date.now() - t0;
  }
  return base;
}

async function objetivos(): Promise<Array<{ notice: string; url: string; etiqueta: string }>> {
  if (args.notice) {
    const n = args.notice;
    return [
      {
        notice: n,
        url: `https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=${n}&isFromPublicArea=True&isModal=False`,
        etiqueta: "(manual)",
      },
    ];
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (o pasa --notice).");
  }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("contracts")
    .select("id_contrato,url_proceso,nombre_entidad,plata_en_riesgo")
    .eq("prioridad", "P1")
    .not("url_proceso", "is", null)
    .order("plata_en_riesgo", { ascending: false, nullsFirst: false })
    .limit(N_TARGETS);
  if (error) throw new Error(`Supabase: ${error.message}`);

  return (data ?? []).map((c) => {
    const url = String(c.url_proceso);
    const m = url.match(/noticeUID=([^&]+)/i);
    return {
      notice: m ? m[1] : String(c.id_contrato),
      url,
      etiqueta: String(c.nombre_entidad ?? "").slice(0, 50),
    };
  });
}

async function main() {
  console.log(`S2 — spike de navegador sigiloso sobre SECOP II\n${"═".repeat(74)}`);

  const targets = await objetivos();
  if (!targets.length) throw new Error("Sin objetivos: ningún P1 con url_proceso.");
  const aCorrer = VARIANTES.filter((v) => PEDIDAS.has(v.letra));
  console.log(`${targets.length} objetivo(s) · ${aCorrer.length} variante(s)\n`);
  for (const t of targets) console.log(`  ${t.notice} — ${t.etiqueta}`);
  console.log();

  const resultados: Resultado[] = [];
  for (const t of targets) {
    console.log(`${"─".repeat(74)}\n▸ ${t.notice}`);
    for (const v of aCorrer) {
      process.stdout.write(`  ${v.letra} ${v.descripcion.padEnd(46)} `);
      const r = await correrVariante(v, t.notice, t.url);
      resultados.push(r);
      const veredicto = r.error
        ? `ERROR ${r.error.slice(0, 60)}`
        : r.captcha
          ? `CAPTCHA${r.tipoCaptcha ? ` ${r.tipoCaptcha}` : ""}`
          : r.documentIds.length
            ? `PASA · ${r.documentIds.length} DocumentId`
            : `pasa el muro, 0 documentos`;
      console.log(`${veredicto}  (${(r.ms / 1000).toFixed(1)}s)`);
      // Cortesía con SECOP: nunca dos peticiones seguidas sin respirar.
      await pausaHumana(3000);
    }
  }

  // ── Veredicto ───────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(74)}\nVEREDICTO`);
  const sinCaptcha = resultados.filter((r) => !r.captcha && !r.error);
  const conDocs = sinCaptcha.filter((r) => r.documentIds.length > 0);

  if (conDocs.length) {
    const ganadoras = [...new Set(conDocs.map((r) => r.variante))];
    console.log(`  FASE 1 VIABLE — hay variante(s) que listan documentos sin captcha:`);
    for (const g of ganadoras) console.log(`    ✓ ${g}`);
    console.log(`  → implementar discover-stealth.ts con la más barata que funcione.`);
  } else if (sinCaptcha.length) {
    console.log(`  PARCIAL — se pasa el muro pero no aparecen DocumentId:`);
    for (const r of sinCaptcha) console.log(`    · ${r.variante} → ${r.urlFinal.slice(0, 90)}`);
    console.log(`  → el listado está tras otra interacción; revisar los screenshots.`);
  } else {
    console.log(`  FASE 2 NECESARIA — todas las variantes topan con captcha.`);
    const conKey = resultados.find((r) => r.sitekey);
    console.log(`    tipo:    ${resultados.find((r) => r.tipoCaptcha)?.tipoCaptcha ?? "?"}`);
    console.log(`    sitekey: ${conKey?.sitekey ?? "no extraído"}`);
  }

  mkdirSync("data", { recursive: true });
  writeFileSync(args.out, JSON.stringify({ targets, resultados }, null, 2));
  console.log(`\nDetalle en ${args.out} · capturas en data/spike-stealth/`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
