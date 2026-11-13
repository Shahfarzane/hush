// Loads the built content script into WebKit (Safari's engine) on live sites
// that use the common consent platforms, then reads back what each platform
// stored and compares it with the chosen level. Needs the network, so it is
// not part of `make test_unit`; run it with `make test_corpus [SITES=...]`.
// `make test_corpus_chrome` runs the real Chrome build instead (--browser).
import { chromium, devices, webkit } from "npm:playwright";
import { mismatches, readers } from "./src/consent-readers.js";
import { createMatcher } from "./src/dnr.js";
import { extensionId, HOST_NAME, hostManifest } from "./src/chrome.js";
import { siteCss } from "../WebExtension/src/hide-css.js";
import { evalSnippets } from "../WebExtension/vendor/autoconsent/autoconsent.esm.js";

const resolveRelative = (path) => new URL(path, import.meta.url).pathname;

// --corpus=<path> runs another site list in the same format, such as
// candidates to try before adding them to data/corpus.json.
const CORPUS = Deno.args.find((arg) => arg.startsWith("--corpus="))
  ?.split("=")[1];
const SITES = JSON.parse(
  await Deno.readTextFile(CORPUS ?? resolveRelative("../data/corpus.json")),
);

// --blocker=answer (default) or --blocker=full applies the block and hide
// rules the extension uses in answer or "Only hide it" mode; --blocker=none
// runs without them. --mobile loads pages as an iPhone, which gets some
// sites' mobile banners.
const flags = Deno.args.filter((arg) => arg.startsWith("--"));
const only = Deno.args.filter((arg) => !arg.startsWith("--"));
const MOBILE = flags.includes("--mobile");
const BLOCKER_MODE =
  flags.find((flag) => flag.startsWith("--blocker="))?.split("=")[1] ??
    "answer";

// --browser=chromium loads build/ChromeExtension into Chromium as it ships:
// its service worker, block rules and hide CSS, so --mobile and --blocker do
// not apply. CHROMIUM_PATH names the binary (Chrome for Testing); without it
// Playwright's own Chromium runs (`npx playwright install chromium`).
const CHROMIUM = flags.includes("--browser=chromium");
if (CHROMIUM && (MOBILE || BLOCKER_MODE !== "answer")) {
  console.error("--browser=chromium takes no --mobile or --blocker");
  Deno.exit(2);
}
const CHROMIUM_PATH = Deno.env.get("CHROMIUM_PATH");
const CHROME_EXTENSION = resolveRelative("../build/ChromeExtension");
const CHROME_EXTENSION_ID = extensionId(
  JSON.parse(
    await Deno.readTextFile(
      resolveRelative("../WebExtension/manifest.chrome.json"),
    ),
  ).key,
);
const RESULTS = resolveRelative(
  `../build/corpus-results${CHROMIUM ? "-chromium" : ""}.json`,
);

const HIDE_MODE = CHROMIUM
  ? null
  : { answer: "answer", full: "hide" }[BLOCKER_MODE];
const CONTENT_SCRIPT = CHROMIUM ? null : await Deno.readTextFile(
  resolveRelative("../build/WebExtension/content.js"),
);
const AUTOCONSENT_SCRIPT = CHROMIUM ? null : await Deno.readTextFile(
  resolveRelative("../build/WebExtension/autoconsent.js"),
);
const readBuilt = async (path) =>
  JSON.parse(await Deno.readTextFile(resolveRelative(`../build/${path}`)));
const blocks = HIDE_MODE
  ? createMatcher([
    ...await readBuilt("WebExtension/rules/block-answer.json"),
    ...(HIDE_MODE === "hide"
      ? await readBuilt("WebExtension/rules/block-hide-only.json")
      : []),
  ])
  : null;
const GENERIC_CSS = HIDE_MODE
  ? await Deno.readTextFile(resolveRelative("../build/WebExtension/hide.css"))
  : "";
