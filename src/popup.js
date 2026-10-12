const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it', 'nl', 'pl', 'ru', 'uk', 'tr', 'ar', 'hi', 'ja', 'ko', 'zh', 'th', 'vi', 'id', 'sv'];
const SWATCHES = ['#a970ff', '#4d9bff', '#2ee6c5', '#00f593', '#ffb31a', '#ff5fd2', '#ff4f5e'];
const CLOUD = { origins: ['https://translate.googleapis.com/*'] };
const RESETTABLE = [...CTL_LOOK, 'sensitivity', 'skip', 'replyTranslate'];

const $ = (id) => document.getElementById(id);
const names = new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' });
const byName = (a, b) => names.of(a).localeCompare(names.of(b));

let s = { ...CTL_DEFAULTS };

// Preview updates instantly; storage writes are rate-limited by Chrome, so
// sliders and the colour picker only save when released.
function set(patch, save = true) {
  Object.assign(s, patch);
  paint();
  if (save) chrome.storage.sync.set(patch);
}

function paint() {
  $('look').textContent = ctlCss(s);
  document.body.classList.toggle('off', !s.enabled);
  document.documentElement.style.setProperty('--accent', s.accent);

  document.querySelectorAll('[data-key]').forEach((n) => {
    const v = s[n.dataset.key];
    if (n.classList.contains('seg')) n.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    else if (n.type === 'checkbox') n.checked = v;
    else if (document.activeElement !== n) n.value = v;
    if (n.type === 'range') n.nextElementSibling.value = `${v}%`;
  });

  const preset = SWATCHES.includes(s.accent);
  document.querySelectorAll('.swatch[data-c]').forEach((b) => b.classList.toggle('on', b.dataset.c === s.accent));
  $('custom').parentElement.classList.toggle('on', !preset);
  $('custom').value = s.accent;

  $('tint-row').classList.toggle('disabled', s.highlight === 'bar' || s.highlight === 'none');
  $('mode-hint').textContent = s.mode === 'replace' ? 'Hover a message to see the original' : 'Translation under the message';
  paintSkip();
}

function paintSkip() {
  const box = $('skip');
  box.querySelectorAll('.chip').forEach((c) => c.remove());
  for (const code of s.skip) {
    const x = document.createElement('button');
    x.textContent = '×';
    x.title = 'Remove';
    x.onclick = () => set({ skip: s.skip.filter((c) => c !== code) });
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.append(names.of(code), x);
    box.insertBefore(chip, $('skip-add'));
  }
  const add = $('skip-add');
  add.length = 1;
  add.append(...LANGS.filter((c) => c !== s.target && !s.skip.includes(c)).sort(byName).map((c) => new Option(names.of(c), c)));
}

async function init() {
  s = await chrome.storage.sync.get(CTL_DEFAULTS);

  const langs = LANGS.includes(s.target) ? LANGS : [s.target, ...LANGS];
  $('target').append(...[...langs].sort(byName).map((code) => new Option(names.of(code), code)));

  $('swatches').prepend(
    ...SWATCHES.map((c) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.dataset.c = c;
      b.style.setProperty('--c', c);
      b.onclick = () => set({ accent: c });
      return b;
    })
  );
  $('custom').oninput = (e) => set({ accent: e.target.value }, false);
  $('custom').onchange = (e) => set({ accent: e.target.value });

  document.querySelectorAll('[data-key]').forEach((n) => {
    const key = n.dataset.key;
    if (n.classList.contains('seg')) n.onclick = (e) => e.target.dataset.v && set({ [key]: e.target.dataset.v });
    else if (n.type === 'checkbox') n.onchange = () => set({ [key]: n.checked });
    else if (n.type === 'range') {
      n.oninput = () => set({ [key]: +n.value }, false);
      n.onchange = () => set({ [key]: +n.value });
    } else n.onchange = () => set({ [key]: n.value });
  });

  $('skip-add').onchange = (e) => e.target.value && set({ skip: [...s.skip, e.target.value] });

  $('cloud').checked = s.cloud && (await chrome.permissions.contains(CLOUD));
  $('cloud').onchange = async (e) => {
    let on = e.target.checked;
    if (on) on = await chrome.permissions.request(CLOUD);
    else chrome.permissions.remove(CLOUD);
    e.target.checked = on;
    set({ cloud: on });
    status();
  };

  $('reset').onclick = () => set(Object.fromEntries(RESETTABLE.map((k) => [k, structuredClone(CTL_DEFAULTS[k])])));

  paint();
  status();
}

async function status() {
  const show = (text, kind) => {
    $('status').textContent = text;
    $('dot').className = 'dot ' + kind;
  };
  if (!('Translator' in self) || !('LanguageDetector' in self)) {
    return $('cloud').checked
      ? show('Using cloud translation', 'ok')
      : show('On-device AI not supported in this Chrome', 'warn');
  }
  try {
    const a = await LanguageDetector.availability();
    if (a === 'unavailable') return show('On-device models unavailable', 'warn');
    show('On-device · private & local', 'ok');
  } catch {
    show('On-device translation', 'ok');
  }
}

init();
