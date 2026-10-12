(() => {
  if (window.__ctlLoaded) return;
  window.__ctlLoaded = true;

  // Native Twitch chat, VOD chat, and 7TV's chat renderer.
  const MSG_SEL = '.chat-line__message, .vod-message, .seventv-user-message';
  const BODY_SEL = [
    '[data-a-target="chat-line-message-body"]',
    '.seventv-chat-message-body',
    '.video-chat__message',
    '.message',
  ].join(',');
  const TEXT_SEL = '.text-fragment, .text-token';
  const USER_SEL = '.chat-author__display-name, [data-a-target="chat-message-username"], .seventv-chat-user-username';
  const INPUT_SEL = '[data-a-target="chat-input"]';
  const SEND_SEL = '[data-a-target="chat-send-button"]';

  let settings = { ...CTL_DEFAULTS };

  const base = (code) => String(code || '').split('-')[0].toLowerCase();
  const names = new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' });
  const langName = (code) => {
    try {
      return names.of(code);
    } catch {
      return code;
    }
  };

  // ---------- styles ----------

  const style = document.createElement('style');
  const applyLook = () => (style.textContent = ctlCss(settings));
  applyLook();
  (document.head || document.documentElement).append(style);

  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    e.append(...children);
    return e;
  }

  // ---------- text & detection ----------

  function extract(body) {
    const frags = body.querySelectorAll(TEXT_SEL);
    const raw = frags.length ? [...frags].map((f) => f.textContent).join(' ') : body.textContent;
    return raw
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/@\w+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const LATIN_ONLY = /^[\p{Script=Latin}\P{L}]*$/u;
  const SCRIPTS = [
    [/\p{Script=Hangul}/u, 'ko'],
    [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, 'ja'],
    [/\p{Script=Han}/u, 'zh'],
    [/\p{Script=Cyrillic}/u, 'ru'],
    [/\p{Script=Arabic}/u, 'ar'],
    [/\p{Script=Hebrew}/u, 'he'],
    [/\p{Script=Thai}/u, 'th'],
    [/\p{Script=Greek}/u, 'el'],
    [/\p{Script=Devanagari}/u, 'hi'],
  ];
  const guessByScript = (t) => SCRIPTS.find(([re]) => re.test(t))?.[1] || null;

  // Latin-script messages need more evidence: [min confidence, min words, min letters].
  const SENSITIVITY = { strict: [0.9, 4, 14], balanced: [0.8, 3, 10], loose: [0.6, 2, 6] };
  const sens = () => SENSITIVITY[settings.sensitivity] || SENSITIVITY.balanced;

  function worthChecking(t) {
    const letters = t.match(/\p{L}/gu) || [];
    if (new Set(letters.map((c) => c.toLowerCase())).size < 2) return false; // "ㅋㅋㅋ", "aaaa"
    const [, words, min] = sens();
    if (LATIN_ONLY.test(t)) return letters.length >= min && t.split(' ').length >= words; // skip "lol", "o7 gg"
    return true;
  }

  // ---------- on-device models ----------
  // Creating a model that still needs downloading requires a user gesture, so
  // those are parked as "pending" and created on the next click/keypress.

  const detector = { status: 'init', api: null, promise: null };
  const pairs = new Map(); // "ko>en" -> { status, api, promise, src, tgt }
  const waiting = new Set(); // messages waiting for a model download

  function initDetector() {
    if (detector.promise) return detector.promise;
    detector.promise = (async () => {
      if (!('LanguageDetector' in self)) return (detector.status = 'none');
      try {
        const a = await LanguageDetector.availability();
        if (a === 'unavailable') return (detector.status = 'none');
        detector.api = await LanguageDetector.create();
        detector.status = 'ready';
      } catch {
        detector.status = 'pending';
      }
    })();
    return detector.promise;
  }

  // With `gesture`, create() is called synchronously so a needed download can start.
  function initPair(src, tgt = settings.target, gesture = false) {
    const key = `${src}>${tgt}`;
    let p = pairs.get(key);
    if (p) return p.promise.then(() => p);
    p = { status: 'init', api: null, src, tgt };
    pairs.set(key, p);
    p.promise = (async () => {
      if (!('Translator' in self)) return (p.status = 'none');
      const opts = { sourceLanguage: src, targetLanguage: tgt };
      try {
        if (!gesture && (await Translator.availability(opts)) === 'unavailable') return (p.status = 'none');
        p.api = await Translator.create(opts);
        p.status = 'ready';
      } catch (e) {
        p.status = gesture && e?.name !== 'NotAllowedError' ? 'none' : 'pending';
      }
    })();
    return p.promise.then(() => p);
  }

  let activating = false;
  async function activate() {
    const todo = [...pairs.values()].filter((p) => p.status === 'pending');
    if (activating || (detector.status !== 'pending' && !todo.length)) return;
    activating = true;
    const jobs = [];
    // create() must be *called* synchronously inside the gesture.
    if (detector.status === 'pending') {
      detector.status = 'loading';
      jobs.push(
        LanguageDetector.create()
          .then((api) => Object.assign(detector, { api, status: 'ready' }))
          .catch(() => (detector.status = 'pending'))
      );
    }
    for (const p of todo) {
      p.status = 'loading';
      setChips(p, 'Downloading…');
      // Replaced so anyone awaiting this pair waits for the download.
      p.promise = Translator.create({
        sourceLanguage: p.src,
        targetLanguage: p.tgt,
        monitor: (m) =>
          m.addEventListener('downloadprogress', (e) => setChips(p, `Downloading ${Math.round(e.loaded * 100)}%`)),
      })
        .then((api) => Object.assign(p, { api, status: 'ready' }))
        .catch(() => (p.status = 'pending'));
      jobs.push(p.promise);
    }
    await Promise.allSettled(jobs);
    activating = false;
    const retry = [...waiting];
    waiting.clear();
    retry.forEach(reprocess);
  }
  window.addEventListener('pointerdown', activate, true);
  window.addEventListener('keydown', activate, true);

  function setChips(p, text) {
    if (p.tgt !== settings.target) return note(replying, text); // outgoing reply model
    for (const m of waiting) {
      const chip = m.querySelector('.ctl-chip');
      if (chip && chip.dataset.src === p.src) chip.textContent = text;
    }
  }

  async function detect(text) {
    await initDetector();
    const latin = LATIN_ONLY.test(text);
    if (detector.status === 'ready') {
      const [top] = await detector.api.detect(text);
      const lang = top?.detectedLanguage;
      if (lang && lang !== 'und' && top.confidence >= (latin ? sens()[0] : 0.5)) return lang;
    }
    return latin ? null : guessByScript(text);
  }

  function cloud(text, from, to) {
    return chrome.runtime
      .sendMessage({ type: 'ctl:cloud', text, from, to })
      .then((r) => (r?.text ? r.text : null))
      .catch(() => null);
  }

  // Returns translated text, 'pending' (needs a model download), or null.
  async function translate(text, src, tgt = settings.target) {
    const p = await initPair(src, tgt);
    if (p.status === 'ready') {
      try {
        return await p.api.translate(text);
      } catch {}
    }
    if (settings.cloud) return cloud(text, src, tgt);
    return p.status === 'pending' || p.status === 'loading' ? 'pending' : null;
  }

  // ---------- message pipeline ----------

  const cache = new Map(); // text -> { lang, out } | null
  const remember = (k, v) => {
    cache.set(k, v);
    if (cache.size > 600) cache.delete(cache.keys().next().value);
  };

  function clear(msg) {
    msg.querySelectorAll('.ctl-tr, .ctl-chip').forEach((n) => n.remove());
    msg.querySelectorAll('.ctl-orig').forEach((n) => n.classList.remove('ctl-orig'));
    msg.classList.remove('ctl-hl');
  }

  // Recently translated messages, so an open "Replying to @user: …" bar can be matched to one.
  const recent = [];
  function track(msg, body, lang) {
    const names = new Set([msg.querySelector(USER_SEL)?.textContent, msg.querySelector('[data-a-user]')?.dataset.aUser]);
    const entry = {
      lang,
      words: extract(body).toLowerCase().split(' ').slice(0, 3),
      names: [...names].filter(Boolean).map((n) => '@' + n.trim().replace(/:$/, '').toLowerCase()),
    };
    recent.push(entry);
    if (recent.length > 150) recent.shift();
    tracked.set(msg, entry);
  }
  const tracked = new WeakMap(); // message element -> its `recent` entry

  function render(msg, body, lang, out) {
    clear(msg);
    body.classList.add('ctl-orig'); // hidden in "replace" mode until hovered
    const tag = el('span', { class: 'ctl-tag', title: `${langName(lang)} → ${langName(settings.target)}` }, base(lang).toUpperCase());
    body.after(el('div', { class: 'ctl-tr', lang: settings.target }, tag, el('span', { class: 'ctl-text' }, out)));
    msg.classList.add('ctl-hl');
    track(msg, body, lang);
  }

  function renderChip(msg, body, lang) {
    clear(msg);
    const chip = el(
      'button',
      { class: 'ctl-chip', 'data-src': lang, title: 'Downloads the on-device translation model (one time)' },
      `Translate ${langName(lang)}`
    );
    body.after(chip);
    msg.classList.add('ctl-hl');
    waiting.add(msg);
    track(msg, body, lang);
  }

  async function processMessage(msg) {
    if (!settings.enabled || msg.parentElement?.closest(MSG_SEL)) return;
    const body = msg.querySelector(BODY_SEL);
    if (!body) return;
    const text = extract(body);
    if (msg.dataset.ctl === text) return;
    msg.dataset.ctl = text;
    clear(msg);
    if (!text || !worthChecking(text)) return;

    const stale = () => msg.dataset.ctl !== text || !settings.enabled;

    if (cache.has(text)) {
      const hit = cache.get(text);
      if (hit) render(msg, body, hit.lang, hit.out);
      return;
    }

    const lang = await detect(text);
    if (stale()) return;
    if (!lang || base(lang) === base(settings.target) || settings.skip.includes(base(lang))) return remember(text, null);

    const out = await translate(text, lang);
    if (stale()) return;
    if (out === 'pending') return renderChip(msg, body, lang);
    if (!out || out.trim().toLowerCase() === text.toLowerCase()) return remember(text, null);

    remember(text, { lang, out });
    render(msg, body, lang, out);
  }

  function reprocess(msg) {
    delete msg.dataset.ctl;
    if (msg.isConnected) enqueue(msg);
  }

  // Small concurrency-limited queue so busy chats never pile up work.
  const queue = [];
  let running = 0;
  function enqueue(msg) {
    queue.push(msg);
    pump();
  }
  function pump() {
    while (running < 3 && queue.length) {
      const msg = queue.shift();
      if (!msg.isConnected) continue;
      running++;
      processMessage(msg)
        .catch(() => {})
        .finally(() => {
          running--;
          pump();
        });
    }
    if (queue.length > 200) queue.splice(0, queue.length - 200); // drop backlog in fast chats
  }

  // ---------- translated replies ----------
  // While Twitch's reply bar points at a translated message, what you type is
  // translated into that message's language right before it's sent.

  const pill = el('button', { class: 'ctl-reply', type: 'button' }, el('span', { class: 'ctl-tag' }), el('span'));
  pill.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the chat box
  pill.addEventListener('click', async () => {
    const ctx = replying;
    if (!ctx || busy) return;
    if (ctx.original != null) {
      // Undo: put the typed text back and send this reply as typed.
      const editor = currentEditor();
      if (editor && (await writeInput(editor, ctx.original))) Object.assign(ctx, { original: null, off: true });
    } else ctx.off = !ctx.off;
    ctx.failed = false;
    note(ctx, null);
  });

  let replying = null; // entry from `recent` the reply bar currently matches
  let busy = false;
  const frame = () => new Promise((r) => requestAnimationFrame(r));

  let boxFor = null;
  let box = null;
  // The chat input area (it holds the reply bar): `.chat-input`, or else the
  // largest ancestor of the editor that doesn't also hold chat messages.
  function inputBox(editor) {
    if (boxFor === editor && box?.isConnected) return box;
    box = editor.closest('.chat-input');
    if (!box) {
      box = editor;
      for (let up = box.parentElement; up && up !== document.body && !up.querySelector(MSG_SEL); up = up.parentElement) box = up;
    }
    boxFor = editor;
    return box;
  }

  // Set when the reply button of a translated message is clicked.
  let clicked = null;
  window.addEventListener(
    'click',
    (e) => {
      const msg = e.target.closest?.('button')?.closest(MSG_SEL);
      if (msg) clicked = tracked.get(msg.closest('.ctl-hl') || msg) || null;
      if (msg) setTimeout(queueSync, 50);
    },
    true
  );

  function replyTarget(editor) {
    if (!settings.enabled || !settings.replyTranslate || !recent.length) return null;
    const bar = inputBox(editor).textContent.replace(editor.textContent, '').replace(/\s+/g, ' ').toLowerCase();
    if (!bar.includes('@')) return null;
    if (clicked?.names.some((n) => bar.includes(n))) return clicked;
    for (let i = recent.length - 1; i >= 0; i--) {
      const r = recent[i];
      if (r.names.some((n) => bar.includes(n)) && r.words.every((w) => bar.includes(w))) return r;
    }
    return null;
  }

  function readInput(editor) {
    if ('value' in editor) return editor.value.replace(/\s+/g, ' ').trim();
    const c = editor.cloneNode(true);
    c.querySelectorAll('[data-slate-placeholder]').forEach((n) => n.remove());
    c.querySelectorAll('img[alt]').forEach((n) => n.replaceWith(` ${n.alt} `));
    return c.textContent.replace(/[​﻿]/g, '').replace(/\s+/g, ' ').trim();
  }

  // Replaces the chat box text. Returns false if it couldn't.
  async function writeInput(editor, text) {
    editor.focus();
    if ('value' in editor) {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(editor), 'value').set.call(editor, text);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    // Twitch's input is a Slate editor whose state only page.js can reach.
    editor.setAttribute('data-ctl-write', '');
    window.dispatchEvent(new CustomEvent('ctl:write', { detail: text }));
    const ok = !editor.hasAttribute('data-ctl-write');
    editor.removeAttribute('data-ctl-write');
    if (!ok) return false;
    await frame();
    await frame();
    return true;
  }

  // First Enter swaps the typed text for its translation; the next one sends it.
  async function previewTranslation(editor, ctx, text) {
    busy = true;
    // Still inside the Enter/click gesture, so a model download is allowed to start.
    const ready = initPair(settings.target, ctx.lang, true);
    note(ctx, 'Translating…');
    try {
      await ready;
      const out = await translate(text, settings.target, ctx.lang);
      if (!editor.isConnected || readInput(editor) !== text) return note(ctx, null); // edited meanwhile
      if (!out || out === 'pending') {
        ctx.failed = true;
        return note(ctx, `Couldn't translate · Enter sends as typed`, true);
      }
      if (!(await writeInput(editor, out))) {
        console.warn("[Chat Translate] couldn't reach Twitch's chat box editor");
        ctx.failed = true;
        return note(ctx, `Couldn't fill the chat box · Enter sends as typed`, true);
      }
      ctx.original = text;
      note(ctx, 'Enter to send · click to undo');
    } finally {
      busy = false;
    }
  }

  function interceptSend(e, editor) {
    const ctx = replyTarget(editor);
    if (!ctx || ctx.off || ctx.failed) return;
    if (ctx.original != null) {
      // Translation already in the box: let this one send, and translate the next message again.
      ctx.original = null;
      return note(ctx, null);
    }
    const text = readInput(editor);
    if (!text || text.startsWith('/')) return; // chat commands go through untouched
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!busy) previewTranslation(editor, ctx, text);
  }

  // Called from early.js, whose listeners are registered at document_start so
  // they run before other extensions' (e.g. 7TV's) send handlers.
  window.__ctlOnSend = (e) => {
    if (e.type === 'keydown') {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      const editor = e.target.closest?.(INPUT_SEL);
      if (editor) interceptSend(e, editor);
    } else if (e.target.closest?.(SEND_SEL)) {
      const editor = currentEditor();
      if (editor) interceptSend(e, editor);
    }
  };

  const setText = (n, t) => n.textContent !== t && (n.textContent = t); // don't feed our own observer

  function note(ctx, text, warn = false) {
    if (!ctx) return;
    Object.assign(ctx, { note: text, warn });
    if (ctx === replying) syncReply();
  }

  // The chat box being typed in; the thread panel has its own on top of the main one.
  function currentEditor() {
    const focused = document.activeElement?.closest?.(INPUT_SEL);
    if (focused) return focused;
    const visible = [...document.querySelectorAll(INPUT_SEL)].filter((n) => n.getBoundingClientRect().width);
    return visible[visible.length - 1] || null;
  }

  function syncReply() {
    const editor = currentEditor();
    const ctx = editor && replyTarget(editor);
    if (ctx !== replying) {
      if (replying) Object.assign(replying, { off: false, failed: false, note: null, warn: false, original: null });
      replying = ctx;
      if (ctx) initPair(settings.target, ctx.lang); // warm up; a needed download starts on the next keypress
    }
    if (ctx?.original != null && !readInput(editor)) Object.assign(ctx, { original: null, note: null }); // box cleared
    const r = ctx && editor.getBoundingClientRect();
    if (!ctx || !r.width) return pill.remove();
    const [tag, label] = pill.children;
    setText(tag, `${base(settings.target).toUpperCase()}→${base(ctx.lang).toUpperCase()}`);
    setText(label, ctx.note || (ctx.off ? 'Sending as typed' : `Reply in ${langName(ctx.lang)}`));
    pill.title =
      ctx.original != null
        ? `Translated from: ${ctx.original}\nClick to put your original text back`
        : ctx.off
          ? 'Click to translate this reply again'
          : `Enter translates your text to ${langName(ctx.lang)}, Enter again sends it. Click to send this reply as typed`;
    pill.classList.toggle('off', !!ctx.off);
    pill.classList.toggle('warn', !!ctx.warn);
    pill.style.top = `${r.top - 4}px`;
    pill.style.left = `${r.right - 8}px`;
    if (!pill.isConnected) document.body.append(pill);
  }

  let syncQueued = false;
  function queueSync() {
    if (syncQueued || (!settings.replyTranslate && !replying)) return;
    syncQueued = true;
    requestAnimationFrame(() => {
      syncQueued = false;
      syncReply();
    });
  }
  window.addEventListener('resize', queueSync);

  // ---------- DOM watching ----------

  let pendingNodes = new Set();
  let scheduled = false;
  function flush() {
    scheduled = false;
    const nodes = pendingNodes;
    pendingNodes = new Set();
    for (const n of nodes) {
      if (!n.isConnected) continue;
      if (n.matches(MSG_SEL)) enqueue(n);
      else if (n.firstElementChild) n.querySelectorAll(MSG_SEL).forEach(enqueue);
      else {
        const msg = n.closest?.(MSG_SEL);
        if (msg) enqueue(msg); // text re-rendered inside an existing message
      }
    }
  }

  const observer = new MutationObserver((muts) => {
    queueSync();
    if (!settings.enabled) return;
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1 && !n.classList.contains('ctl-tr') && !n.classList.contains('ctl-chip')) pendingNodes.add(n);
      }
    }
    if (pendingNodes.size && !scheduled) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  });

  function scanAll() {
    document.querySelectorAll(MSG_SEL).forEach(enqueue);
  }

  function resetAll() {
    queue.length = 0;
    waiting.clear();
    cache.clear();
    recent.length = 0;
    for (const p of pairs.values()) p.api?.destroy?.();
    pairs.clear();
    document.querySelectorAll(MSG_SEL).forEach((m) => {
      clear(m);
      delete m.dataset.ctl;
    });
  }

  // ---------- settings ----------

  chrome.storage.sync.get(CTL_DEFAULTS).then((s) => {
    settings = s;
    applyLook();
    observer.observe(document.body, { childList: true, subtree: true });
    if (settings.enabled) scanAll();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const keys = Object.keys(changes).filter((k) => k in CTL_DEFAULTS);
    for (const k of keys) settings[k] = changes[k].newValue ?? CTL_DEFAULTS[k];
    if (!keys.length) return;
    applyLook();
    // Style-only changes restyle in place; anything else re-translates.
    if (keys.every((k) => CTL_LOOK.includes(k) || k === 'replyTranslate')) return syncReply();
    resetAll();
    if (settings.enabled) scanAll();
    syncReply();
  });
})();
