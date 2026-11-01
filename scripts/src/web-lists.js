import punycode from "https://deno.land/x/punycode/punycode.js";
import { hasUnsupportedSelectors } from "./validation.js";
import { isAnswerModeExcluded } from "./answer-mode.js";

// Turns the adblock-style lists into what the Safari web extension loads
// in place of a content blocker:
// - declarativeNetRequest rules for block and @@ exception lines, split into
//   the rules every mode uses and the extra ones "Only hide it" adds;
// - generic ## selectors no site exempts, for the stylesheet the manifest
//   applies to every page in every mode;
// - everything that depends on the site (site ## rules, #@# exceptions,
//   generic selectors some site exempts), for the background to inject.
// A rule answer mode leaves out (data/answer-mode-exclusions.txt) is marked
// hideOnly.

const isComment = (line) =>
  !line || line.startsWith("!") || line.startsWith("[Adblock");

const RESOURCE_TYPES = {
  script: "script",
  stylesheet: "stylesheet",
  subdocument: "sub_frame",
  xmlhttprequest: "xmlhttprequest",
  image: "image",
  font: "font",
  media: "media",
  other: "other",
};

const asciiDomain = (domain) => punycode.toASCII(domain);

// The declarativeNetRequest condition for a block line's options.
const conditionFor = (options) => {
  const condition = {};
  for (const option of (options ?? "").split(",").filter(Boolean)) {
    const [name, value] = option.split("=");
    const negated = name.startsWith("~");
    const key = negated ? name.slice(1) : name;
    if (key === "domain") {
      const domains = value.split("|").filter(Boolean);
      const included = domains.filter((domain) => !domain.startsWith("~"));
      const excluded = domains.filter((domain) => domain.startsWith("~"))
        .map((domain) => domain.slice(1));
      if (included.length) {
        condition.initiatorDomains = included.map(asciiDomain);
      }
      if (excluded.length) {
        condition.excludedInitiatorDomains = excluded.map(asciiDomain);
      }
    } else if (key === "third-party") {
      condition.domainType = negated ? "firstParty" : "thirdParty";
    } else if (key in RESOURCE_TYPES) {
      const field = negated ? "excludedResourceTypes" : "resourceTypes";
      condition[field] = [...(condition[field] ?? []), RESOURCE_TYPES[key]];
    } else {
      throw new Error(`Unsupported option "${option}"`);
    }
  }
  return condition;
};

const blockRule = (line) => {
  const exception = line.startsWith("@@");
  const [pattern, options] = line.replace(/^@@/, "").split("$");
  return {
    // Exceptions win over blocks, whatever their order in the lists.
    priority: exception ? 2 : 1,
    action: { type: exception ? "allow" : "block" },
    condition: {
      urlFilter: pattern.replace(
        /^(\|\|)?([^/^*]+)/,
        (_, anchor, host) => `${anchor ?? ""}${asciiDomain(host)}`,
      ),
      ...conditionFor(options),
    },
  };
};

// "$generichide" exceptions turn off the generic stylesheet on a site.
const genericHideDomain = (line) =>
  line.match(/^@@\|\|([^/^$]+)\^?\$generichide$/)?.[1];

// One rule per selector: a selector the browser does not understand drops
// only its own rule, not a whole group.
export const stylesheet = (selectors) =>
  selectors.map((selector) => `${selector}{display:none!important}\n`).join("");

export const buildWebLists = (text, answerMarkers) => {
  const blocks = [];
  const genericHideOff = [];
  const generic = new Map(); // selector -> hideOnly
  const sites = new Map(); // domain -> Map(selector -> hideOnly)
  const exceptions = new Map(); // selector -> Set(domain)

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (isComment(line)) continue;
    const hideOnly = isAnswerModeExcluded(line, answerMarkers);
    if (line.includes("#@#")) {
      const [domains, selector] = line.split("#@#");
      const set = exceptions.get(selector) ?? new Set();
      domains.split(",").forEach((domain) => set.add(asciiDomain(domain)));
      exceptions.set(selector, set);
    } else if (line.includes("##")) {
      const [domains, selector] = line.split("##");
      if (hasUnsupportedSelectors(selector)) {
        throw new Error(`Custom CSS extensions not supported, got "${line}"`);
      }
      if (!domains) {
        // A selector in both lists is needed in every mode.
        generic.set(selector, (generic.get(selector) ?? true) && hideOnly);
        continue;
      }
      for (const domain of domains.split(",")) {
        if (domain.startsWith("~")) {
          const set = exceptions.get(selector) ?? new Set();
          set.add(asciiDomain(domain.slice(1)));
          exceptions.set(selector, set);
          continue;
        }
        const selectors = sites.get(asciiDomain(domain)) ?? new Map();
        selectors.set(selector, (selectors.get(selector) ?? true) && hideOnly);
        sites.set(asciiDomain(domain), selectors);
      }
    } else if (line.includes("#?#") || line.includes("#$#")) {
      throw new Error(`Extended selectors and snippets not supported: ${line}`);
    } else {
      const domain = genericHideDomain(line);
      if (domain) {
        genericHideOff.push(asciiDomain(domain));
        continue;
      }
      blocks.push({ rule: blockRule(line), hideOnly });
    }
  }

  const withIds = (rules) =>
    rules.map((rule, index) => ({ id: index + 1, ...rule }));
  const genericEntries = [...generic];
  const everywhere = genericEntries.filter(([selector]) =>
    !exceptions.has(selector)
  );

  return {
    rules: {
      answer: withIds(
        blocks.filter((block) => !block.hideOnly).map((block) => block.rule),
      ),
      hideOnly: withIds(
        blocks.filter((block) => block.hideOnly).map((block) => block.rule),
      ),
    },
    css: stylesheet(
      everywhere.filter(([, hideOnly]) => !hideOnly).map(([selector]) =>
        selector
      ),
    ),
    genericHideOff,
    perSite: {
      // Generic selectors only "Only hide it" uses: too few for a file.
      hideOnly: everywhere.filter(([, hideOnly]) => hideOnly)
        .map(([selector]) => selector),
      // [selector, hideOnly, domains that exempt it]
      generic: genericEntries.filter(([selector]) => exceptions.has(selector))
        .map((
          [selector, hideOnly],
        ) => [selector, hideOnly, [...exceptions.get(selector)]]),
      // domain -> [[selector, hideOnly]]
      sites: Object.fromEntries(
        [...sites].map(([domain, selectors]) => [domain, [...selectors]]),
      ),
      // domain -> selectors it exempts
      exceptions: Object.fromEntries(
        [...exceptions].flatMap(([selector, domains]) =>
          [...domains].map((domain) => [domain, selector])
        ).reduce((map, [domain, selector]) => {
          map.set(domain, [...(map.get(domain) ?? []), selector]);
          return map;
        }, new Map()),
      ),
    },
  };
};
