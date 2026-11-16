import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chromeManifest,
  extensionId,
  hostManifest,
  storeManifest,
} from "./chrome.js";

const safari = {
  manifest_version: 3,
  permissions: ["storage", "nativeMessaging"],
  background: { scripts: ["background.js"], persistent: false },
};

test("Chrome's background replaces Safari's whole", () => {
  const manifest = chromeManifest(safari, {
    minimum_chrome_version: "148",
    background: { service_worker: "background.js" },
  });
  assert.deepEqual(manifest.background, { service_worker: "background.js" });
  assert.deepEqual(manifest.permissions, safari.permissions);
  assert.deepEqual(manifest.minimum_chrome_version, "148");
});

// The ID Chrome showed for this key when the build was loaded.
test("The extension ID comes from the key", async () => {
  const key = (await import("../../WebExtension/manifest.chrome.json", {
    with: { type: "json" },
  })).default.key;
  assert.deepEqual(await extensionId(key), "peklpnngkdekjbeheogkeabpllgmnefj");
});

test("The host manifest lets in only the IDs it is given", () => {
  assert.deepEqual(
    hostManifest("/Users/me/hush-chrome-host", [
      "peklpnngkdekjbeheogkeabpllgmnefj",
      "megbdpijbohdgindboffkkklekhhnamp",
    ]),
    {
      name: "ceo.nerd.hush",
      description: "Hush Extra settings",
      path: "/Users/me/hush-chrome-host",
      type: "stdio",
      allowed_origins: [
        "chrome-extension://peklpnngkdekjbeheogkeabpllgmnefj/",
        "chrome-extension://megbdpijbohdgindboffkkklekhhnamp/",
      ],
    },
  );
});

test("The store upload carries no key and keeps the rest", () => {
  const manifest = chromeManifest(safari, {
    key: "MIIB",
    background: { service_worker: "background.js" },
  });
  const store = storeManifest(manifest);
  assert.deepEqual("key" in store, false);
  assert.deepEqual(store.background, manifest.background);
  assert.deepEqual(store.permissions, safari.permissions);
});

test("The store upload's version appends the build number", () => {
  const store = storeManifest({ version: "1.0", key: "MIIB" }, 265);
  assert.deepEqual(store.version, "1.0.265");
  assert.deepEqual("key" in store, false);
});

test("A missing or bad build number stops the store build", () => {
  for (const build of [Number(undefined), 0, 1.5, 65536]) {
    assert.throws(
      () => storeManifest({ version: "1.0" }, build),
      { message: /build number must be/ },
    );
  }
});
