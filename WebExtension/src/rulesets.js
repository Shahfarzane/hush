// The declarativeNetRequest.updateEnabledRulesets call for a mode. It names
// every ruleset in the manifest each time: once Safari has saved any ruleset
// state, a relaunch turns on only the saved entries and ignores the
// manifest's defaults (WebKit's
// loadDeclarativeNetRequestRulesetStateFromStorage), so naming only
// block_hide_only left block_answer off from the next launch on.
export const rulesetUpdate = (mode) =>
  mode === "hide"
    ? { enableRulesetIds: ["block_answer", "block_hide_only"] }
    : {
      enableRulesetIds: ["block_answer"],
      disableRulesetIds: ["block_hide_only"],
    };
