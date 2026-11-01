import { planFor, switchAllowed } from "./plan.js";
import { needsClick } from "./switches.js";
import { query, queryAll, realisticClick, waitFor } from "./dom.js";

// How long a step waits for its element: the banner may still be loading
// when the rule starts, and a settings panel can take a moment to draw.
const STEP_TIMEOUT_MS = 5000;
// Switches are in the panel once it opened; give them a moment to render.
const SWITCH_TIMEOUT_MS = 1000;

const isDisabled = (element) =>
  element.disabled === true ||
  element.getAttribute("aria-disabled") === "true";

const setSwitches = async (root, { switches, switchState }, categories) => {
  let clicks = 0;
  for (const entry of switches) {
    const items = await waitFor(
      () => queryAll(entry.selector, root),
      root,
      SWITCH_TIMEOUT_MS,
    );
    const allowed = switchAllowed(entry, categories);
    for (const item of items ?? []) {
      if (!needsClick(item, switchState, allowed)) continue;
      realisticClick(item);
      clicks += 1;
    }
  }
  return clicks;
};

// Runs a site rule for the level in categories. Resolves with the path
// taken and the clicks made; answered is false when a required step found
// nothing to press.
export const runRule = async (rule, categories) => {
  const plan = planFor(rule, categories);
  if (!plan) return { path: null, clicks: 0, answered: false };
  let root = document;
  let clicks = 0;
  const failed = () => ({ path: plan.path, clicks, answered: false });
  for (const step of plan.steps) {
    if (step.shadowRoot) {
      const host = await waitFor(
        () => query(step.shadowRoot, root),
        root,
        STEP_TIMEOUT_MS,
      );
      if (!host?.shadowRoot) return failed();
      root = host.shadowRoot;
      continue;
    }
    if (step.switches) {
      clicks += await setSwitches(root, step, categories);
      continue;
    }
    const element = await waitFor(
      () => query(step.click, root),
      root,
      STEP_TIMEOUT_MS,
    );
    if (!element) {
      if (step.optional) continue;
      return failed();
    }
    let target = element;
    if (step.ifDisabled !== undefined && isDisabled(element)) {
      target = step.ifDisabled ? query(step.ifDisabled, root) : null;
      if (!target) return failed();
    }
    realisticClick(target);
    clicks += 1;
  }
  return { path: plan.path, clicks, answered: true };
};
