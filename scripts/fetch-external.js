import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchText } from "./src/fetch.js";
import { hasUnsupportedSelectors } from "./src/validation.js";

const resolveRelative = (path) => fileURLToPath(new URL(path, import.meta.url));

const DESTINATION_DIR = resolveRelative("../data/vendor");
const SOURCES = {
  "fanboy-cookiemonster":
    "https://secure.fanboy.co.nz/fanboy-cookiemonster.txt",
};

await Promise.all(
  Object.entries(SOURCES).map(async ([name, url]) => {
    const data = (await fetchText(url))
      .split("\n")
      .filter((line) => !hasUnsupportedSelectors(line))
      .join("\n");
    const destination = `${DESTINATION_DIR}/${name}.txt`;
    await writeFile(destination, data);
    console.info(`Saved ${url} to ${destination}`);
  }),
);
