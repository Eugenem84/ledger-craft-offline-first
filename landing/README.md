# Промо-страница Ledger Craft

Статический лендинг, который предлагает скачать свежий APK. Лежит отдельно от Quasar-приложения:
это просто три файла без сборки и зависимостей, поэтому страницу можно положить куда угодно
(или отдавать тем же веб-сервером, что и API).

| Файл          | Что это                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------- |
| `index.html`  | разметка, тексты, ссылки-кнопки; в конце — `window.LEDGER_CRAFT_API`                      |
| `landing.css` | тёмная тема и жёлтый акцент — как в приложении (`src/css/app.scss`)                       |
| `landing.js`  | запрашивает `GET /api/app-version`, показывает версию/размер/sha256 и ведёт кнопку на APK |

## Как это работает

1. Кнопки («Скачать свежий APK») изначально ведут на `GET {API}/download-apk` без параметра —
   сервер отдаёт **последний опубликованный релиз**. Это работает и без JavaScript.
2. Страница запрашивает `GET {API}/app-version` (тот же эндпоинт, что использует само
   приложение для самообновления, см. `docs/API-INTEGRATION.md` §2.5) и обогащает экран:
   версия, размер, sha256, «что нового», а кнопку переводит на точный `apkUrl` релиза.
3. Если сборка ещё не опубликована (`404`) или сети нет — кнопки **выключаются**, а статус
   объясняет причину. Так клик никогда не приводит на JSON-ошибку `/api/download-apk`
   (`{"error":"File not found"}`): без релиза у ссылок вообще снят `href`. Когда версию узнать
   не удалось, но файл доступен, страница проверяет эндпоинт через `HEAD` и включает кнопку.

## Совместимость с контурами

Страница поддерживает **оба** контракта версии, потому что контуры бывают сборками разных
поколений:

| Контур                                | Эндпоинт версии                                                     | Откуда файл                    |
| ------------------------------------- | ------------------------------------------------------------------- | ------------------------------ |
| новый бэкенд (Фаза 13)                | `GET /api/app-version` → манифест `releases.json`                   | `storage/app/public/releases/` |
| старый бэкенд (напр. текущий dev-VPS) | `GET /api/app-quasar-android-version` → `{ "version", "apk_name" }` | `storage/app/public/*.apk`     |

`landing.js` пробует `/app-version`, при неудаче — исторический `/app-quasar-android-version`,
и в легаси-ответе сам подставляет ссылку `/api/download-apk` (там нет поля `apkUrl`). Если
версию узнать не удалось, но файл есть, страница подтверждает его через `HEAD`.

### Грабли: APK «не виден» после заливки

У php-fpm включён opcache (`revalidate_freq=2`), и свежезалитый файл может не подхватиться
запросом: `glob()` из CLI файл видит, а HTTP отдаёт «дистрибутив не найден». Лечится
перезапуском контейнера приложения:

```bash
ssh dev-vps 'docker restart ledger_craft_app'
```

Проверка после этого:

```bash
curl -s https://dev.medovf2h.beget.tech/api/app-quasar-android-version   # → {"version":"1.1","apk_name":"…"}
curl -sI https://dev.medovf2h.beget.tech/api/download-apk | grep -i content-type
```

## Адрес API

Меняется одной строкой в `index.html` (перед подключением `landing.js`):

```html
<script>
  window.LEDGER_CRAFT_API = 'https://dev.medovf2h.beget.tech/api' // ← боевой домен
</script>
```

Правило сред то же, что у проекта: сначала dev-VPS, на боевой — только проверенное.

## Локальный просмотр

```bash
npm run landing:serve      # → http://localhost:8090
```

Скрипт поднимает статический сервер без зависимостей (`scripts/serve-landing.mjs`).

## Выкат

Одной командой (копирование + проверка HTTP):

```bash
npm run landing:publish                 # dev-VPS по умолчанию
npm run landing:publish -- --dry-run    # только показать, что уедет
npm run landing:publish -- --server prod-vps --url https://<прод-домен>/promo/
```

Скрипт `scripts/publish-landing.sh` кладёт `landing/` (без служебного `README.md`) в
`/var/www/LedgerCraftDocker03/public/promo/` и проверяет `200` на `/`, `/landing.css`, `/landing.js`.

Почему достаточно простого копирования: nginx контура монтирует корень Laravel-репозитория в
`/var/www` и отдаёт статику из `/var/www/public` (`root /var/www/public;` +
`try_files $uri $uri/ /index.php?$query_string`). Поэтому файл в `public/promo/` доступен по
`/promo/` **сразу** — без правки конфига nginx и без перезапуска контейнера.

**Текущий статус:** на dev-VPS опубликовано → <https://dev.medovf2h.beget.tech/promo/>.

CORS не нужен, пока страница и API на одном домене. **APK при этом должен быть опубликован**
(`php artisan app:publish-apk`, см. `LedgerCraftDocker03/docs/ENVIRONMENTS.md` §10) — иначе
`/api/download-apk` отвечает `404 {"error":"File not found"}`, и страница покажет мягкий статус
«Сборка ещё не опубликована».

⚠️ Каталог лежит внутри git-рабочей копии бэкенда, поэтому в его `git status` появится
untracked `public/promo/`. Чтобы не мусорить, добавьте `/public/promo` в `.gitignore` бэкенда
(это правка соседнего репозитория, делается на его стороне).

## Обновление контента

Публикация релиза APK — `php artisan app:publish-apk` на сервере (см. `scripts/release-apk.sh`).
Тексты и возможности на странице — это разметка `index.html`, меняются вручную.
