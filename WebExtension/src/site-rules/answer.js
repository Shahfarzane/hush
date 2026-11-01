import { siteKey } from "../settings.js";
import { report } from "../report.js";
import { runRule } from "./engine.js";
import { CATEGORIES } from "./plan.js";

// The rule for a host: one whose sites list the host or a parent domain,
// down to the registrable one.
export const siteRuleFor = (rules, host) => {
  const site = host.toLowerCase().replace(/^www\./, "");
  const root = siteKey(site);
  const labels = site.split(".");
  for (let start = 0; start < labels.length; start++) {
    const candidate = labels.slice(start).join(".");
    const rule = rules.find((rule) => rule.sites.includes(candidate));
    if (rule) return rule;
    if (candidate === root) break;
  }
  return null;
};

// The cmp name a report carries. A mixed level answered by refusing
// everything is marked, so the popup does not say it used the level.
const cmpName = (rule, path, categories) => {
  const allowed = CATEGORIES.map((category) => categories[category]);
  const mixed = allowed.some(Boolean) && !allowed.every(Boolean);
  return `${
    mixed && path !== "settings" ? "site-refuse" : "site"
  }:${rule.name}`;
};

// Consent-O-Matic's class: content.css makes it transparent.
const HIDER = "ConsentOMatic-CMP-Hider";

export const answerWithSiteRule = async (rule, settings) => {
  const banner = rule.banner && settings.hideWhileAnswering
    ? document.querySelector(rule.banner)
    : null;
  banner?.classList.add(HIDER);
  try {
    const result = await runRule(rule, settings.categories);
    if (result.answered && result.clicks > 0) {
      return {
        cmp: cmpName(rule, result.path, settings.categories),
        clicks: result.clicks,
      };
    }
    // Reported like Consent-O-Matic's "no-clicks", for the debug log and
    // the corpus.
    report({
      outcome: result.path ? "site-rule-failed" : "site-rule-skipped",
      cmp: `site:${rule.name}`,
      path: result.path,
    });
    return null;
  } finally {
    banner?.classList.remove(HIDER);
  }
};