const PER_SITE = HIDE_MODE ? await readBuilt("web-lists/per-site.json") : null;

const RESOURCE_TYPES = {
  stylesheet: "stylesheet",
  script: "script",
  image: "image",
  font: "font",
  media: "media",
  xhr: "xmlhttprequest",
  fetch: "xmlhttprequest",
  websocket: "websocket",
};
const resourceType = (request) =>
  request.resourceType() === "document"
    ? request.frame().parentFrame() ? "sub_frame" : "main_frame"
    : RESOURCE_TYPES[request.resourceType()] ?? "other";

// The manifest's hide.css applies from the first paint; the background
// injects the rest per site. Here both are style elements.
const styleScript = (css) =>
  `(() => {
  const css = ${JSON.stringify(css)};
  const add = () => {
    const style = document.createElement("style");
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  };
  if (document.documentElement) add();
  else document.addEventListener("readystatechange", add, { once: true });
})();`;

// --level=balanced (functional and performance) checks a second level;
// "functional only" is the default.
const LEVELS = {
  functional: {
    functional: true,
    performance: false,
    advertising: false,
    other: false,
  },
  balanced: {
    functional: true,
    performance: true,
    advertising: false,
    other: false,
  },
};
const LEVEL =
  flags.find((flag) => flag.startsWith("--level="))?.split("=")[1] ??
    "functional";

const SETTINGS = {
  version: 1,
  mode: "answer",
  categories: LEVELS[LEVEL],
  hideWhileAnswering: true,
  pausedSites: [],
};

const ANSWER_TIMEOUT_MS = 20000;
const CONSENT_COOKIE =
  /consent|optanon|cookie|didomi|borlabs|cky|cmplz|notice|gdpr|uc_/i;
const SETTLE_MS = 3000;

// Safari gives content scripts their own `browser` and `chrome`; stand them
// up in a closure so the page never sees them. Messages the background
// answers with page access (injecting the autoconsent fallback, running its
// snippets) go to the __hushBackground binding below.
const inScope = (script) =>
  `(() => {
  const settings = ${JSON.stringify(SETTINGS)};
  const origins = location.ancestorOrigins;
  const topUrl = origins?.length ? origins[origins.length - 1] + "/" : location.href;
  const respond = (message) => {
    if (message === "GetTabUrl") return topUrl;
    if (message?.type === "getSettings") return settings;
    if (["fallback", "autoconsentEval", "hideCss"].includes(message?.type)) {
      return window.__hushBackground?.(message);
    }
    if (message?.type === "report") console.log("HUSH-REPORT " + JSON.stringify(message));
  };
  const browser = { runtime: { sendMessage: async (message) => respond(message) } };
  const chrome = { runtime: { sendMessage: (message, callback) => callback?.(respond(message)) } };
  ${script}
})();`;
const injected = CHROMIUM ? null : inScope(CONTENT_SCRIPT);
const injectedAutoconsent = CHROMIUM ? null : inScope(AUTOCONSENT_SCRIPT);

// Mirrors background.js: no fallback once a frame in the page has answered.
const background = async ({ frame }, message, reports) => {
  if (message.type === "hideCss") {
    if (!PER_SITE) return;
    let host;
    try {
      host = new URL(frame.url()).hostname;
    } catch {
      return;
    }
    const css = host && siteCss(PER_SITE, host, HIDE_MODE);
    if (css) await frame.evaluate(styleScript(css)).catch(() => {});
    return;
  }
  if (message.type === "fallback") {
    if (reports.some((report) => report.outcome === "handled")) return false;
    await frame.evaluate(injectedAutoconsent);
    return true;
  }
  const snippet = evalSnippets[message.snippetId];
  return snippet ? frame.evaluate(snippet).catch(() => false) : false;
};

