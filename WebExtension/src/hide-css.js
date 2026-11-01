import { stylesheet } from "../../scripts/src/web-lists.js";

// The hide rules that depend on the site, built by scripts/src/web-lists.js:
// the CSS the background injects into a frame on host. "Only hide it" also
// gets the rules answer mode leaves for the engines to answer.

// A rule for "example.com" covers its subdomains too.
const covers = (host, domain) => host === domain || host.endsWith(`.${domain}`);

const parentDomains = (host) =>
  host.split(".").map((_, index, labels) => labels.slice(index).join("."));

export const siteCss = (perSite, host, mode) => {
  const allOf = (hideOnly) => mode === "hide" || !hideOnly;
  const domains = parentDomains(host.toLowerCase());
  const exempt = new Set(
    domains.flatMap((domain) => perSite.exceptions[domain] ?? []),
  );
  const selectors = [
    ...domains.flatMap((domain) => perSite.sites[domain] ?? [])
      .filter(([selector, hideOnly]) => !exempt.has(selector) && allOf(hideOnly))
      .map(([selector]) => selector),
    ...perSite.generic
      .filter(([selector, hideOnly, exempting]) =>
        allOf(hideOnly) && !exempt.has(selector) &&
        !exempting.some((domain) => covers(host, domain))
      )
      .map(([selector]) => selector),
    ...(mode === "hide" ? perSite.hideOnly : []),
  ];
  return stylesheet([...new Set(selectors)]);
};
