// Chrome only injects manifest content scripts into pages loaded after the
// extension is installed. Inject them into tabs that are already open too, so
// the fixes work right after installing or updating, without a refresh.
chrome.runtime.onInstalled.addListener(async () => {
  for (const { matches, js } of chrome.runtime.getManifest().content_scripts) {
    const tabs = await chrome.tabs.query({ url: matches });

    for (const tab of tabs) {
      // Discarded or still-loading tabs get the scripts on their next load.
      chrome.scripting
        .executeScript({ target: { tabId: tab.id }, files: js })
        .catch(() => {});
    }
  }
});
