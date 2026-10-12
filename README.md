# Chat Translate for Twitch

A Chrome extension that spots foreign-language messages in Twitch chat and translates them inline. Translation runs on-device with Chrome's built-in AI, so by default nothing leaves your machine.

```
steel_platecarrier: 맨날 PVP PVE 갈라치기 지겹지도 않나
KO  Aren't you tired of splitting PVP and PVE every day
```

- Inline translations, with the original kept on hover
- Reply in their language: type in yours, check the translation, send
- Works with live chat, VOD chat and 7TV
- No account, no API key, no tracking

## Install

Requires desktop Chrome 138 or later.

1. Download the latest `chat-translate-for-twitch-*.zip` from [Releases](../../releases/latest) and unzip it
2. Open `chrome://extensions` and turn on **Developer mode**
3. Click **Load unpacked** and select the unzipped folder

To run from source instead, clone the repo and load the `src` folder.

The first time a new language shows up, Chrome downloads its translation model once. Click anywhere on the page, or the **Translate ...** chip on the message, to start it.

## Settings

Open the toolbar popup. A live preview at the top shows every change before it reaches chat.

**Look**

- **Colour:** seven presets or any custom colour, used for the bar, tint and language tag
- **Highlight:** bar and tint, bar only, tint only, or off
- **Tint strength**, **Text** style, **Text size**, **Language tag**, **Italic**

**Translation**

- **Translate to:** your language, defaulting to the browser's
- **Show:** *Below* adds the translation under the message. *Replace* swaps it in and shows the original on hover
- **Sensitivity:** how sure detection must be for Latin-alphabet languages. Strict avoids false positives on chat slang, Loose catches short messages
- **Don't translate:** languages you already read
- **Translate my replies:** off by default. Reply to a translated message and a pill such as **EN→DE Reply in German** appears on the chat box. Press Enter once to swap your text for the translation, and again to send it. Click the pill to restore your text or to send as typed. Chat commands are never translated
- **Cloud fallback:** off by default. See below

## Privacy

Detection and translation use Chrome's on-device [Language Detector](https://developer.chrome.com/docs/ai/language-detection) and [Translator](https://developer.chrome.com/docs/ai/translator-api) APIs. The extension makes no network requests of its own and only stores your settings, in Chrome sync storage.

**Cloud fallback** is the one exception. When it is on and a message can't be translated on-device (an unsupported language pair, or a model still downloading), the message text is sent to Google Translate. Chrome asks for permission when you turn it on, and the permission is removed when you turn it off.

## How it works

- Watches only newly added chat nodes and batches work per animation frame
- Translates up to three messages at a time and caches repeats
- Skips short and emote-only messages such as "KEKW", "o7" or "ㅋㅋㅋ"
- Non-Latin scripts (Korean, Japanese, Chinese, Cyrillic, Arabic, Thai and more) are recognised instantly by script. Latin-script messages need three or more words and a confident detection

## Releasing

Releases are automated with GitHub Actions. Either:

- Run the **Release** workflow from the Actions tab and pick patch, minor or major (or none to release the current version), or
- Change `version` in `src/manifest.json` and push to `main`

The workflow checks the code, packages `src` into a zip and publishes a GitHub release with generated notes.

## License

[MIT](LICENSE)
