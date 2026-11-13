// Turns a Chrome build into the Chrome Web Store upload, in place:
// chrome-store.js <extension dir> <build number>. Drops the manifest's `key`,
// sets the version to <Safari version>.<build number>, and prints it (it
// names the zip).
import { storeManifest } from "./src/chrome.js";

const [extensionDir, build] = Deno.args;
const path = `${extensionDir}/manifest.json`;
const manifest = storeManifest(
  JSON.parse(Deno.readTextFileSync(path)),
  Number(build),
);
Deno.writeTextFileSync(path, JSON.stringify(manifest, null, 2));
console.log(manifest.version);
