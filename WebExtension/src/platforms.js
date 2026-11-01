// Turns rule names such as "onetrust_pctab" or "autoconsent:TrustArc-top"
// into the platform name shown in the popup.
const PLATFORMS = [
  [/onetrust/i, "OneTrust"],
  [/cookiebot/i, "Cookiebot"],
  [/quantcast/i, "Quantcast"],
  [/sourcepoint/i, "Sourcepoint"],
  [/didomi/i, "Didomi"],
  [/usercentrics/i, "Usercentrics"],
  [/trustarc/i, "TrustArc"],
  [/cookieyes/i, "CookieYes"],
  [/complianz/i, "Complianz"],
  [/cookieinformation/i, "Cookie Information"],
  [/osano/i, "Osano"],
  [/consentmanager/i, "consentmanager"],
  [/cookiefirst/i, "CookieFirst"],
  [/termly/i, "Termly"],
  [/ketch/i, "Ketch"],
  [/axeptio/i, "Axeptio"],
  [/sirdata/i, "Sirdata"],
];

// autoconsent, and site rules used at a mixed level, refuse or accept
// everything rather than set each category.
const ALL_OR_NOTHING = /^(autoconsent|site-refuse):/;

export const describeAnswer = (cmp) => {
  const fallback = ALL_OR_NOTHING.test(cmp);
  const name = cmp.replace(ALL_OR_NOTHING, "").replace(/^site:/, "");
  return {
    platform: PLATFORMS.find(([pattern]) => pattern.test(name))?.[1] ?? name,
    fallback,
  };
};
