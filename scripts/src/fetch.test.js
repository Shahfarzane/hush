import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { fetchJson, fetchText } from "./fetch.js";

const SOURCE = "https://cdn.example/rules.json";

// Answers each request with the next reply: a status, or an Error to throw
// the way fetch does on a network failure. Pauses are recorded, not slept.
const fakeServer = (replies) => {
  const requests = [];
  const pauses = [];
  const fetchImpl = (url) => {
    requests.push(url);
    const reply = replies.shift();
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve(
      new Response(reply === 200 ? '{"ok":true}' : "busy", { status: reply }),
    );
  };
  const sleep = (ms) => {
    pauses.push(ms);
    return Promise.resolve();
  };
  return { requests, pauses, options: { fetchImpl, sleep } };
};

Deno.test("A 503 or 429 is retried until the source answers", async () => {
  const server = fakeServer([503, 429, 200]);
  assertEquals(await fetchJson(SOURCE, server.options), { ok: true });
  assertEquals(server.requests.length, 3);
  assertEquals(server.pauses, [2000, 4000]);
});

Deno.test("A network error is retried like a 5xx", async () => {
  const server = fakeServer([new TypeError("connection reset"), 200]);
  assertEquals(await fetchText(SOURCE, server.options), '{"ok":true}');
  assertEquals(server.requests.length, 2);
});

Deno.test("A 404 fails at once", async () => {
  const server = fakeServer([404]);
  await assertRejects(
    () => fetchText(SOURCE, server.options),
    Error,
    `Fetching ${SOURCE} failed with status 404`,
  );
  assertEquals(server.requests.length, 1);
});

Deno.test("A source that stays down fails after the last retry", async () => {
  const server = fakeServer([503, 503, 503, 503, 503]);
  await assertRejects(
    () => fetchText(SOURCE, server.options),
    Error,
    `Fetching ${SOURCE} failed with status 503`,
  );
  assertEquals(server.requests.length, 5);
  assertEquals(server.pauses, [2000, 4000, 8000, 16000]);
});
