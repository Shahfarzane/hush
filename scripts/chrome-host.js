// Registers the native messaging host with each browser in BROWSERS that has
// run on this Mac: chrome-host.js <host path>.
import {
  BROWSERS,
  extensionId,
  HOST_NAME,
  hostManifest,
  STORE_EXTENSION_ID,
} from "./src/chrome.js";

const [hostPath] = Deno.args;
const { key } = JSON.parse(
  Deno.readTextFileSync(
    new URL("../WebExtension/manifest.chrome.json", import.meta.url),
  ),
);
const id = await extensionId(key);
const support = `${Deno.env.get("HOME")}/Library/Application Support`;

for (const [name, folder] of BROWSERS) {
  const dataDir = `${support}/${folder}`;
  try {
    Deno.statSync(dataDir);
  } catch {
    console.error(`${name}: not on this Mac, skipped`);
    continue;
  }
  const hostsDir = `${dataDir}/NativeMessagingHosts`;
  Deno.mkdirSync(hostsDir, { recursive: true });
  const path = `${hostsDir}/${HOST_NAME}.json`;
  Deno.writeTextFileSync(
    path,
    `${
      JSON.stringify(hostManifest(hostPath, [id, STORE_EXTENSION_ID]), null, 2)
    }\n`,
  );
  console.error(`${name}: ${path}`);
}
console.error(`Extension IDs: ${id} (unpacked), ${STORE_EXTENSION_ID} (store)`);
