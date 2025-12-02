// Extracts visible text from the current page and sends it to the popup via window.postMessage
(function() {
  function getVisibleText() {
    return document.body.innerText;
  }

  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'GET_PAGE_TEXT') {
      window.postMessage({ type: 'PAGE_TEXT', text: getVisibleText() }, '*');
    }
  });
})();
