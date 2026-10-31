// Approximates how Safari applies a content blocker list, so the corpus can
// run with the list Hush would serve: which selectors are hidden on a page
// and which requests are blocked. Rules apply in order, and an
// ignore-previous-rules rule that matches cancels the ones before it.

const hostOf = (url) => new URL(url).hostname;

// Rough registrable domain: enough to tell first-party from third-party.
const siteOf = (host) => host.split(".").slice(-2).join(".");

// Hush writes domains as "*example.com", meaning the domain and subdomains.
const matchesDomain = (host, patterns) =>
  patterns.some((pattern) => {
    const domain = pattern.replace(/^\*/, "");
    return host === domain || host.endsWith(`.${domain}`);
  });

const RESOURCE_TYPES = {
  document: "document",
  stylesheet: "style-sheet",
  image: "image",
  media: "media",
  font: "font",
  script: "script",
};

const compile = (rule) => {
  try {
    return new RegExp(rule.trigger["url-filter"], "i");
  } catch {
    return null;
  }
};

export const createBlocker = (rules) => {
  const compiled = rules
    .map((rule) => ({ rule, filter: compile(rule) }))
    .filter(({ filter }) => filter);

  const applies = ({ rule, filter }, url, pageHost) => {
    const trigger = rule.trigger;
    if (!filter.test(url)) return false;
    if (
      trigger["if-domain"] && !matchesDomain(pageHost, trigger["if-domain"])
    ) {
      return false;
    }
    if (
      trigger["unless-domain"] &&
      matchesDomain(pageHost, trigger["unless-domain"])
    ) {
      return false;
    }
    return true;
  };

  return {
    hiddenSelectors(pageUrl) {
      const pageHost = hostOf(pageUrl);
      let selectors = [];
      for (const entry of compiled) {
        const { action } = entry.rule;
        if (!applies(entry, pageUrl, pageHost)) continue;
        if (action.type === "css-display-none") selectors.push(action.selector);
        if (action.type === "ignore-previous-rules") selectors = [];
      }
      return selectors;
    },

    blocks(requestUrl, pageUrl, resourceType) {
      const pageHost = hostOf(pageUrl);
      const thirdParty = siteOf(hostOf(requestUrl)) !== siteOf(pageHost);
      const type = RESOURCE_TYPES[resourceType] ?? "raw";
      let blocked = false;
      for (const entry of compiled) {
        const { trigger, action } = entry.rule;
        if (action.type === "css-display-none") continue;
        if (!applies(entry, requestUrl, pageHost)) continue;
        const loadType = trigger["load-type"]?.[0];
        if (loadType === "third-party" && !thirdParty) continue;
        if (loadType === "first-party" && thirdParty) continue;
        if (
          trigger["resource-type"] && !trigger["resource-type"].includes(type)
        ) {
          continue;
        }
        blocked = action.type === "block";
      }
      return blocked;
    },
  };
};
