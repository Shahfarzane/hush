// Every rule source sits behind a CDN or GitHub, which now and then answer a
// cold or busy request with a 5xx or 429 that clears within seconds (the
// weekly refresh once died on one jsDelivr 503). Those statuses and network
// errors are retried with a doubling pause; any other status is final.
const RETRIES = 4;
const FIRST_PAUSE_MS = 2000;

const isTransient = (status) => status === 429 || status >= 500;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GitHub's API allows 60 anonymous requests an hour per IP, which runners
// share, so a GITHUB_TOKEN in the environment goes along when there is one.
const headersFor = (url) => {
  const token = url.startsWith("https://api.github.com/") &&
    process.env.GITHUB_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// The body is read inside the loop, so a connection that drops partway
// through a download is retried too.
const fetchAndRead = async (
  url,
  read,
  { fetchImpl = fetch, sleep = wait } = {},
) => {
  for (let attempt = 0;; attempt++) {
    const last = attempt === RETRIES;
    let status, problem;
    try {
      const response = await fetchImpl(url, { headers: headersFor(url) });
      if (response.ok) return await read(response);
      status = response.status;
      await response.body?.cancel();
    } catch (error) {
      // fetch rejects with a TypeError when the connection fails, before the
      // headers arrive or while the body streams in.
      if (last || !(error instanceof TypeError)) throw error;
      problem = `a network error (${error.message})`;
    }
    if (status) {
      problem = `status ${status}`;
      if (last || !isTransient(status)) {
        throw new Error(`Fetching ${url} failed with ${problem}`);
      }
    }
    const pause = FIRST_PAUSE_MS * 2 ** attempt;
    console.warn(
      `Fetching ${url} failed with ${problem}; retrying in ${pause / 1000}s`,
    );
    await sleep(pause);
  }
};

export const fetchText = (url, options) =>
  fetchAndRead(url, (response) => response.text(), options);

export const fetchJson = (url, options) =>
  fetchAndRead(url, (response) => response.json(), options);
