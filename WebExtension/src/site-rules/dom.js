// DOM helpers for site rules. A selector string may list alternatives
// separated by commas (the first one found wins) and may use
// :contains('text') to match an element by its text, ignoring case (buttons
// often show their text uppercased by CSS).

const CONTAINS = /^(.*):contains\(['"]?([^'"]+)['"]?\)(.*)$/;

export const parseContains = (selector) => {
  const match = selector.match(CONTAINS);
  if (!match) return null;
  return {
    before: match[1].trim() || "*",
    text: match[2],
    after: match[3].trim() || null,
  };
};

const hasText = (element, text) =>
  element.textContent.toLowerCase().includes(text.toLowerCase());

const queryOne = (selector, root) => {
  const contains = parseContains(selector);
  if (!contains) return root.querySelector(selector);
  for (const element of root.querySelectorAll(contains.before)) {
    if (!hasText(element, contains.text)) continue;
    if (!contains.after) return element;
    const inner = element.querySelector(contains.after);
    if (inner) return inner;
  }
  return null;
};

const queryEvery = (selector, root) => {
  const contains = parseContains(selector);
  if (!contains) return [...root.querySelectorAll(selector)];
  return [...root.querySelectorAll(contains.before)]
    .filter((element) => hasText(element, contains.text))
    .flatMap((element) =>
      contains.after ? [...element.querySelectorAll(contains.after)] : [element]
    );
};

const alternatives = (selectors) =>
  selectors.split(",").map((selector) => selector.trim()).filter(Boolean);

const safely = (find) => {
  try {
    return find();
  } catch {
    // An alternative that is not valid CSS in this browser matches nothing.
    return null;
  }
};

export const query = (selectors, root = document) => {
  for (const selector of alternatives(selectors)) {
    const element = safely(() => queryOne(selector, root));
    if (element) return element;
  }
  return null;
};

export const queryAll = (selectors, root = document) => {
  for (const selector of alternatives(selectors)) {
    const elements = safely(() => queryEvery(selector, root)) ?? [];
    if (elements.length > 0) return elements;
  }
  return [];
};

// Resolves with what find() returns once it is truthy (or non-empty), or
// with null after timeout ms. Watches the root for changes and also polls,
// since attribute and style changes do not always come with new nodes.
export const waitFor = (find, root, timeout) =>
  new Promise((resolve) => {
    const found = (value) => Array.isArray(value) ? value.length > 0 : !!value;
    const first = find();
    if (found(first) || timeout <= 0) {
      resolve(found(first) ? first : null);
      return;
    }
    let observer;
    const finish = (value) => {
      observer?.disconnect();
      clearInterval(poll);
      clearTimeout(limit);
      resolve(value);
    };
    const check = () => {
      const value = find();
      if (found(value)) finish(value);
    };
    observer = new MutationObserver(check);
    observer.observe(root, { childList: true, subtree: true });
    const poll = setInterval(check, 100);
    const limit = setTimeout(() => finish(null), timeout);
  });

// The pointer and mouse events a person's click sends, for banners that
// listen for pointerdown or mousedown rather than click.
export const realisticClick = (element) => {
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
  };
  const pointer = (type, buttons) => {
    try {
      element.dispatchEvent(
        new PointerEvent(type, {
          ...init,
          buttons,
          pointerType: "mouse",
          isPrimary: true,
        }),
      );
    } catch {
      // Older WebKit without PointerEvent: the mouse events still go out.
    }
  };
  const mouse = (type, buttons) =>
    element.dispatchEvent(new MouseEvent(type, { ...init, buttons }));
  pointer("pointerover", 0);
  mouse("mouseover", 0);
  pointer("pointerdown", 1);
  mouse("mousedown", 1);
  element.focus?.();
  pointer("pointerup", 0);
  mouse("mouseup", 0);
  element.click();
};
