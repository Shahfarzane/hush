// Reports what Hush did in this frame to the background, which logs it in
// debug builds.

// Read back after answering to confirm what the site stored.
const CONSENT_COOKIES = [
  "CookieConsent",
  "OptanonConsent",
  "euconsent-v2",
  "cookiefirst-consent",
  "notice_preferences",
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

export const reportAnswered = (cmp, clicks) => {
  report({ outcome: "handled", cmp, clicks });
  setTimeout(
    () => report({ outcome: "cookies", cookies: readConsentCookies() }),
    2000,
  );
};
