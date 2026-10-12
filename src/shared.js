// Shared by the content script and the popup (popup uses it for the live preview).

const CTL_DEFAULTS = {
  enabled: true,
  target: (navigator.language || 'en').split('-')[0],
  cloud: false,
  // look
  accent: '#a970ff',
  highlight: 'both', // both | bar | tint | none
  tint: 7, // highlight background strength, %
  textColor: 'soft', // soft | accent | plain | dim
  size: 94, // translation size, % of chat text
  tag: true, // language tag pill
  italic: false,
  mode: 'below', // below | replace (hover a message to see the original)
  // behaviour
  sensitivity: 'balanced', // strict | balanced | loose
  skip: [], // languages never translated
  replyTranslate: false, // replying to a translated message sends your text in their language
};

// Keys that only change styling, so applying them doesn't need a re-translate.
const CTL_LOOK = ['accent', 'highlight', 'tint', 'textColor', 'size', 'tag', 'italic', 'mode'];

const ctlClamp = (n, lo, hi, d) => (Number.isFinite(+n) ? Math.min(hi, Math.max(lo, +n)) : d);

function ctlCss(s) {
  const a = /^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : CTL_DEFAULTS.accent;
  const mix = (p) => `color-mix(in srgb, ${a} ${p}%, transparent)`;
  const light = `color-mix(in srgb, ${a} 62%, #fff)`;
  const bar = s.highlight === 'both' || s.highlight === 'bar';
  const tint = s.highlight === 'both' || s.highlight === 'tint';
  const text =
    {
      soft: 'opacity: .82;',
      accent: `color: ${light};`,
      plain: '',
      dim: 'opacity: .55;',
    }[s.textColor] ?? 'opacity: .82;';

  return `
    .ctl-hl {
      ${bar ? `box-shadow: inset 2px 0 0 ${a};` : ''}
      ${tint ? `background-color: ${mix(ctlClamp(s.tint, 0, 40, 7))} !important;` : ''}
    }
    .ctl-tr {
      display: flex; align-items: baseline; gap: 6px; margin-top: 2px;
      font-size: ${ctlClamp(s.size, 70, 130, 94) / 100}em; line-height: 1.35; ${text}
      ${s.italic ? 'font-style: italic;' : ''}
      animation: ctl-in .18s ease-out;
    }
    .ctl-tag {
      flex: none; padding: 1px 5px; border-radius: 4px; cursor: default; font-style: normal;
      font: 700 9.5px/1.5 Inter, Roobert, system-ui, sans-serif; letter-spacing: .04em;
      color: ${light}; background: ${mix(18)}; transform: translateY(-1px);
      ${s.tag ? '' : 'display: none;'}
    }
    .ctl-text { min-width: 0; overflow-wrap: anywhere; }
    .ctl-chip {
      display: inline-flex; margin-top: 3px; padding: 2px 8px; border-radius: 10px; border: 0; cursor: pointer;
      font: 600 11px/1.5 Inter, Roobert, system-ui, sans-serif; color: ${light}; background: ${mix(14)};
    }
    .ctl-chip:hover { background: ${mix(26)}; }
    .ctl-reply {
      position: fixed; z-index: 10000; transform: translate(-100%, -100%); white-space: nowrap;
      display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px 2px 4px; border: 0; border-radius: 10px;
      cursor: pointer; font: 600 11px/1.5 Inter, Roobert, system-ui, sans-serif; color: ${light};
      background: color-mix(in srgb, ${a} 24%, #18181b); box-shadow: 0 1px 4px rgba(0, 0, 0, .45);
    }
    .ctl-reply .ctl-tag { display: inline-block; transform: none; }
    .ctl-reply.off { color: #adadb8; background: #26262c; }
    .ctl-reply.off .ctl-tag { text-decoration: line-through; }
    .ctl-reply.warn { color: #ffb31a; }
    ${
      s.mode === 'replace'
        ? `.ctl-tr { display: inline-flex; margin-top: 0; }
           .ctl-hl:not(:hover) .ctl-orig { display: none !important; }
           .ctl-hl:hover .ctl-tr { display: none; }`
        : ''
    }
    @keyframes ctl-in { from { opacity: 0; transform: translateY(-2px); } }
  `;
}