const collectPageData = () =>
  (async () => {
    const tcData = typeof window.__tcfapi === "function"
      ? await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 3000);
        try {
          window.__tcfapi("getTCData", 2, (data, success) => {
            clearTimeout(timer);
            // While the dialog is up a CMP reports every purpose as refused,
            // which reads the same as a saved refusal.
            const saved = data?.eventStatus !== "cmpuishown";
            resolve(
              success && saved && data?.purpose
                ? { purposes: data.purpose.consents }
                : null,
            );
          });
        } catch {
          resolve(null);
        }
      })
      : null;
    let usercentrics = null;
    try {
      if (window.__ucCmp?.getConsentDetails) {
        const { categories } = await window.__ucCmp.getConsentDetails();
        usercentrics = Object.values(categories)
          .filter((category) => !category.essential)
          .map((category) => ({
            category: category.name,
            status: category.state !== "ALL_DENIED",
          }));
      } else if (window.UC_UI?.getServicesBaseInfo) {
        usercentrics = window.UC_UI.getServicesBaseInfo().map((service) => ({
          category: service.categorySlug,
          status: service.consent?.status,
        }));
      }
    } catch {
      usercentrics = null;
    }
    let onetrustGroups = null;
    try {
      onetrustGroups = window.OneTrust?.GetDomainData?.().Groups.flatMap((
        group,
      ) => [group, ...(group.SubGroups ?? [])]).map((group) => ({
        id: group.OptanonGroupId,
        name: group.GroupName,
        status: group.Status,
      }));
    } catch {
      onetrustGroups = null;
    }
    let didomi = null;
    try {
      // Until a choice is saved Didomi lists every purpose as disabled, which
      // reads the same as refusing them.
      const saved = window.Didomi?.shouldConsentBeCollected?.() === false;
      const { purposes } = saved ? window.Didomi.getUserStatus() : {};
      if (purposes) {
        const essential = new Set(purposes.essential ?? []);
        const keep = (ids) => ids.filter((id) => !essential.has(id));
        didomi = {
          enabled: keep([
            ...purposes.consent.enabled,
            ...purposes.global.enabled,
          ]),
          disabled: keep([
            ...purposes.consent.disabled,
            ...purposes.global.disabled,
          ]),
        };
      }
    } catch {
      didomi = null;
    }
    const settle = (promise, fallback = null) =>
      Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve(fallback), 3000)),
      ]).catch(() => fallback);
    const apis = {};
    try {
      apis.osano = window.Osano?.cm?.getConsent?.() ?? null;
    } catch {
      apis.osano = null;
    }
    try {
      apis.termly = window.Termly?.getConsentState?.() ?? null;
    } catch {
      apis.termly = null;
    }
    apis.ketch = typeof window.ketch === "function"
      ? await settle(
        new Promise((resolve) =>
          window.ketch("getConsent", (consent) => resolve(consent?.purposes))
        ),
      )
      : null;
    apis.consentmanager = typeof window.__cmp === "function"
      ? await settle(
        new Promise((resolve) => {
          const data = window.__cmp("getCMPData", null, resolve);
          if (data) resolve(data);
        }),
      ).then((data) =>
        data
          ? (data.purposesList ?? []).map((purpose) => ({
            name: purpose.name,
            consented: data.purposeConsents?.[purpose.id] === true,
          }))
          : null
      )
      : null;
    return { tcData, usercentrics, onetrustGroups, didomi, ...apis };
  })();

// Collects HUSH-REPORT lines from a console: the page's in WebKit, where the
// stand-in background logs them, the service worker's in Chromium.
const reportCollector = () => {
  const reports = [];
  let answered;
  const answeredPromise = new Promise((resolve) => (answered = resolve));
  const onConsole = (message) => {
    const text = message.text();
    if (!text.startsWith("HUSH-REPORT ")) return;
    const report = JSON.parse(text.slice("HUSH-REPORT ".length));
    reports.push(report);
    if (report.outcome === "handled") answered(report);
  };
  return { reports, answeredPromise, onConsole };
};

