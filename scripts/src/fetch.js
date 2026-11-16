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
    Deno.env.get("GITHUB_TOKEN");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fetchOk = async (url, { fetchImpl = fetch, sleep = wait } = {}) => {
  for (let attempt = 0;; attempt++) {
    const last = attempt === RETRIES;
    let response, problem;
    try {
      response = await fetchImpl(url, { headers: headersFor(url) });
    } catch (error) {
      // fetch rejects with a TypeError when the request got no answer.
      if (last || !(error instanceof TypeError)) throw error;
      problem = `a network error (${error.message})`;
    }
    if (response) {
      if (response.ok) return response;
      await response.body?.cancel();
      problem = `status ${response.status}`;
      if (last || !isTransient(response.status)) {
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

export const fetchText = async (url, options) =>
  (await fetchOk(url, options)).text();

export const fetchJson = async (url, options) =>
  (await fetchOk(url, options)).json();
