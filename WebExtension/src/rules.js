// Fixes for vendored Consent-O-Matic rules, kept in
// data/consent-o-matic-overrides.json so they survive re-vendoring. An
// override can replace whole methods by name (`methods`), replace how a rule
// is found (`detectors`), change the category of consents whose selectors
// contain a given string (`retype`), or leave a rule out (`disable`) so the
// autoconsent fallback answers instead.
//
// Current overrides:
// - cookiebot SAVE_CONSENT: upstream clicks "Allow selection" and then
//   "Deny" while the dialog fades out, which saves reject-all whatever the
//   user's categories are. The override stops after "Allow selection".
// - quantcast2b: OPEN_OPTIONS matched "More options" by text in five
//   languages, and SAVE_CONSENT then clicked the primary button, which on
//   the summary screen is Accept. Any other language (Swedish on feber.se)
//   accepted everything. Options now open by id, and saving only happens
//   from the options view: #save-and-exit, or on markup without ids
//   (astro-seek.com) the primary button of a footer that has the options
//   view's links. The summary's footer has no links, so Agree stays out.
// - didomi.io DO_CONSENT: "Functionality" and "Authentication and
//   authorization management" were grouped with device storage (D), so
//   functional purposes were refused. They now get their own A branch.
//   Didomi's newer popup (researchgate.net, didomi.io) has "Reject all",
//   "Accept all" and "Save preferences" in its footer, and the first two
//   only flip every switch. Saving the partner view just returns to the
//   purposes, so the rule now waits for them and presses Save preferences
//   (#btn-toggle-save); before, nothing was saved and both the banner and
//   the popup stayed open. SAVE_CONSENT presses it too instead of the first
//   footer button, which there is the "Reject all" toggle.
// - amazon: its advertising control is labelled functional (A), so
//   "functional only" switched advertising on. Retyped to ads (F).
// - cookieinformation: one markup variant labels statistics functional (A),
//   which switched analytics on at "functional only". Retyped to B.
// - cookiecontrolcivic, lamarquezone, lenovo, onetrust: social sharing or
//   social media cookies are labelled functional or analytics; social media
//   counts as advertising (F).
// - springer, chandago: ad measurement and ad selection are labelled
//   analytics (B); chandago also has measurement labelled ads (F). Swapped.
// - bing: "Save Settings" stays disabled until a switch changes, so when the
//   level matches Bing's all-off defaults the rule clicked a dead button and
//   left the panel open. It now waits for the panel's switches, and if Save
//   is still disabled it clicks Bing's own Reject instead.
// - iubuenda (iubenda's classic banner): OPEN_OPTIONS clicked Customize and
//   the rule went on before iubenda drew its preferences panel (~180 ms), so
//   no switch was set and Save was never pressed. It now waits for Save.
// - onetrust_banner UTILITY: hides the banner and clicks OneTrust's settings
//   button, but when the site has no #onetrust-pc-btn-handler it clicked
//   Accept All instead. lufthansa.com opens settings with a link
//   (.optanon-show-settings), so Hush accepted every category there behind
//   the hidden banner. The rule now also finds that link, and falls back to
//   Reject All, never Accept.
// - trustarc_popup_hider: hides TrustArc's overlay for up to five seconds
//   while the iframe rule (trustarcframe) answers. The newer dialog has no
//   iframe, so it hid the overlay for nothing, kept every other rule waiting
//   and put the dialog back unanswered. It now skips that dialog, which
//   trustarc_newcm answers.
// - yahoo_consent, yahoo_popup: disabled. Both target older versions of
//   consent.yahoo.com: on the current page yahoo_consent claims the banner
//   with zero clicks (its switches and Save button are on a settings view it
//   never opens) and yahoo_popup opens settings without saving. autoconsent's
//   Yahoo rule clicks "Reject all" there.
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
    Object.entries(rules).filter(([name]) => !overrides[name]?.disable).map((
      [name, rule],
    ) => {
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
        detectors: override.detectors ?? rule.detectors,
        methods: override.retype
          ? retypeConsents(methods, override.retype)
          : methods,
      }];
    }),
  );

// Vendored rules with Hush's fixes applied, plus rules Hush maintains itself
// in data/consent-rules.json for platforms Consent-O-Matic does not cover
// (CookieYes) or no longer matches (Usercentrics' shadow DOM banner; X,
// whose banner left #layers and div[role=button] for a "Cookie consent"
// region with two buttons: Accept first, Refuse second; and iubenda 1.109's
// tb-banner web components, three shadow roots deep, whose buttons keep the
// classes reject-button and accept-button in every language; and GetTerms'
// widget in the cookie-widget-wrapper shadow root, whose preferences button
// is the one with aria-haspopup="dialog"; and TrustArc's dialog in the
// .trustarc_newcm_container shadow root, which replaced the iframe its
// vendored rule answers, and whose switches name the refusing button .on).
export const buildRules = (vendored, overrides, own) => ({
  ...applyOverrides(vendored, overrides),
  ...own,
});
