// Function to inject LoadAgent AI button into Gmail UI
function injectLoadAgentButton() {
  const emailBody = document.querySelector('div[role="listitem"] .a3s');
  
  if (emailBody && !document.getElementById('loadagent-btn')) {
    const btn = document.createElement('button');
    btn.id = 'loadagent-btn';
    btn.innerText = '⚡ Parse & Counter (LoadAgent AI)';
    btn.style.cssText = 'background: #2563eb; color: white; border: none; padding: 8px 14px; margin-top: 10px; border-radius: 6px; font-weight: bold; cursor: pointer;';

    btn.addEventListener('click', async () => {
      btn.innerText = 'Analyzing...';
      const emailText = emailBody.innerText;

      try {
        const response = await fetch('https://loadagent-ai-mpv.vercel.app/api/parse-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emailText })
        });
        
        const data = await response.json();
        alert(`Origin: ${data.origin || 'N/A'}\nDestination: ${data.destination || 'N/A'}\nSuggested Counter Rate: $${data.counterOffer || 'Calculated'}`);
        btn.innerText = '⚡ Parse & Counter (LoadAgent AI)';
      } catch (err) {
        alert('Error connecting to LoadAgent Engine!');
        btn.innerText = '⚡ Parse & Counter (LoadAgent AI)';
      }
    });

    emailBody.appendChild(btn);
  }
}

// Observe Gmail UI changes
const observer = new MutationObserver(injectLoadAgentButton);
observer.observe(document.body, { childList: true, subtree: true });
