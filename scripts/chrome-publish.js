// The Chrome Web Store item through its API:
//   chrome-publish.js status        its live and submitted revisions
//   chrome-publish.js publish <zip> upload the zip, then submit it for review
// CWS_SERVICE_ACCOUNT_KEY is the path of the service account's JSON key
// (`make chrome_publish` reads it from 1Password DEV with op-agents).
import { STORE_EXTENSION_ID } from "./src/chrome.js";
import { fetchStatus, publish } from "./src/web-store.js";

const [command, zipPath] = Deno.args;
if (
  !["status", "publish"].includes(command) ||
  (command === "publish" && !zipPath)
) {
  console.error("usage: chrome-publish.js status | publish <zip>");
  Deno.exit(2);
}
const key = JSON.parse(
  Deno.readTextFileSync(Deno.env.get("CWS_SERVICE_ACCOUNT_KEY")),
);
const itemId = STORE_EXTENSION_ID;
const result = command === "status"
  ? await fetchStatus({ key, itemId }).then((status) => ({
    item: status.itemId,
    published: status.publishedItemRevisionStatus ?? null,
    submitted: status.submittedItemRevisionStatus ?? null,
    lastUpload: status.lastAsyncUploadState ?? null,
    takenDown: status.takenDown ?? false,
    warned: status.warned ?? false,
  }))
  : await publish({ key, itemId, zip: Deno.readFileSync(zipPath) });
console.log(JSON.stringify(result, null, 2));