// Waits for an answer, then reads back what the site stored.
const judge = async (site, context, page, { reports, answeredPromise }) => {
  await Promise.race([
    answeredPromise,
    new Promise((resolve) => setTimeout(resolve, ANSWER_TIMEOUT_MS)),
  ]);
  await page.waitForTimeout(SETTLE_MS);
  const data = {
    cookies: await context.cookies(),
    ...(await page.evaluate(collectPageData)),
  };
  const stored = readers[site.reader](data);
  const handled = reports.find((report) => report.outcome === "handled");
  const differences = stored ? mismatches(stored, SETTINGS.categories) : [];
  // Consent the user did not choose is the failure that hurts; refusing a
  // category they allowed is only stricter than asked.
  const wrong = differences.filter((difference) =>
    difference.endsWith("=true")
  );
  // A site with no way to read its stored consent counts as answered when
  // a rule clicked through its banner.
  const answeredStatus = site.reader === "none"
    ? ["pass", "stricter", "no-readback"]
    : ["pass", "stricter"];
  const status = wrong.length
    ? "wrong"
    : differences.length
    ? "stricter"
    : stored
    ? "pass"
    : handled
    ? "no-readback"
    : "unanswered";
  const consentCookies = data.cookies
    .filter(({ name }) => CONSENT_COOKIE.test(name))
    .map(({ name, value }) => ({ name, value: value.slice(0, 2000) }));
  // Sites marked "answered" were answered before; anything else now means
  // a rule broke or the content blocker hid the banner first.
  const regressed = site.answered && !answeredStatus.includes(status);
  return {
    ...site,
    status: regressed ? "regressed" : status,
    cmp: handled?.cmp,
    stored,
    differences,
    consentCookies,
    reports: reports.map(({ outcome, cmp, clicks, path }) => ({
      outcome,
      cmp,
      clicks,
      path,
    })),
  };
};

const failed = (site, error) => ({
  ...site,
  status: "error",
  error: String(error).split("\n")[0],
});

