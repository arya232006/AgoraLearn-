// content-script.js
// Extracts visible text and responds to popup requests

function getVisibleText() {
  // You can improve this to filter out nav/ads if needed
  return document.body.innerText || "";
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_PAGE_TEXT") {
    sendResponse({ text: getVisibleText() });
  }
  // Return true to indicate async response if needed
  return false;
});
