import { assertEquals } from "jsr:@std/assert@1";
import {
  autoActionFor,
  consentTypesFor,
  DEFAULT_SETTINGS,
  normalizeSettings,
  shouldAnswer,
} from "./settings.js";

Deno.test("Functional only consents to type A alone", () => {
  assertEquals(consentTypesFor(DEFAULT_SETTINGS), {
    A: true,
    B: false,
    D: false,
    E: false,
    F: false,
    X: false,
  });
});

Deno.test("Advertising covers content selection and ads", () => {
  const settings = normalizeSettings({
    categories: { functional: false, advertising: true },
  });
  const types = consentTypesFor(settings);
  assertEquals([types.A, types.E, types.F], [false, true, true]);
});

Deno.test("Missing fields fall back to defaults", () => {
  assertEquals(normalizeSettings(undefined), DEFAULT_SETTINGS);
  assertEquals(
    normalizeSettings({ categories: { performance: true } }).categories,
    {
      functional: true,
      performance: true,
      advertising: false,
      other: false,
    },
  );
});

Deno.test("Paused sites cover subdomains only", () => {
  const settings = normalizeSettings({ pausedSites: ["example.com"] });
  assertEquals(shouldAnswer(settings, "example.com"), false);
  assertEquals(shouldAnswer(settings, "www.example.com"), false);
  assertEquals(shouldAnswer(settings, "notexample.com"), true);
});

Deno.test("Hide mode never answers", () => {
  assertEquals(
    shouldAnswer(normalizeSettings({ mode: "hide" }), "example.com"),
    false,
  );
});

Deno.test("The autoconsent fallback refuses unless everything is allowed", () => {
  assertEquals(autoActionFor(DEFAULT_SETTINGS), "optOut");
  assertEquals(
    autoActionFor(normalizeSettings({
      categories: { functional: true, performance: true, advertising: true },
    })),
    "optOut",
  );
  assertEquals(
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
