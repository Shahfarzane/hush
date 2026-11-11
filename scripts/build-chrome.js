// Writes Chrome's manifest into an extension built by `make extension`:
// build-chrome.js <extension dir>.
import { chromeManifest } from "./src/chrome.js";

const [extensionDir] = Deno.args;
const read = (path) =>
  JSON.parse(Deno.readTextFileSync(new URL(path, import.meta.url)));

Deno.writeTextFileSync(
  `${extensionDir}/manifest.json`,
  JSON.stringify(
    chromeManifest(
      read("../WebExtension/manifest.json"),
      read("../WebExtension/manifest.chrome.json"),
    ),
    null,
    2,
  ),
);
