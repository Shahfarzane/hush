import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  fetchStatus,
  publish,
  PUBLISHER_ID,
  SCOPE,
  signedAssertion,
} from "./web-store.js";

// A throwaway key in the shape of a Google service account JSON key. No
// request leaves the test: every call goes to a fake fetch.
const pair = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
const pkcs8 = new Uint8Array(
  await crypto.subtle.exportKey("pkcs8", pair.privateKey),
);
const key = {
  client_email: "cws-publisher@example.iam.gserviceaccount.com",
  private_key_id: "kid-1",
  private_key: `-----BEGIN PRIVATE KEY-----\n${
    btoa(String.fromCharCode(...pkcs8))
  }\n-----END PRIVATE KEY-----\n`,
  token_uri: "https://oauth2.googleapis.com/token",
};
const itemId = "megbdpijbohdgindboffkkklekhhnamp";
const item =
  `https://chromewebstore.googleapis.com/v2/publishers/${PUBLISHER_ID}/items/${itemId}`;

const fromBase64url = (text) =>
  Uint8Array.from(
    atob(text.replaceAll("-", "+").replaceAll("_", "/")),
    (char) => char.charCodeAt(0),
  );

const fakeStore = (replies) => {
  const calls = [];
  const fetchImpl = (url, init) => {
    calls.push({ url, ...init });
    const reply = replies.shift();
    if (!reply) throw new Error(`unexpected request ${init.method} ${url}`);
    return Promise.resolve(new Response(JSON.stringify(reply)));
  };
  return { calls, fetchImpl };
};

Deno.test("The assertion is a JWT the service account's key signs", async () => {
  const [header, claims, signature] = (await signedAssertion(key, 1000)).split(
    ".",
  );
  const decode = (part) =>
    JSON.parse(new TextDecoder().decode(fromBase64url(part)));
  assertEquals(decode(header), { alg: "RS256", typ: "JWT", kid: "kid-1" });
  assertEquals(decode(claims), {
    iss: key.client_email,
    scope: SCOPE,
    aud: key.token_uri,
    iat: 1000,
    exp: 4600,
  });
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    pair.publicKey,
    fromBase64url(signature),
    new TextEncoder().encode(`${header}.${claims}`),
  );
  assertEquals(valid, true);
});

Deno.test("Status trades the assertion for a token, then reads the item", async () => {
  const { calls, fetchImpl } = fakeStore([
    { access_token: "t1" },
    { itemId, lastAsyncUploadState: "SUCCEEDED" },
  ]);
  const status = await fetchStatus({ key, itemId, fetchImpl });
  assertEquals(status.itemId, itemId);
  assertEquals(
    calls[0].body.get("grant_type"),
    "urn:ietf:params:oauth:grant-type:jwt-bearer",
  );
  assertEquals([calls[1].method, calls[1].url], [
    "GET",
    `${item}:fetchStatus`,
  ]);
  assertEquals(calls[1].headers.Authorization, "Bearer t1");
});

Deno.test("Publish uploads, waits out an async upload, then submits", async () => {
  const zip = new Uint8Array([80, 75, 3, 4]);
  const { calls, fetchImpl } = fakeStore([
    { access_token: "t1" },
    { uploadState: "IN_PROGRESS" },
    { lastAsyncUploadState: "SUCCEEDED" },
    { state: "PENDING_REVIEW", itemId },
  ]);
  const result = await publish({
    key,
    itemId,
    zip,
    fetchImpl,
    wait: () => Promise.resolve(),
  });
  assertEquals(result.state, "PENDING_REVIEW");
  assertEquals(calls.slice(1).map((call) => `${call.method} ${call.url}`), [
    `POST https://chromewebstore.googleapis.com/upload/v2/publishers/${PUBLISHER_ID}/items/${itemId}:upload`,
    `GET ${item}:fetchStatus`,
    `POST ${item}:publish`,
  ]);
  assertEquals(calls[1].body, zip);
  assertEquals(calls[1].headers["Content-Type"], "application/zip");
  assertEquals(calls[3].body, "{}");
});

Deno.test("Publish stops before submitting a rejected upload", async () => {
  const { calls, fetchImpl } = fakeStore([
    { access_token: "t1" },
    { uploadState: "FAILED" },
  ]);
  await assertRejects(
    () =>
      publish({
        key,
        itemId,
        zip: new Uint8Array([1]),
        fetchImpl,
        wait: () => Promise.resolve(),
      }),
    Error,
    "upload ended FAILED",
  );
  assertEquals(calls.length, 2);
});
