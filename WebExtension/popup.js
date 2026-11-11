import { describeAnswer } from "./src/platforms.js";
import {
  autoActionFor,
  levelTitle,
  normalizeSettings,
  siteFor,
} from "./src/settings.js";

const element = (id) => document.getElementById(id);

// The paused-site entry covering this host, if any (it may be a parent).
const pausedEntry = ({ pausedSites }, host) =>
  pausedSites.find((site) => host === site || host.endsWith(`.${site}`));

const statusText = (settings, answer, paused) => {
  if (paused) {
    return "Paused here. Hush Extra leaves this site's cookie banner alone.";
  }
  if (settings.mode === "hide") {
    return "Hush Extra only hides cookie banners. Change this in the Hush Extra app.";
  }
  if (!answer) return "No cookie banner answered on this page.";
  const { platform, fallback } = describeAnswer(answer.cmp);
  if (!fallback) return `Answered the ${platform} banner with your level.`;
  return autoActionFor(settings) === "optIn"
    ? `Accepted the ${platform} banner.`
    : `Refused everything on the ${platform} banner.`;
};

const render = ({ host, settings, answer, appReachable }) => {
  element("level").textContent = levelTitle(settings);
  element("unreachable").hidden = appReachable;
  if (!host) {
    element("status").textContent =
      "Open a website to see what Hush Extra did there.";
    return;
  }
  const paused = Boolean(pausedEntry(settings, host));
  element("site").textContent = siteFor(host);
  element("status").textContent = statusText(settings, answer, paused);
  element("pause").checked = paused;
  // A pause could not be saved without the app.
  element("pause-row").hidden = !appReachable;
};

const run = async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? "";
  const host = /^https?:/.test(url) ? new URL(url).host : null;
  const state = await browser.runtime.sendMessage({
    type: "popupState",
    tabId: tab?.id,
    url,
  });
  let settings = normalizeSettings(state?.settings);
  const answer = state?.answer;
  render({ host, settings, answer, appReachable: state?.appReachable ?? true });

  element("pause").addEventListener("change", async (event) => {
    const site = event.target.checked
      ? siteFor(host)
      : pausedEntry(settings, host);
    try {
      settings = normalizeSettings(
        await browser.runtime.sendMessage({
          type: "setPaused",
          site,
          paused: event.target.checked,
        }),
      );
    } catch (error) {
      console.error("Hush: pausing failed", error);
      render({ host, settings, answer, appReachable: false });
      return;
    }
    render({ host, settings, answer, appReachable: true });
    element("note").hidden = false;
  });
};

run().catch((error) => console.error("Hush:", error));
