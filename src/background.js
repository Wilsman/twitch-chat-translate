// Optional cloud fallback (only used when enabled in the popup).
chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg?.type !== 'ctl:cloud') return;

  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t' +
    `&sl=${encodeURIComponent(msg.from || 'auto')}` +
    `&tl=${encodeURIComponent(msg.to)}` +
    `&q=${encodeURIComponent(msg.text)}`;

  fetch(url)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((j) => send({ text: (j[0] || []).map((s) => s[0]).join(''), from: j[2] }))
    .catch(() => send(null));

  return true;
});
