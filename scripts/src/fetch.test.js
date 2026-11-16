import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchJson, fetchText } from "./fetch.js";

const SOURCE = "https://cdn.example/rules.json";

// A 200 whose connection drops after the headers, partway through the body.
const BODY_RESET = "body reset";

// Answers each request with the next reply: a status, BODY_RESET, or an Error
// to throw the way fetch does on a network failure. Pauses are recorded, not
// slept.
const fakeServer = (replies) => {
  const requests = [];
  const pauses = [];
  const fetchImpl = (url) => {
    requests.push(url);
    const reply = replies.shift();
    if (reply instanceof Error) return Promise.reject(reply);
    if (reply === BODY_RESET) {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"ok":'));
          controller.error(new TypeError("connection reset"));
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    }
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

test("A 503 or 429 is retried until the source answers", async () => {
  const server = fakeServer([503, 429, 200]);
  assert.deepEqual(await fetchJson(SOURCE, server.options), { ok: true });
  assert.deepEqual(server.requests.length, 3);
  assert.deepEqual(server.pauses, [2000, 4000]);
});

test("A network error is retried like a 5xx", async () => {
  const server = fakeServer([new TypeError("connection reset"), 200]);
  assert.deepEqual(await fetchText(SOURCE, server.options), '{"ok":true}');
  assert.deepEqual(server.requests.length, 2);
});

test("A connection reset while the body downloads is retried", async () => {
  for (const read of [fetchText, fetchJson]) {
    const server = fakeServer([BODY_RESET, 200]);
    await read(SOURCE, server.options);
    assert.deepEqual(server.requests.length, 2);
  }
});

test("A 404 fails at once", async () => {
  const server = fakeServer([404]);
  await assert.rejects(
    () => fetchText(SOURCE, server.options),
    { message: `Fetching ${SOURCE} failed with status 404` },
  );
  assert.deepEqual(server.requests.length, 1);
});

test("A source that stays down fails after the last retry", async () => {
  const server = fakeServer([503, 503, 503, 503, 503]);
  await assert.rejects(
    () => fetchText(SOURCE, server.options),
    { message: `Fetching ${SOURCE} failed with status 503` },
  );
  assert.deepEqual(server.requests.length, 5);
  assert.deepEqual(server.pauses, [2000, 4000, 8000, 16000]);
});
