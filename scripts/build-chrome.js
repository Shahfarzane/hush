// Writes Chrome's manifest into an extension built by `make extension`:
// build-chrome.js <extension dir>.
import { readFileSync, writeFileSync } from "node:fs";
import { chromeManifest } from "./src/chrome.js";

const [extensionDir] = process.argv.slice(2);
const read = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

writeFileSync(
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
