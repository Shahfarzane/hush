import assert from "node:assert/strict";
import { test } from "node:test";
import {
  autoActionFor,
  consentTypesFor,
  DEFAULT_SETTINGS,
  levelTitle,
  normalizeSettings,
  shouldAnswer,
  siteFor,
  siteKey,
} from "./settings.js";

test("Functional only consents to type A alone", () => {
  assert.deepEqual(consentTypesFor(DEFAULT_SETTINGS), {
    A: true,
    B: false,
    D: false,
    E: false,
    F: false,
    X: false,
  });
});

test("Advertising covers content selection and ads", () => {
  const settings = normalizeSettings({
    categories: { functional: false, advertising: true },
  });
  const types = consentTypesFor(settings);
  assert.deepEqual([types.A, types.E, types.F], [false, true, true]);
});

test("Missing fields fall back to defaults", () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(
    normalizeSettings({ categories: { performance: true } }).categories,
    {
      functional: true,
      performance: true,
      advertising: false,
      other: false,
    },
  );
});

test("Paused sites cover subdomains only", () => {
  const settings = normalizeSettings({ pausedSites: ["example.com"] });
  assert.deepEqual(shouldAnswer(settings, "example.com"), false);
  assert.deepEqual(shouldAnswer(settings, "www.example.com"), false);
  assert.deepEqual(shouldAnswer(settings, "notexample.com"), true);
});

test("Hide mode never answers", () => {
  assert.deepEqual(
    shouldAnswer(normalizeSettings({ mode: "hide" }), "example.com"),
    false,
  );
});

test("The autoconsent fallback refuses unless everything is allowed", () => {
  assert.deepEqual(autoActionFor(DEFAULT_SETTINGS), "optOut");
  assert.deepEqual(
    autoActionFor(normalizeSettings({
      categories: { functional: true, performance: true, advertising: true },
    })),
    "optOut",
  );
  assert.deepEqual(
    autoActionFor(normalizeSettings({
      categories: {
        functional: true,
        performance: true,
        advertising: true,
        other: true,
      },
    })),
    "optIn",
  );
});

test("Level titles match the app's presets", () => {
  assert.deepEqual(levelTitle(DEFAULT_SETTINGS), "Functional only");
  assert.deepEqual(
    levelTitle(normalizeSettings({ categories: { functional: false } })),
    "Maximum privacy",
  );
  assert.deepEqual(
    levelTitle(normalizeSettings({ categories: { performance: true } })),
    "Balanced",
  );
  assert.deepEqual(
    levelTitle(normalizeSettings({ categories: { advertising: true } })),
    "Custom",
  );
});

test("Pausing a page pauses its site without www", () => {
  assert.deepEqual(siteFor("www.Example.com"), "example.com");
  assert.deepEqual(siteFor("news.example.co.uk"), "news.example.co.uk");
});

test("Hosts on the same site share a key", () => {
  assert.deepEqual(siteKey("open.spotify.com"), siteKey("www.spotify.com"));
  assert.deepEqual(siteKey("news.bbc.co.uk"), "bbc.co.uk");
  assert.deepEqual(siteKey("example.com"), "example.com");
});
