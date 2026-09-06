# Changelog

## 1.2.0

- Fix nested/duplicate TTS controls on chat layouts.
- Prefer assistant-message selectors over generic page selectors.
- Exclude navigation/sidebar/header/footer/menu/dialog/toolbar containers.
- Add logical-block overlap de-duplication.
- Add idempotent `data-site-local-tts-bound` binding.
- Ignore observer mutations produced only by TTS controls.
- Preserve dual eSpeak NG and Piper buttons.

## 1.1.0

- Add Piper neural TTS as a second local engine.
- Keep eSpeak NG as the lightweight fallback.