const visitWebkit = async (browser, site) => {
  const context = await browser.newContext({
    locale: "en-GB",
    ...(MOBILE
      ? devices["iPhone 15"]
      : { viewport: { width: 1280, height: 900 } }),
  });
  const collector = reportCollector();
  try {
    if (blocks) {
      await context.addInitScript(styleScript(GENERIC_CSS));
      await context.route("**/*", (route) => {
        const request = route.request();
        let initiator;
        try {
          initiator = new URL(request.frame().url()).hostname ||
            new URL(site.url).hostname;
        } catch {
          initiator = new URL(site.url).hostname;
        }
        return blocks({
            url: request.url(),
            type: resourceType(request),
            initiator,
          })
          ? route.abort("blockedbyclient")
          : route.continue();
      });
    }
    // "noBinding" sites wall any page Playwright's exposeBinding touched
    // (adidas's bot check). Without it there is no autoconsent fallback and
    // no per-site CSS, which a site answered by a Hush rule does not need.
    if (!site.noBinding) {
      await context.exposeBinding(
        "__hushBackground",
        (source, message) => background(source, message, collector.reports),
      );
    }
    await context.addInitScript(injected);
    const page = await context.newPage();
    page.on("console", collector.onConsole);
    await page.goto(site.url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    return await judge(site, context, page, collector);
  } catch (error) {
    return failed(site, error);
  } finally {
    await context.close();
  }
};

// A throwaway profile with a stand-in for macOS/ChromeHost: Chromium looks
// for host manifests in the profile's NativeMessagingHosts folder, and the
// stand-in answers every native message (getSettings) with the level under
// test. It reads the request's length first, so it never exits before
// Chromium has written the request.
const chromiumProfile = async () => {
  const dir = await Deno.makeTempDir({ prefix: "hush-corpus-" });
  const body = new TextEncoder().encode(JSON.stringify({ settings: SETTINGS }));
  const reply = new Uint8Array(4 + body.length);
  new DataView(reply.buffer).setUint32(0, body.length, true);
  reply.set(body, 4);
  await Deno.writeFile(`${dir}/reply.bin`, reply);
  const host = `${dir}/host.sh`;
  await Deno.writeTextFile(
    host,
    `#!/bin/sh\nhead -c 4 >/dev/null\ncat "${dir}/reply.bin"\n`,
    { mode: 0o755 },
  );
  await Deno.mkdir(`${dir}/profile/NativeMessagingHosts`, { recursive: true });
  await Deno.writeTextFile(
    `${dir}/profile/NativeMessagingHosts/${HOST_NAME}.json`,
    JSON.stringify(hostManifest(host, [await CHROME_EXTENSION_ID])),
  );
  return dir;
};

const CHROMIUM_LAUNCH = {
  ...(CHROMIUM_PATH
    ? { executablePath: CHROMIUM_PATH }
    : { channel: "chromium" }),
  headless: true,
};

// Headless Chromium calls itself "HeadlessChrome" in its user agent, which
// some sites wall off (x.com answers with an error); Chrome as people run it
// says "Chrome".
const chromiumUserAgent = async () => {
  const browser = await chromium.launch(CHROMIUM_LAUNCH);
  const page = await browser.newPage();
  const userAgent = await page.evaluate(() => navigator.userAgent);
  await browser.close();
  return userAgent.replace("HeadlessChrome/", "Chrome/");
};
const CHROMIUM_USER_AGENT = CHROMIUM ? await chromiumUserAgent() : null;

const visitChromium = async (site) => {
  const dir = await chromiumProfile();
  const collector = reportCollector();
  let context;
  try {
    context = await chromium.launchPersistentContext(`${dir}/profile`, {
      ...CHROMIUM_LAUNCH,
      userAgent: CHROMIUM_USER_AGENT,
      locale: "en-GB",
      viewport: { width: 1280, height: 900 },
      args: [
        `--disable-extensions-except=${CHROME_EXTENSION}`,
        `--load-extension=${CHROME_EXTENSION}`,
      ],
    });
    // Chrome stops an idle service worker and starts a new one later.
    const watch = (worker) => worker.on("console", collector.onConsole);
    context.serviceWorkers().forEach(watch);
    context.on("serviceworker", watch);
    const page = await context.newPage();
    await page.goto(site.url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    return await judge(site, context, page, collector);
  } catch (error) {
    return failed(site, error);
  } finally {
    await context?.close();
    await Deno.remove(dir, { recursive: true });
  }
};

const sites = only.length
  ? SITES.filter((site) => only.includes(site.name))
  : SITES;

// Chromium gets a browser of its own per site, since an extension needs a
// persistent profile.
const browser = CHROMIUM ? null : await webkit.launch();
const results = [];
for (const site of sites) {
  const result = CHROMIUM
    ? await visitChromium(site)
    : await visitWebkit(browser, site);
  results.push(result);
  console.log(
    [
      result.status.padEnd(11),
      site.name.padEnd(22),
      (result.cmp ?? "-").padEnd(18),
      result.stored ? JSON.stringify(result.stored) : result.error ?? "",
    ].join(" "),
  );
}
await browser?.close();

await Deno.mkdir(resolveRelative("../build"), { recursive: true });
await Deno.writeTextFile(RESULTS, JSON.stringify(results, null, 2));

const count = (status) => results.filter((r) => r.status === status).length;
console.log(
  CHROMIUM
    ? "browser: chromium, build/ChromeExtension"
    : `blocker: ${BLOCKER_MODE}`,
);
console.log(
  `\n${count("pass")} pass, ${count("wrong")} wrong, ${
    count("regressed")
  } regressed, ${count("stricter")} stricter, ${
    count("no-readback")
  } answered without readback, ${count("unanswered")} unanswered, ${
    count("error")
  } errors`,
);
// A stored consent that differs from the level is the one outcome that hurts
// the user; coverage gaps fall back to hiding.
if (count("wrong") || count("regressed")) Deno.exit(1);
