// The Chrome and Helium build: Safari's manifest with the keys in
// WebExtension/manifest.chrome.json laid over it, and the native messaging
// host manifests through which it reaches the app's settings.

// Whole top-level keys: Chrome's background is a service worker, not
// Safari's background page, so nothing of Safari's may remain in it.
export const chromeManifest = (manifest, overlay) => ({
  ...manifest,
  ...overlay,
});

// The Chrome Web Store upload: the store rejects a manifest that carries
// `key`, and gives the item an ID of its own. Each upload needs a higher
// version than the last, so the store build appends a build number (commits
// on HEAD) to Safari's version: 1.0 becomes 1.0.<build>.
export const storeManifest = ({ key: _key, ...manifest }, build) => ({
  ...manifest,
  ...(build === undefined ? {} : { version: `${manifest.version}.${build}` }),
});

// Chrome derives an extension's ID from its public key: the first 16 bytes
// of the key's SHA-256, each hex digit written as a letter from a to p.
export const extensionId = async (key) => {
  const der = Uint8Array.from(atob(key), (char) => char.charCodeAt(0));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", der));
  return [...digest.slice(0, 16)]
    .map((byte) => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15)))
    .join("");
};

// background.js sends to this name, the same one Safari routes to the app.
export const HOST_NAME = "ceo.nerd.hush";

// The Chrome Web Store item's ID, which the dashboard gave it on the first
// upload. The unpacked build keeps the ID from manifest.chrome.json's key.
export const STORE_EXTENSION_ID = "megbdpijbohdgindboffkkklekhhnamp";

export const hostManifest = (path, ids) => ({
  name: HOST_NAME,
  description: "Hush Extra settings",
  path,
  type: "stdio",
  allowed_origins: ids.map((id) => `chrome-extension://${id}/`),
});

// Each browser's user data folder under ~/Library/Application Support; it
// looks for host manifests in NativeMessagingHosts inside it.
export const BROWSERS = [
  ["Google Chrome", "Google/Chrome"],
  ["Helium", "net.imput.helium"],
];
