// How a site rule (data/site-rules.json) answers a Hush level: set each
// category's switch when the level is mixed, refuse when it allows nothing,
// accept all only when it allows everything. A banner Hush cannot refuse is
// never accepted.

export const CATEGORIES = ["functional", "performance", "advertising", "other"];

// A switch can cover several Hush categories (a site's "comfort" cookies
// may be both functional and statistics). It goes on only when every one
// of them is allowed.
export const switchAllowed = (entry, categories) =>
  entry.categories.every((category) => categories[category]);

// The settings path needs switches to set and a button to save them;
// saving a panel without switches would keep whatever the site preset.
const hasSettings = (rule) => !!rule.save && (rule.switches ?? []).length > 0;

const refusal = (rule) =>
  rule.reject
    ? "reject"
    : rule.necessaryOnly
    ? "necessaryOnly"
    : hasSettings(rule)
    ? "settings"
    : null;

export const pathFor = (rule, categories) => {
  const allowed = CATEGORIES.map((category) => categories[category]);
  if (allowed.every(Boolean)) {
    return rule.acceptAll ? "acceptAll" : hasSettings(rule) ? "settings" : null;
  }
  if (!allowed.some(Boolean)) return refusal(rule);
  return hasSettings(rule) ? "settings" : refusal(rule);
};

// The steps the engine runs, in order. An optional click may find nothing
// without ending the answer.
export const planFor = (rule, categories) => {
  const path = pathFor(rule, categories);
  if (!path) return null;
  const steps = [];
  if (rule.firstClick) steps.push({ click: rule.firstClick, optional: true });
  if (rule.shadowRoot) steps.push({ shadowRoot: rule.shadowRoot });
  if (path !== "settings") {
    steps.push({ click: rule[path] });
    return { path, steps };
  }
  if (rule.openSettings) steps.push({ click: rule.openSettings });
  steps.push({
    switches: rule.switches,
    switchState: rule.switchState ?? "auto",
  });
  // Some panels keep Save disabled until a switch changes; refusing is
  // then the only way to store an answer.
  steps.push({
    click: rule.save,
    ifDisabled: rule.reject ?? rule.necessaryOnly ?? null,
  });
  return { path, steps };
};
