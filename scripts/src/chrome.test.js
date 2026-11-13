import { assertEquals } from "jsr:@std/assert@1";
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

Deno.test("Chrome's background replaces Safari's whole", () => {
  const manifest = chromeManifest(safari, {
    minimum_chrome_version: "148",
    background: { service_worker: "background.js" },
  });
  assertEquals(manifest.background, { service_worker: "background.js" });
  assertEquals(manifest.permissions, safari.permissions);
  assertEquals(manifest.minimum_chrome_version, "148");
});

// The ID Chrome showed for this key when the build was loaded.
Deno.test("The extension ID comes from the key", async () => {
  const key = (await import("../../WebExtension/manifest.chrome.json", {
    with: { type: "json" },
  })).default.key;
  assertEquals(await extensionId(key), "peklpnngkdekjbeheogkeabpllgmnefj");
});

Deno.test("The host manifest lets in only the IDs it is given", () => {
  assertEquals(
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

Deno.test("The store upload carries no key and keeps the rest", () => {
  const manifest = chromeManifest(safari, {
    key: "MIIB",
    background: { service_worker: "background.js" },
  });
  const store = storeManifest(manifest);
  assertEquals("key" in store, false);
  assertEquals(store.background, manifest.background);
  assertEquals(store.permissions, safari.permissions);
});
