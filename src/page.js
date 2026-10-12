// Runs in the page's own JS world. Twitch's chat box is a Slate editor: editing
// its DOM only changes what's shown, Twitch sends Slate's internal value. The
// editor object is only reachable from here, through React's fiber tree.
//
// content.js marks the chat box with data-ctl-write and dispatches "ctl:write"
// with the new text; the marker is removed on success.
(() => {
  function slateEditor(el) {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    for (let f = key && el[key]; f; f = f.return) {
      const ed = f.memoizedProps?.editor;
      if (ed && typeof ed.apply === 'function' && Array.isArray(ed.children)) return ed;
    }
    return null;
  }

  // [path, length] of every text leaf, in document order.
  function leaves(node, path, out) {
    if (typeof node.text === 'string') out.push([path, node.text.length]);
    else (node.children || []).forEach((c, i) => leaves(c, [...path, i], out));
    return out;
  }

  window.addEventListener('ctl:write', (e) => {
    const el = document.querySelector('[data-ctl-write]');
    const ed = el && slateEditor(el);
    if (!ed || typeof e.detail !== 'string') return;
    try {
      const all = leaves(ed, [], []);
      const [first] = all;
      const last = all[all.length - 1];
      ed.apply({
        type: 'set_selection',
        properties: ed.selection,
        newProperties: { anchor: { path: first[0], offset: 0 }, focus: { path: last[0], offset: last[1] } },
      });
      ed.deleteFragment();
      ed.insertText(e.detail);
      el.removeAttribute('data-ctl-write');
    } catch {}
  });
})();
