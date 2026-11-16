// Registers the native messaging host with each browser in BROWSERS that has
// run on this Mac: chrome-host.js <host path>.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  BROWSERS,
  extensionId,
  HOST_NAME,
  hostManifest,
  STORE_EXTENSION_ID,
} from "./src/chrome.js";

const [hostPath] = process.argv.slice(2);
const { key } = JSON.parse(
  readFileSync(
    new URL("../WebExtension/manifest.chrome.json", import.meta.url),
    "utf8",
  ),
);
const id = await extensionId(key);
const support = `${process.env.HOME}/Library/Application Support`;

for (const [name, folder] of BROWSERS) {
  const dataDir = `${support}/${folder}`;
  if (!existsSync(dataDir)) {
    console.error(`${name}: not on this Mac, skipped`);
    continue;
  }
  const hostsDir = `${dataDir}/NativeMessagingHosts`;
  mkdirSync(hostsDir, { recursive: true });
  const path = `${hostsDir}/${HOST_NAME}.json`;
  writeFileSync(
    path,
    `${
      JSON.stringify(hostManifest(hostPath, [id, STORE_EXTENSION_ID]), null, 2)
    }\n`,
  );
  console.error(`${name}: ${path}`);
}
console.error(`Extension IDs: ${id} (unpacked), ${STORE_EXTENSION_ID} (store)`);
