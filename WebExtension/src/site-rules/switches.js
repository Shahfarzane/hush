// Whether a category switch needs a click to match the level, read by the
// rule's switchState. Returns null when the switch's state cannot be read.

const READERS = {
  checkbox: (item) => item.checked === true,
  "aria-checked": (item) => item.getAttribute("aria-checked") === "true",
  "aria-pressed": (item) => item.getAttribute("aria-pressed") === "true",
};

// "auto": the first state the switch exposes.
export const detectSwitchState = (item) => {
  if (item.type === "checkbox") return "checkbox";
  if (item.hasAttribute("aria-checked")) return "aria-checked";
  if (item.hasAttribute("aria-pressed")) return "aria-pressed";
  return null;
};

export const needsClick = (item, switchState, allowed) => {
  const state = switchState === "auto" ? detectSwitchState(item) : switchState;
  const read = READERS[state];
  return read ? read(item) !== allowed : null;
};
