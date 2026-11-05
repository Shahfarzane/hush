// Reports what Hush did in this frame to the background, which logs it in
// debug builds.

// Read back after answering to confirm what the site stored.
const CONSENT_COOKIES = [
  "CookieConsent",
  "OptanonConsent",
  "euconsent-v2",
  "cookiefirst-consent",
  "notice_preferences",
  "BCP",
  "EuConsent",
];

const readConsentCookies = () =>
  Object.fromEntries(
    document.cookie.split("; ")
      .map((cookie) => {
        const separator = cookie.indexOf("=");
        return [cookie.slice(0, separator), cookie.slice(separator + 1)];
      })
      .filter(([name]) => CONSENT_COOKIES.includes(name)),
  );

export const report = (fields) =>
  browser.runtime.sendMessage({
    type: "report",
    host: location.host,
    frame: window === window.parent ? "top" : "iframe",
    ...fields,
  }).catch(() => {});

// Consent-O-Matic calls a banner handled even when its rule found nothing to
// press, as its old Yahoo rules did on today's page. Only a click counts.
export const isAnswered = (event) => event.handled && event.clicks > 0;

// Consent-O-Matic's five-second "no banner here" timer keeps running once a
// rule has started, so a rule still at work gets reported as no banner.
// Taken at its word, the fallback would start clicking the same dialog.
export const stillAnswering = (event, engine) =>
  !event.handled && !event.error && engine.checkRunning;

export const reportAnswered = (cmp, clicks) => {
  report({ outcome: "handled", cmp, clicks });
  setTimeout(
    () => report({ outcome: "cookies", cookies: readConsentCookies() }),
    2000,
  );
};
