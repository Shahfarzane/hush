// Fixes for vendored Consent-O-Matic rules, kept in
// data/consent-o-matic-overrides.json so they survive re-vendoring. An
// override can replace whole methods by name (`methods`) or change the
// category of consents whose selectors contain a given string (`retype`).
//
// Current overrides:
// - cookiebot SAVE_CONSENT: upstream clicks "Allow selection" and then
//   "Deny" while the dialog fades out, which saves reject-all whatever the
//   user's categories are. The override stops after "Allow selection".
// - quantcast2b: OPEN_OPTIONS matched "More options" by text in five
//   languages, and SAVE_CONSENT then clicked the primary button, which on
//   the summary screen is Accept. Any other language (Swedish on feber.se)
//   accepted everything. Options now open by id, and saving only happens
//   from the options view.
// - didomi.io DO_CONSENT: "Functionality" and "Authentication and
//   authorization management" were grouped with device storage (D), so
//   functional purposes were refused. They now get their own A branch.
// - amazon: its advertising control is labelled functional (A), so
//   "functional only" switched advertising on. Retyped to ads (F).
// - cookieinformation: one markup variant labels statistics functional (A),
//   which switched analytics on at "functional only". Retyped to B.
// - cookiecontrolcivic, lamarquezone, lenovo, onetrust: social sharing or
//   social media cookies are labelled functional or analytics; social media
//   counts as advertising (F).
// - springer, chandago: ad measurement and ad selection are labelled
//   analytics (B); chandago also has measurement labelled ads (F). Swapped.
const retypeConsents = (node, retype) => {
  if (Array.isArray(node)) {
    return node.map((child) => retypeConsents(child, retype));
  }
  if (!node || typeof node !== "object") return node;
  const copy = Object.fromEntries(
    Object.entries(node).map((
      [key, child],
    ) => [key, retypeConsents(child, retype)]),
  );
  if (copy.type === "consent") {
    copy.consents = copy.consents.map((consent) => {
      const selectors = JSON.stringify({ ...consent, type: undefined });
      const match = Object.keys(retype).find((key) => selectors.includes(key));
      return match ? { ...consent, type: retype[match] } : consent;
    });
  }
  return copy;
};

export const applyOverrides = (rules, overrides) =>
  Object.fromEntries(
    Object.entries(rules).map(([name, rule]) => {
      const override = overrides[name];
      if (!override) return [name, rule];
      const replaced = new Map(
        (override.methods ?? []).map((method) => [method.name, method]),
      );
      const methods = rule.methods.map((method) =>
        replaced.get(method.name) ?? method
      );
      return [name, {
        ...rule,
        methods: override.retype
          ? retypeConsents(methods, override.retype)
          : methods,
      }];
    }),
  );

// Vendored rules with Hush's fixes applied, plus rules Hush maintains itself
// in data/consent-rules.json for platforms Consent-O-Matic does not cover
// (CookieYes) or no longer matches (Usercentrics' shadow DOM banner).
export const buildRules = (vendored, overrides, own) => ({
  ...applyOverrides(vendored, overrides),
  ...own,
});
