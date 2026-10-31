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
