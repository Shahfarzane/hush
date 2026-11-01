import { siteKey } from "../../WebExtension/src/settings.js";

// Approximates how Safari applies Hush's declarativeNetRequest rules, so the
// corpus blocks what the extension would: the highest-priority rule that
// matches wins, and allow (priority 2) beats block (priority 1).

const ANY_SCHEME_AND_SUBDOMAIN = "^[a-z][a-z0-9+.-]*://([^/?#]*\\.)?";
const SEPARATOR = "(?:[^a-zA-Z0-9_.%-]|$)";

export const urlFilterRegExp = (filter) => {
  let source = "";
  let rest = filter;
  if (rest.startsWith("||")) {
    source = ANY_SCHEME_AND_SUBDOMAIN;
    rest = rest.slice(2);
  } else if (rest.startsWith("|")) {
    source = "^";
    rest = rest.slice(1);
  }
  const anchoredEnd = rest.endsWith("|");
  if (anchoredEnd) rest = rest.slice(0, -1);
  for (const char of rest) {
    source += char === "*"
      ? ".*"
      : char === "^"
      ? SEPARATOR
      : char.replace(/[.+?${}()|[\]\\/]/g, "\\$&");
  }
  return new RegExp(anchoredEnd ? `${source}$` : source, "i");
};

const covers = (host, domains) =>
  domains.some((domain) => host === domain || host.endsWith(`.${domain}`));

const matches = (condition, regExp, request) => {
  const types = condition.resourceTypes;
  if (types ? !types.includes(request.type) : request.type === "main_frame") {
    return false;
  }
  if (condition.excludedResourceTypes?.includes(request.type)) return false;
  if (
    condition.initiatorDomains &&
    !covers(request.initiator, condition.initiatorDomains)
  ) {
    return false;
  }
  if (covers(request.initiator, condition.excludedInitiatorDomains ?? [])) {
    return false;
  }
  if (condition.domainType) {
    const thirdParty =
      siteKey(new URL(request.url).hostname) !== siteKey(request.initiator);
    if (thirdParty !== (condition.domainType === "thirdParty")) return false;
  }
  return regExp.test(request.url);
};

// request: { url, type (declarativeNetRequest resource type), initiator
// (the host of the frame that asked) }.
export const createMatcher = (rules) => {
  const compiled = rules.map((rule) => ({
    rule,
    regExp: urlFilterRegExp(rule.condition.urlFilter),
  }));
  return (request) => {
    let best = null;
    for (const { rule, regExp } of compiled) {
      if (!matches(rule.condition, regExp, request)) continue;
      if (
        !best || rule.priority > best.priority ||
        rule.priority === best.priority && rule.action.type === "allow"
      ) best = rule;
    }
    return best?.action.type === "block";
  };
};
