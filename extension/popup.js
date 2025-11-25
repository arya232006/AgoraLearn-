// popup.js
// Requests page text from content script and displays it

document.addEventListener('DOMContentLoaded', () => {
  const askBtn = document.getElementById('ask-btn');
  const input = document.getElementById('question-input');
  const output = document.getElementById('output');
  let pageContext = '';

  // Request page text from content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(
      tabs[0].id,
      { type: 'GET_PAGE_TEXT' },
      (response) => {
        if (response && response.text) {
          pageContext = response.text;
          output.value = `Page context loaded (${response.text.length} chars)\n`;
        } else {
          output.value = 'Could not load page context.';
        }
      }
    );
  });

  askBtn.onclick = async () => {
    const question = input.value.trim();
    if (!question) return;
    output.value += `\nQ: ${question}\nA: ...`;
    input.value = '';
    try {
      // Change this URL to your deployed backend if needed
      const res = await fetch('http://localhost:3000/api/converse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-extension': '1' },
        body: JSON.stringify({ query: question, context: pageContext })
      });
      const data = await res.json();
      output.value += `\n${data.answer || '(no answer)'}`;
    } catch (err) {
      output.value += '\n(Error contacting backend)';
    }
  };
});
