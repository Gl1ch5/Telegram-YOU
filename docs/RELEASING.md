# Версии и релизы

Версия проекта живёт в git: **каждый релиз — аннотированный тег `vX.Y.Z`**, откатываться и возвращаться можно к любому тегу. Номер ([SemVer](https://semver.org/lang/ru/)) хранится в одном файле — `js/version.js` (`APP_VERSION`); из него берутся версия в «О Telegram You», имена файлов, `versionName`/`versionCode` Android, версия Windows-приложения и кэш Service Worker.

## Ветки
- `main` — всегда рабочая версия (тесты зелёные). Прямые коммиты — только мелкие правки; всё остальное — через ветку и pull request (`feat/…`, `fix/…`). CI (`Tests`) запускается на каждый PR.
- Релиз создаётся только из `main`.

## Выпустить версию
```bash
git checkout main && git pull
npm run release -- minor      # patch | minor | major | 1.4.2
git push origin main --follow-tags
```
`npm run release`: проверяет, что дерево чистое и вы на `main`, гоняет тесты, поднимает версию (`js/version.js`, `sw.js`, оба `package.json`), переносит записи из `## [Unreleased]` в `CHANGELOG.md` под новый номер, пересобирает `precache.json`, делает коммит `Release vX.Y.Z` и тег `vX.Y.Z`. Если передумали до `git push`: `git tag -d vX.Y.Z && git reset --hard HEAD~1`.

После `git push --follow-tags` GitHub Actions по тегу:
- **Android APK** → релиз `vX.Y.Z`: `TelegramYou-X.Y.Z.apk`, `TelegramYou.apk` (постоянное имя для автообновления), `version.json`;
- **Windows** → `TelegramYou-Setup-X.Y.Z.exe`, `TelegramYou-Portable-X.Y.Z.exe`;
- **Pages** → сайт = последний тег.
Сборки проверяют, что тег совпадает с `APP_VERSION`; иначе падают.

`versionCode` Android = `мажор·10000 + минор·100 + патч` (1.4.2 → 10402): растёт вместе с версией, поэтому обновление «поверх» всегда видно системе.

## Откат
Нужно вернуть пользователям прежнее поведение, а система/автообновление видят только рост номера, поэтому **откат = новый релиз с содержимым старого**:
```bash
git revert <плохой_коммит>        # или несколько; либо git revert --no-commit vX.Y.Z..HEAD
npm run release -- patch          # 1.4.3 с содержимым 1.4.1
git push origin main --follow-tags
```
Только сайт (без нового релиза приложений): Actions → «Deploy to GitHub Pages» → *Run workflow* → выбрать прежний тег — сайт пересоберётся из него.
Только пересобрать файлы старого тега: Actions → «Android APK» / «Windows» → *Run workflow* → поле `tag` (`v1.4.1`).
Посмотреть прежнюю версию локально: `git checkout v1.4.1` (потом `git checkout main`).

## Подпись Android
Без секретов собирается debug-APK с общим ключом: обновления встают поверх друг друга. Для своего ключа добавьте в Settings → Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. **Ключ нельзя менять между версиями** — иначе Android не обновит приложение.

## Правила для агентов и разработчиков
1. Не создавайте теги и не трогайте `js/version.js` вручную: версию меняет только `npm run release`.
2. Каждое заметное изменение — строка в `CHANGELOG.md` → `## [Unreleased]` (Добавлено / Изменено / Исправлено).
3. Не переписывайте историю `main` и не двигайте опубликованные теги.
4. Перед PR: `npm test`, `npm run i18n`; после правок любых файлов приложения: `npm run precache` (тест проверяет, что `precache.json` актуален).
