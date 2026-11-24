import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chromeManifest,
  devManifest,
  devMarks,
  extensionId,
  hostManifest,
  iconPaths,
  storeManifest,
} from "./chrome.js";

const repoJson = async (path) =>
  (await import(`../../WebExtension/${path}`, { with: { type: "json" } }))
    .default;
const repoSafari = await repoJson("manifest.json");
const repoChrome = chromeManifest(
  repoSafari,
  await repoJson("manifest.chrome.json"),
);

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

test("The dev copy names itself and its commit and keeps its ID", async () => {
  const dev = devManifest(repoChrome, "f67a04a");
  assert.deepEqual(dev.name, "Hush Extra (dev)");
  assert.deepEqual(dev.action.default_title, "Hush Extra (dev)");
  assert.deepEqual(dev.version_name, "1.0 dev f67a04a");
  assert.deepEqual(dev.version, repoChrome.version);
  assert.deepEqual(dev.action.default_icon, repoChrome.action.default_icon);
  assert.deepEqual(
    await extensionId(dev.key),
    "peklpnngkdekjbeheogkeabpllgmnefj",
  );
});

test("A dev copy without its commit stops the build", () => {
  for (const commit of [undefined, ""]) {
    assert.throws(() => devManifest(repoChrome, commit), {
      message: /needs the commit/,
    });
  }
});

test("The icons are the extension's and the toolbar button's", () => {
  assert.deepEqual(iconPaths(repoChrome), [
    "images/icon-48.png",
    "images/icon-96.png",
    "images/icon-128.png",
    "images/icon-256.png",
    "images/icon-512.png",
    "images/toolbar-16.png",
    "images/toolbar-19.png",
    "images/toolbar-32.png",
    "images/toolbar-38.png",
    "images/toolbar-48.png",
    "images/toolbar-72.png",
  ]);
});

// chrome-store.js refuses any build devMarks finds something in, so these
// prove the store zip cannot carry the dev copy's name, version_name or icons.
test("The store build carries no dev mark", () => {
  const store = storeManifest(repoChrome, 300);
  assert.deepEqual(devMarks(store, repoSafari, () => true), []);
});

test("Every dev mark on its own keeps a build out of the store", () => {
  const dev = devManifest(repoChrome, "f67a04a");
  const clean = () => true;
  assert.deepEqual(
    devMarks({ ...repoChrome, name: dev.name }, repoSafari, clean),
    ['name "Hush Extra (dev)"'],
  );
  assert.deepEqual(
    devMarks({ ...repoChrome, action: dev.action }, repoSafari, clean),
    ['toolbar title "Hush Extra (dev)"'],
  );
  assert.deepEqual(
    devMarks(
      { ...repoChrome, version_name: dev.version_name },
      repoSafari,
      clean,
    ),
    ['version_name "1.0 dev f67a04a"'],
  );
  assert.deepEqual(
    devMarks(
      repoChrome,
      repoSafari,
      (path) => path !== "images/toolbar-16.png",
    ),
    ["icon images/toolbar-16.png"],
  );
  assert.deepEqual(devMarks(dev, repoSafari, () => false).length, 3 + 11);
});
