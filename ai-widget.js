(function() {
  const styles = `
    #aiWidgetBtn {
      position: fixed;
      right: 22px;
      bottom: 22px;
      z-index: 99999;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      border: none;
      background: var(--accent);
      color: #0b1120;
      cursor: pointer;
      box-shadow: 0 18px 40px rgba(0,0,0,0.24);
      font-size: 24px;
      display: grid;
      place-items: center;
    }
    #aiWidgetBtn:hover {
      transform: translateY(-2px);
    }
    #aiWidgetOverlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.56);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 99998;
      padding: 18px;
    }
    #aiWidgetOverlay.active {
      display: flex;
    }
    #aiWidgetPanel {
      width: min(100%, 640px);
      background: #0f172a;
      border-radius: 24px;
      padding: 22px;
      border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 24px 80px rgba(0,0,0,0.32);
      color: #e5e7eb;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    #aiWidgetPanel h3 {
      margin: 0;
      font-size: 1.3rem;
    }
    #aiWidgetClose {
      position: absolute;
      right: 18px;
      top: 18px;
      width: 42px;
      height: 42px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.06);
      color: #e5e7eb;
      font-size: 24px;
      cursor: pointer;
    }
    #aiWidgetText {
      width: 100%;
      min-height: 120px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 16px;
      color: #e5e7eb;
      padding: 16px;
      resize: vertical;
      font-size: 1rem;
      outline: none;
    }
    #aiWidgetFooter {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    #aiWidgetSend,
    #aiWidgetClear {
      border: none;
      border-radius: 14px;
      padding: 12px 18px;
      cursor: pointer;
      font-weight: 700;
    }
    #aiWidgetSend {
      background: var(--accent);
      color: #0b1120;
    }
    #aiWidgetClear {
      background: rgba(255,255,255,0.08);
      color: #e5e7eb;
    }
    #aiWidgetResponse {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 16px;
      min-height: 120px;
      padding: 16px;
      white-space: pre-wrap;
      overflow-y: auto;
      color: #e5e7eb;
    }
    #aiWidgetModel {
      background: rgba(255,255,255,0.06);
      color: #e5e7eb;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 14px;
      padding: 12px 14px;
      min-width: 180px;
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.id = 'aiWidgetStyles';
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  const overlay = document.createElement('div');
  overlay.id = 'aiWidgetOverlay';
  overlay.innerHTML = `
    <div id="aiWidgetPanel">
      <button id="aiWidgetClose" aria-label="Close AI widget">×</button>
      <h3>Ask the AI</h3>
      <textarea id="aiWidgetText" placeholder="Ask a question about the portal, school workflows, or the site..."></textarea>
      <div id="aiWidgetFooter">
        <button id="aiWidgetSend">Send</button>
        <button id="aiWidgetClear" type="button">Clear</button>
        <select id="aiWidgetModel">
          <option value="gemini-pro">Gemini Pro</option>
          <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
          <option value="gemini-1.0">Gemini 1.0</option>
        </select>
      </div>
      <div id="aiWidgetResponse">AI responses appear here.</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const button = document.createElement('button');
  button.id = 'aiWidgetBtn';
  button.type = 'button';
  button.title = 'Ask AI';
  button.innerHTML = '<ion-icon name="chatbubbles-outline"></ion-icon>';
  document.body.appendChild(button);

  const promptInput = overlay.querySelector('#aiWidgetText');
  const responseBox = overlay.querySelector('#aiWidgetResponse');
  const sendBtn = overlay.querySelector('#aiWidgetSend');
  const clearBtn = overlay.querySelector('#aiWidgetClear');
  const closeBtn = overlay.querySelector('#aiWidgetClose');
  const modelSelect = overlay.querySelector('#aiWidgetModel');

  const open = () => {
    overlay.classList.add('active');
    promptInput.focus();
  };
  const close = () => {
    overlay.classList.remove('active');
  };

  button.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  const setResponse = (text) => {
    responseBox.textContent = text;
  };

  const sendMessage = async () => {
    const message = promptInput.value.trim();
    if (!message) {
      setResponse('Please enter a question first.');
      return;
    }

    setResponse('Sending your question to the AI...');
    sendBtn.disabled = true;
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, model: modelSelect.value })
      });
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (jsonErr) {
        setResponse(`Server response was not JSON (status ${res.status}):\n${text}`);
        return;
      }

      if (!res.ok) {
        setResponse(data?.error || `AI request failed with status ${res.status}`);
      } else {
        setResponse(data?.reply || JSON.stringify(data, null, 2));
      }
    } catch (error) {
      setResponse('Network error: ' + (error.message || error));
    } finally {
      sendBtn.disabled = false;
    }
  };

  sendBtn.addEventListener('click', sendMessage);
  promptInput.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      sendMessage();
    }
  });
  clearBtn.addEventListener('click', () => {
    promptInput.value = '';
    setResponse('AI responses appear here.');
  });
})();
