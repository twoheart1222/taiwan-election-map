(async () => {
  const container = document.getElementById('related-list');
  if (!container) return;
  try {
    const response = await fetch('https://api.formosaobservatory.com/?key=observatory_links', { headers: { accept: 'application/json' } });
    if (!response.ok) return;
    const payload = await response.json();
    const links = Array.isArray(payload?.links) ? payload.links : Array.isArray(payload) ? payload : [];
    const cards = links.flatMap(link => {
      let url;
      try { url = new URL(link.url); } catch { return []; }
      if (!['https:', 'http:'].includes(url.protocol) || !String(link.n || '').trim()) return [];
      const a = document.createElement('a');
      a.className = 'related-card';
      a.href = url.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const category = document.createElement('small');
      category.textContent = link.cat || '公開資源';
      const title = document.createElement('h2');
      title.textContent = link.n;
      const description = document.createElement('p');
      description.textContent = link.d || '點選前往外部網站。';
      const host = document.createElement('span');
      host.textContent = `${url.hostname} ↗`;
      a.append(category, title, description, host);
      return [a];
    });
    if (cards.length) container.replaceChildren(...cards);
  } catch { /* Keep the official links in the HTML available. */ }
})();
