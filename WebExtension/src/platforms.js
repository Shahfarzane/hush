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

export const describeAnswer = (cmp) => {
  const fallback = cmp.startsWith("autoconsent:");
  const name = cmp.replace(/^autoconsent:/, "");
  return {
    platform: PLATFORMS.find(([pattern]) => pattern.test(name))?.[1] ?? name,
    fallback,
  };
};
