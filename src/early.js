// Runs at document_start so these capture listeners are registered before
// other extensions' (e.g. 7TV's) and a reply can be translated before it's sent.
// The handler itself lives in content.js.
for (const type of ['keydown', 'click']) window.addEventListener(type, (e) => window.__ctlOnSend?.(e), true);
