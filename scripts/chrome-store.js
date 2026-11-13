// Turns a Chrome build into the Chrome Web Store upload, in place:
// chrome-store.js <extension dir>. Drops the manifest's `key` and prints the
// version, which names the zip.
import { storeManifest } from "./src/chrome.js";

const [extensionDir] = Deno.args;
const path = `${extensionDir}/manifest.json`;
const manifest = JSON.parse(Deno.readTextFileSync(path));
Deno.writeTextFileSync(path, JSON.stringify(storeManifest(manifest), null, 2));
console.log(manifest.version);
