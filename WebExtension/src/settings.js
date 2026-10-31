// Same JSON shape as Shared/Models/ConsentSettings.swift.
export const DEFAULT_SETTINGS = {
  version: 1,
  mode: "answer",
  categories: {
    functional: true,
    performance: false,
    advertising: false,
    other: false,
  },
  hideWhileAnswering: true,
  pausedSites: [],
};

export const normalizeSettings = (settings) => ({
  ...DEFAULT_SETTINGS,
  ...settings,
  categories: { ...DEFAULT_SETTINGS.categories, ...settings?.categories },
  pausedSites: settings?.pausedSites ?? [],
});

// Consent-O-Matic consent types, mapped as in docs/plan.md ("Category mapping"):
// A functionality, B analytics, D storage and access, E content selection,
// F ads, X other.
export const consentTypesFor = ({ categories }) => ({
  A: categories.functional,
  B: categories.performance,
  D: categories.other,
  E: categories.advertising,
  F: categories.advertising,
  X: categories.other,
});

export const isPaused = ({ pausedSites }, host) =>
  pausedSites.some((site) => host === site || host.endsWith(`.${site}`));

export const shouldAnswer = (settings, host) =>
  settings.mode === "answer" && !isPaused(settings, host);

// autoconsent can only accept or refuse everything, so it accepts only when
// every category is allowed.
export const autoActionFor = ({ categories }) =>
  Object.values(categories).every(Boolean) ? "optIn" : "optOut";

// Same presets and titles as PrivacyLevel in Shared/Models/ConsentSettings.swift.
const LEVELS = [
  ["Maximum privacy", [false, false, false, false]],
  ["Functional only", [true, false, false, false]],
  ["Balanced", [true, true, false, false]],
];

export const levelTitle = ({ categories }) => {
  const values = [
    categories.functional,
    categories.performance,
    categories.advertising,
    categories.other,
  ];
  return LEVELS.find(([, preset]) =>
    preset.every((value, index) => value === values[index])
  )?.[0] ?? "Custom";
};

// The site Pause on this site adds: the host without a leading "www.".
export const siteFor = (host) => host.toLowerCase().replace(/^www\./, "");

// Rough registrable domain, so an answer on www.spotify.com still shows on
// open.spotify.com after a redirect: the last two labels, or three when the
// second-last is a short registry label such as "co" in example.co.uk.
export const siteKey = (host) => {
  const labels = host.toLowerCase().split(".");
  const count = labels.length > 2 && labels.at(-2).length <= 3 ? 3 : 2;
  return labels.slice(-count).join(".");
};
