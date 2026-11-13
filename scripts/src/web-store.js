// Chrome Web Store API (v2) client for the Hush Extra store item. The
// service account (linked to the publisher in the developer dashboard, no
// Cloud roles) signs its own OAuth assertion with its JSON key (RFC 7523).

export const PUBLISHER_ID = "57872b7a-1854-48c2-86fa-ed92000fc7c7";
export const SCOPE = "https://www.googleapis.com/auth/chromewebstore";
const API = "https://chromewebstore.googleapis.com";
const TOKEN_URI = "https://oauth2.googleapis.com/token";

export const itemUrl = (itemId, action, { upload = false } = {}) =>
  `${API}${
    upload ? "/upload" : ""
  }/v2/publishers/${PUBLISHER_ID}/items/${itemId}:${action}`;

const base64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const encode = (value) =>
  base64url(new TextEncoder().encode(JSON.stringify(value)));

const signingKey = (pem) => {
  const der = Uint8Array.from(
    atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")),
    (char) => char.charCodeAt(0),
  );
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
};

export const signedAssertion = async (
  key,
  now = Math.floor(Date.now() / 1000),
) => {
  const unsigned = `${
    encode({ alg: "RS256", typ: "JWT", kid: key.private_key_id })
  }.${
    encode({
      iss: key.client_email,
      scope: SCOPE,
      aud: key.token_uri ?? TOKEN_URI,
      iat: now,
      exp: now + 3600,
    })
  }`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await signingKey(key.private_key),
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64url(signature)}`;
};

const failure = async (what, response) =>
  new Error(
    `${what}: HTTP ${response.status} ${(await response.text()).slice(0, 500)}`,
  );

export const accessToken = async (key, fetchImpl = fetch) => {
  const response = await fetchImpl(key.token_uri ?? TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: await signedAssertion(key),
    }),
  });
  if (!response.ok) throw await failure("token", response);
  return (await response.json()).access_token;
};

const api = async (fetchImpl, token, method, url, body) => {
  const isZip = body instanceof Uint8Array;
  const response = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body
        ? { "Content-Type": isZip ? "application/zip" : "application/json" }
        : {}),
    },
    body: isZip ? body : body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw await failure(`${method} ${url}`, response);
  return response.json();
};

export const fetchStatus = async ({ key, itemId, fetchImpl = fetch }) =>
  api(
    fetchImpl,
    await accessToken(key, fetchImpl),
    "GET",
    itemUrl(itemId, "fetchStatus"),
  );

// Upload, wait out an asynchronous upload, then submit for review. An upload
// the store rejects stops before submitting. Returns the publish response,
// whose state is PENDING_REVIEW once submitted.
export const publish = async ({
  key,
  itemId,
  zip,
  fetchImpl = fetch,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) => {
  const token = await accessToken(key, fetchImpl);
  const upload = await api(
    fetchImpl,
    token,
    "POST",
    itemUrl(itemId, "upload", { upload: true }),
    zip,
  );
  let state = upload.uploadState;
  for (let attempt = 0; state === "IN_PROGRESS" && attempt < 30; attempt++) {
    await wait(10_000);
    state = (await api(
      fetchImpl,
      token,
      "GET",
      itemUrl(itemId, "fetchStatus"),
    )).lastAsyncUploadState;
  }
  if (state !== "SUCCEEDED") {
    throw new Error(`upload ended ${state}: ${JSON.stringify(upload)}`);
  }
  return api(fetchImpl, token, "POST", itemUrl(itemId, "publish"), {});
};
