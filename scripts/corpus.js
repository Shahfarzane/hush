// Loads the built content script into WebKit (Safari's engine) on live sites
// that use the common consent platforms, then reads back what each platform
// stored and compares it with the chosen level. Needs the network, so it is
// not part of `make test_unit`; run it with `make test_corpus [SITES=...]`.
import { webkit } from "npm:playwright";
import { mismatches, readers } from "./src/consent-readers.js";
import { createBlocker } from "./src/content-blocker.js";

const resolveRelative = (path) => new URL(path, import.meta.url).pathname;

const SITES = JSON.parse(
  await Deno.readTextFile(resolveRelative("../data/corpus.json")),
);
const CONTENT_SCRIPT = await Deno.readTextFile(
  resolveRelative("../build/WebExtension/content.js"),
);
const RESULTS = resolveRelative("../build/corpus-results.json");

// --blocker=answer (default) or --blocker=full applies the content blocker
// list Hush serves in that mode; --blocker=none runs without one.
const flags = Deno.args.filter((arg) => arg.startsWith("--"));
const only = Deno.args.filter((arg) => !arg.startsWith("--"));
const BLOCKER_MODE =
  flags.find((flag) => flag.startsWith("--blocker="))?.split("=")[1] ??
    "answer";
const BLOCKER_LISTS = {
  answer: "../build/blockerList-answer.json",
  full: "../build/blockerList.json",
};
const blocker = BLOCKER_LISTS[BLOCKER_MODE]
  ? createBlocker(
    JSON.parse(
      await Deno.readTextFile(resolveRelative(BLOCKER_LISTS[BLOCKER_MODE])),
    ),
  )
  : null;

// Content blockers hide from the first paint, so add the stylesheet as soon
// as the document exists, in every frame.
const hideScript = (selectors) =>
  `(() => {
  const css = ${
    JSON.stringify(
      selectors.map((s) => `${s}{display:none!important}`).join("\n"),
    )
  };
  const add = () => {
    const style = document.createElement("style");
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  };
  if (document.documentElement) add();
  else document.addEventListener("readystatechange", add, { once: true });
})();`;

const SETTINGS = {
  version: 1,
  mode: "answer",
  categories: {
    functional: true,
    performance: false,
    advertising: false,
    other: false,
  },
  hideWhileAnswering: true,
  pausedSites: [],
};

const ANSWER_TIMEOUT_MS = 20000;
const CONSENT_COOKIE =
  /consent|optanon|cookie|didomi|borlabs|cky|cmplz|notice|gdpr|uc_/i;
const SETTLE_MS = 3000;

// Safari gives the content script its own `browser` and `chrome`; stand them
// up in a closure so the page never sees them.
const injected = `(() => {
  const settings = ${JSON.stringify(SETTINGS)};
  const origins = location.ancestorOrigins;
  const topUrl = origins?.length ? origins[origins.length - 1] + "/" : location.href;
  const respond = (message) => {
    if (message === "GetTabUrl") return topUrl;
    if (message?.type === "getSettings") return settings;
    if (message?.type === "report") console.log("HUSH-REPORT " + JSON.stringify(message));
  };
  const browser = { runtime: { sendMessage: async (message) => respond(message) } };
  const chrome = { runtime: { sendMessage: (message, callback) => callback?.(respond(message)) } };
  ${CONTENT_SCRIPT}
})();`;

const collectPageData = () =>
  (async () => {
    const tcData = typeof window.__tcfapi === "function"
      ? await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 3000);
        try {
          window.__tcfapi("getTCData", 2, (data, success) => {
            clearTimeout(timer);
            resolve(
              success && data?.purpose
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
      const { purposes } = window.Didomi?.getUserStatus?.() ?? {};
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
    return { tcData, usercentrics, onetrustGroups, didomi };
  })();

const visit = async (browser, site) => {
  const context = await browser.newContext({
    locale: "en-GB",
    viewport: { width: 1280, height: 900 },
  });
  const reports = [];
  let answered;
  const answeredPromise = new Promise((resolve) => (answered = resolve));
  try {
    if (blocker) {
      await context.addInitScript(
        hideScript(blocker.hiddenSelectors(site.url)),
      );
      await context.route("**/*", (route) => {
        const request = route.request();
        return blocker.blocks(request.url(), site.url, request.resourceType())
          ? route.abort("blockedbyclient")
          : route.continue();
      });
    }
    await context.addInitScript(injected);
    const page = await context.newPage();
    page.on("console", (message) => {
      const text = message.text();
      if (!text.startsWith("HUSH-REPORT ")) return;
      const report = JSON.parse(text.slice("HUSH-REPORT ".length));
      reports.push(report);
      if (report.outcome === "handled") answered(report);
    });
    await page.goto(site.url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
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
    const answeredStatus = ["pass", "stricter"];
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
    };
  } catch (error) {
    return { ...site, status: "error", error: String(error).split("\n")[0] };
  } finally {
    await context.close();
  }
};

const sites = only.length
  ? SITES.filter((site) => only.includes(site.name))
  : SITES;

const browser = await webkit.launch();
const results = [];
for (const site of sites) {
  const result = await visit(browser, site);
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
await browser.close();

await Deno.mkdir(resolveRelative("../build"), { recursive: true });
await Deno.writeTextFile(RESULTS, JSON.stringify(results, null, 2));

const count = (status) => results.filter((r) => r.status === status).length;
console.log(`blocker: ${BLOCKER_MODE}`);
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
