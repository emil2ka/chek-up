# Распознавание чеков для «Чек-ап»: какую модель брать

Дата проверки: **16.11.2026**. Все цены взяты с официальных страниц в этот день, ссылка стоит рядом с каждой цифрой. Где данные неполные или это моя оценка, стоит пометка **⚠️ не проверено** или «оценка».

Курс: **1 USD = 444,30 ₸**, официальный курс Нацбанка РК на 16.11.2026 ([nationalbank.kz, XML-лента курсов](https://www.nationalbank.kz/rss/get_rates.cfm?fdate=16.11.2026)).

> **Обновление 16.11.2026: возрастные ограничения сервисов не учитываем** (ключи оформляет владелец проекта). Тогда рекомендация меняется:
> - **Основной для хакатона — Google `gemini-3.5-flash-lite`.** Бесплатный уровень без карты, Казахстан в списке регионов, ответ по JSON-схеме, картинка всегда 1120 токенов. Платно ≈1,80 ₸ за чек (180 ₸ на 100, 1 798 ₸ на 1000). Минусы: точные бесплатные лимиты видно только в AI Studio, а данные с бесплатного уровня Google использует для улучшения своих продуктов (фото чеков с покупками туда уйдут).
> - **Для масштаба — OpenAI `gpt-6-luna`.** Самый дешёвый платный вариант со строгим JSON: ≈0,47 ₸ за чек (47 ₸ на 100, 473 ₸ на 1000), но нужна предоплата от $5.
> - Без возрастного ограничения становятся доступны и `qwen/qwen3.8-flash` через OpenRouter (≈0,31 ₸ за чек, строгий JSON) и `claude-haiku-5-5` (≈0,48 ₸). Качество Qwen на наших чеках неизвестно, поэтому он остаётся вариантом для сравнения, а не основным.
> - Mistral остаётся вариантом, если на тестах окажется, что казахский текст лучше читает именно он.
> - В коде порядок выбора провайдера при нескольких ключах теперь: Gemini → OpenAI → Mistral → Anthropic → OpenRouter. Ниже — исходный разбор с учётом возраста, цифры в нём не менялись.

---

## 0. Итог в двух строках

- **Основной вариант: OpenAI `gpt-6-luna`** через Responses API, ответ строго по JSON-схеме (`text.format` с `type: "json_schema"` и `strict: true`). На обоих шагах выходит около **$0,00106 ≈ 0,47 ₸ на чек**. Казахстан в списке поддерживаемых стран. По правилам OpenAI можно пользоваться с 13 лет с разрешения родителя. Нужна карта, чтобы один раз пополнить баланс на $5.
- **Запасной вариант: Mistral `mistral-ocr-4-1`** со структурированным ответом `document_annotation_format`: OCR и JSON за один вызов, $5 за 1000 страниц. Для текстового шага берём `mistral-small-2603`. Правила тоже разрешают 13+ с разрешением родителя, есть бесплатный план.
- Gemini `gemini-3.5-flash-lite` дешевле всех на старте, потому что бесплатный уровень работает без карты. Но **условия Gemini API требуют 18+ и запрещают приложения, которыми скорее всего будут пользоваться люди младше 18** (см. §1.1). Поэтому в рекомендацию он не попал. Его можно взять, только если ключ на себя оформляет совершеннолетний участник или наставник и приложение не рассчитано на подростков.
- Путь через фискальный QR **работает как дополнительный бесплатный и точный вариант**, но только через свой сервер-прокси: CORS закрыт, у каждого ОФД свой формат (см. §3). Основным его сделать нельзя: у части чеков QR нет или он не читается, ОФД несколько, и проверить всё до конца можно только на настоящем чеке.

---

## 1. Сравнение моделей (часть A)

### Допущения для расчёта

- Фото чека уменьшаем до длинной стороны ≤1800 px. Чек вертикальный, берём **1350×1800 px**.
- Шаг 1 (чек → позиции): изображение + ~300 токенов промпта на входе, ~600 токенов на выходе.
- Шаг 2 (текст: сахар, флаг «вредное», замена): ~400 токенов на входе, ~800 на выходе.
- «Размышления» (thinking/reasoning) оплачиваются как выходные токены. В расчёте они отключены или минимальны. Как это сделать, указано у каждой модели. Если оставить значение по умолчанию, цена вырастет.

### 1.1 Таблица

| | Google Gemini | Anthropic Claude | OpenAI | Mistral OCR | Yandex Vision OCR | Qwen через OpenRouter |
|---|---|---|---|---|---|---|
| **id модели** | `gemini-3.5-flash-lite` (актуальная, без даты отключения); дешевле `gemini-3.1-flash-lite` (отключение не раньше 07.05.2027) ([deprecations](https://aistudio.google.com/docs/deprecations.md)) | `claude-haiku-5-5` ([models overview](https://platform.claude.com/docs/en/about-claude/models/overview.md)) | `gpt-6-luna` ([model page](https://developers.openai.com/api/docs/models/gpt-6-luna.md)) | `mistral-ocr-4-1` (алиасы `mistral-ocr-4`, `mistral-ocr-latest`); дешевле `mistral-ocr-2512` (OCR 3) ([OCR 4.1](https://docs.mistral.ai/models/ocr-4-1.md)) | Vision OCR «Распознавание печатного текста» | `qwen/qwen3.8-flash` (поддерживает structured_outputs); дешевле `qwen/qwen3.5-flash-02-23`; самый дешёвый `qwen/qwen3.7-flash` (без structured_outputs) ([OpenRouter /api/v1/models](https://openrouter.ai/api/v1/models)) |
| **Цена, вход / выход за 1M токенов** | 3.5 FL: $0,30 / $2,50; 3.1 FL: $0,25 / $1,50; 2.5 FL: $0,10 / $0,40 ([pricing](https://aistudio.google.com/docs/pricing.md)) | $0,10 / $0,50 (для промптов ≤100k) ([pricing](https://platform.claude.com/docs/en/about-claude/pricing.md)) | $0,10 / $0,50 ([pricing](https://developers.openai.com/api/docs/pricing.md)) | OCR 4.1: $4 за 1000 страниц, $5 за 1000 страниц с аннотацией; OCR 3: $2 / $3 ([pricing](https://docs.mistral.ai/inference/pricing.md)) | 0,6605 ₸ за изображение с НДС ([тарифы AI Studio](https://aistudio.yandex.ru/ru/docs/ai-studio/pricing#rules-image-recognition)) | 3.8 Flash: $0,15 / $0,47; 3.5 Flash: $0,065 / $0,26; 3.7 Flash: $0,03 / $0,13 ([OpenRouter models API](https://openrouter.ai/api/v1/models)) |
| **Как считаются токены картинки** | В Gemini 3.x по умолчанию **1120 токенов** на картинку (`MEDIA_RESOLUTION_HIGH` тоже 1120, `ULTRA_HIGH` 2240) ([media resolution](https://aistudio.google.com/docs/media-resolution.md?generate-content=true)) | `⌈w/28⌉×⌈h/28⌉`, предел 4784 токена и 2576 px для моделей 4.7+ ([vision](https://platform.claude.com/docs/en/build-with-claude/vision.md), [формула](https://platform.claude.com/docs/en/build-with-claude/vision-coordinates.md)) | Патчи 32×32: `ceil(w/32)×ceil(h/32)`, затем ×1,2 для моделей gpt-5.x/6; при `detail: high` бюджет 2500 патчей ([vision](https://developers.openai.com/api/docs/guides/images-vision.md)). ⚠️ `gpt-6-luna` нет в таблицах этой страницы, взято правило как у gpt-6-astra и gpt-5.6-luna | Оплата за страницу или изображение, токены не считаются | Оплата за изображение | Qwen3.x и Qwen3-VL: 1 токен на 32×32 px, по умолчанию до 2 621 440 px ([Alibaba Model Studio](https://www.alibabacloud.com/help/en/model-studio/vision)) |
| **Токены картинки 1350×1800** | 1120 | 49×65 = **3185** | 43×57 = 2451 патч ×1,2 = **2942** (⚠️ оценка) | — | — | 43×57 = **2451** |
| **Шаг 1: цена одного чека** | 3.5 FL: **$0,00193 (0,86 ₸)**; 3.1 FL: $0,00126 (0,56 ₸); бесплатно в пределах free tier | **$0,00065 (0,29 ₸)** | **$0,00062 (0,28 ₸)** | OCR 4.1 с аннотацией: **$0,005 (2,22 ₸)**; OCR 3 с аннотацией: $0,003 (1,33 ₸). Только OCR + `mistral-small-2603` (~800 вх / 600 вых): $0,00448 (1,99 ₸) | OCR 0,6605 ₸ + структурирование Alice AI LLM Flash (0,5 ₸ за 1000 вх, 1 ₸ за 1000 вых ([тарифы](https://aistudio.yandex.ru/ru/docs/ai-studio/pricing))) ≈ **1,66 ₸ (~$0,0037)** | 3.8 Flash: $0,00070 (0,31 ₸); 3.5 Flash: $0,00034 (0,15 ₸); 3.7 Flash: $0,00016 (0,07 ₸) |
| **Шаг 2: текст (400 / 800)** | 3.5 FL: $0,00212 (0,94 ₸); 3.1 FL: $0,0013 (0,58 ₸) | $0,00044 (0,20 ₸) | $0,00044 (0,20 ₸) | `mistral-small-2603` ($0,15 / $0,6 ([pricing](https://docs.mistral.ai/inference/pricing.md))): $0,00054 (0,24 ₸) | Alice AI LLM Flash: 1,0 ₸ | 3.8 Flash: $0,00044 (0,19 ₸) |
| **Структурированный JSON** | Да, нативно: `responseFormat.text.schema` в REST или `responseJsonSchema` в SDK ([structured output](https://aistudio.google.com/docs/structured-output.md?generate-content=true)) | Да: `output_config.format` с `type: "json_schema"` ([structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md)) | Да, строго: `text.format = {type:"json_schema", strict:true}` ([structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs.md)) | Да: `document_annotation_format` (JSON-схема) ([annotations](https://docs.mistral.ai/studio/document-processing/annotations.md)) | Нет, OCR отдаёт только текст и блоки, JSON собирает второй шаг | 3.8 Flash и 3.5 Flash: `structured_outputs`; 3.7 Flash: только `response_format` ([models API](https://openrouter.ai/api/v1/models)) |
| **Качество на кириллице и чеках** | Заявлено, что 3.5 Flash-Lite оптимизирован в том числе для «document parsing» ([model card](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite.md)). OCRBench и тестов на казахском: нет данных | Haiku 5.5 позиционируется для «extraction» ([model page](https://platform.claude.com/docs/en/models/haiku-5-5/overview.md)). Тестов на кириллических чеках: нет данных | нет данных | Русский в списке OCR-языков, отдельно сказано, что на казахском тоже хорошее качество ([languages](https://docs.mistral.ai/resources/languages.md)). В документации пример на чеке ([basic OCR](https://docs.mistral.ai/studio/document-processing/basic_ocr.md)) | `kk` и `ru` в одной латино-кириллической модели, то есть смешанный текст распознаётся одним запросом ([языки](https://aistudio.yandex.ru/ru/docs/vision/concepts/ocr/supported-languages)) | Qwen3-VL: OCR на 32 языках, устойчив к слабому свету, размытию и наклону ([HF model card](https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct)). Тестов на казахском: нет данных |
| **Скорость (грубо)** | официальных цифр нет; оценка 2–5 с | «Fastest» в линейке Anthropic ([model page](https://platform.claude.com/docs/en/models/haiku-5-5/overview.md)) | официальных цифр нет; оценка 2–5 с при reasoning `none` | скорость 4/5 по оценке Mistral ([OCR 4.1](https://docs.mistral.ai/models/ocr-4-1.md)) | нет данных | нет данных |
| **Бесплатный уровень** | Есть, без карты; на некоторых проектах нужна проверка телефоном через QR ([verification](https://aistudio.google.com/docs/verification.md)). Конкретные RPM/RPD в документации не указаны, их видно только в AI Studio ([rate limits](https://aistudio.google.com/docs/rate-limits.md)). Данные с бесплатного уровня используются для улучшения продуктов ([pricing](https://aistudio.google.com/docs/pricing.md)) | Нет. Уровень Start с потолком $500 в месяц ([rate limits](https://platform.claude.com/docs/en/api/rate-limits.md)), нужна предоплата | Таблица лимитов `gpt-6-luna` начинается с уровня Build, который даёт покупка кредитов на $5 ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits.md), [model page](https://developers.openai.com/api/docs/models/gpt-6-luna.md)) | Есть Free plan с доступом к Mistral Studio ([pricing FAQ](https://mistral.ai/pricing)). ⚠️ Лимиты бесплатного API открыто не опубликованы | Стартовый грант для резидентов РК от 20 000 ₸ на 60 дней, только если карта привязана при создании платёжного аккаунта ([грант](https://yandex.cloud/ru/docs/getting-started/usage-grant)) | Бесплатного Qwen-VL в каталоге сегодня нет. Для `:free` моделей: 20 запросов в минуту и 50 в день, после покупки ≥10 кредитов 1000 в день ([limits](https://openrouter.ai/docs/api/reference/limits.md)) |
| **Доступ из Казахстана** | Да, Kazakhstan в списке регионов ([available regions](https://aistudio.google.com/docs/available-regions.md)) | Да, Kazakhstan в Supported Regions Policy от 12.11.2026 ([supported countries](https://www.anthropic.com/supported-countries)) | Да ([supported countries](https://developers.openai.com/api/docs/supported-countries.md)) | Явного списка стран нет, условия запрещают только санкционные юрисдикции ([commercial terms](https://legal.mistral.ai/terms/commercial-terms-of-service)). ⚠️ не проверено | Да, есть цены в тенге и грант для резидентов РК ([тарифы](https://aistudio.yandex.ru/ru/docs/ai-studio/pricing), [грант](https://yandex.cloud/ru/docs/getting-started/usage-grant)) | Ограничений для РК не нашёл. ⚠️ не проверено |
| **Возраст по условиям** | **18+**, и нельзя использовать API в приложениях, «directed towards or likely to be accessed by individuals under 18» ([terms](https://aistudio.google.com/docs/terms.md)) | Потребительские условия: 18+ ([consumer terms](https://www.anthropic.com/legal/consumer-terms)). API идёт по коммерческим условиям, они «not for consumer use» ([commercial terms](https://www.anthropic.com/legal/commercial-terms)) | 13+, а **до 18 лет нужно разрешение родителя или опекуна** ([terms of use](https://openai.com/policies/row-terms-of-use/)). Services Agreement для API: нельзя пускать несовершеннолетних без согласия родителя ([services agreement](https://openai.com/policies/services-agreement/)) | 13+, несовершеннолетним нужно разрешение родителя ([consumer terms](https://legal.mistral.ai/terms/row-consumer-terms)) | Личный аккаунт оплачивается банковской картой или СБП ([платёжный аккаунт](https://yandex.cloud/ru/docs/billing/concepts/billing-account)). ⚠️ Возрастной пункт оферты не проверял | **18+** ([terms](https://openrouter.ai/terms)) |
| **Насколько легко 16-летнему получить ключ** | Технически легко: Google-аккаунт без карты. Юридически нельзя: ToS 18+ | Сложно: нужен бизнес-аккаунт и карта | Средне: аккаунт, разрешение родителя и его карта на $5 | Легко: аккаунт и разрешение родителя, карта не нужна, если хватает Free plan | Средне: нужен совершеннолетний с картой | Нельзя: 18+ |

### 1.2 Короткие выводы по каждому варианту

- **Gemini.** На старте лучший по цене, потому что бесплатный уровень работает без карты. Картинка фиксированно стоит 1120 токенов, schema-ответ есть. Но платный 3.5 Flash-Lite на обоих шагах выходит дороже Haiku и `gpt-6-luna`: выход $2,50 за 1M. И мешает пункт ToS про 18+. У `gemini-2.5-flash-lite` самая низкая цена ($0,10 / $0,40), но в документации сказано, что «Access to the 2.5 models is limited to users who have actively used them in the past» ([deprecations](https://aistudio.google.com/docs/deprecations.md)). Для нового ключа на него ⚠️ полагаться нельзя.
- **Claude Haiku 5.5.** Цена почти как у `gpt-6-luna`, но картинка дороже в токенах (3185). Ключ получить сложнее всего, потому что API рассчитан на бизнес. Adaptive thinking включено по умолчанию с `effort: medium`, его надо снизить ([model page](https://platform.claude.com/docs/en/models/haiku-5-5/overview.md)).
- **OpenAI `gpt-6-luna`.** Самый дешёвый из моделей со строгим JSON на обоих шагах. Казахстан поддерживается, правила разрешают подростка с согласия родителя. Минусы: нужна предоплата $5, правило токенов для картинок именно этой модели не задокументировано, а reasoning по умолчанию `medium`. Его нужно ставить в `none`.
- **Mistral OCR.** Специализированный OCR: заявлено качество на русском и казахском, и аннотация сразу отдаёт JSON по схеме. Дороже LLM-вариантов в 4–5 раз, но всё равно копейки. Хороший запасной вариант от другого вендора.
- **Yandex Vision OCR.** Явно поддерживает `kk` и `ru` вместе, цены в тенге, грант 20 000 ₸. Но нужен второй LLM-шаг, итог около 1,66 ₸ за чек. Нужен взрослый с картой, а `curl` к документации упирается в капчу. Страницы я читал обычным браузером, капчу не обходил.
- **Qwen через OpenRouter.** Самый дешёвый: `qwen/qwen3.7-flash` стоит ~0,07 ₸ за чек. Но у этой модели нет `structured_outputs`, бесплатного VL-варианта нет, а OpenRouter требует 18+. Качество на наших чеках: нет данных.

---

## 2. Рекомендация

### Основной вариант: OpenAI `gpt-6-luna`

- **Endpoint:** `POST https://api.openai.com/v1/responses`, заголовок `Authorization: Bearer $OPENAI_API_KEY` ([vision](https://developers.openai.com/api/docs/guides/images-vision.md)).
- **Картинка:** `{"type":"input_image","image_url":"data:image/jpeg;base64,...","detail":"high"}`. Для мелкого текста можно `"original"`, но тогда больше токенов ([vision](https://developers.openai.com/api/docs/guides/images-vision.md)).
- **JSON:** `"text": {"format": {"type":"json_schema","name":"receipt","strict":true,"schema":{...}}}` ([structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs.md)).
- **Reasoning:** `"reasoning": {"effort": "none"}`. По умолчанию `medium`, и тогда выходных токенов больше ([model page](https://developers.openai.com/api/docs/models/gpt-6-luna.md)).
- Тот же `gpt-6-luna` на текстовом шаге.
- ⚠️ Реальное число токенов картинки проверить по `usage.input_tokens` в первом ответе.

### Запасной вариант: Mistral `mistral-ocr-4-1` + `mistral-small-2603`

- **OCR и JSON:** `POST https://api.mistral.ai/v1/ocr`, заголовок `Authorization: Bearer $MISTRAL_API_KEY`. Тело: `{"model":"mistral-ocr-4-1","document":{"type":"image_url","image_url":"data:image/jpeg;base64,..."},"document_annotation_format":{"type":"json_schema","json_schema":{...}}}` ([annotations](https://docs.mistral.ai/studio/document-processing/annotations.md), [basic OCR](https://docs.mistral.ai/studio/document-processing/basic_ocr.md)).
- **Текстовый шаг:** `mistral-small-2603` ($0,15 / $0,6 за 1M ([pricing](https://docs.mistral.ai/inference/pricing.md))).
- Подешевле: `mistral-ocr-2512` за $3 за 1000 страниц с аннотацией ([pricing](https://docs.mistral.ai/inference/pricing.md)).

### Что сделать пользователю

1. **OpenAI:** ключ создаётся на [platform.openai.com/api-keys](https://platform.openai.com/api-keys) после входа. Пополнение на $5 в Billing переводит аккаунт на уровень Build ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits.md)). **Карта нужна**, лучше карта родителя и с его разрешения: этого требуют ToU для тех, кому меньше 18 ([terms](https://openai.com/policies/row-terms-of-use/)).
2. **Mistral:** аккаунт в Mistral Studio (Free plan ([pricing](https://mistral.ai/pricing))) и ключ в разделе API keys ([docs](https://docs.mistral.ai/admin/identity-access/api-keys.md)). Карта нужна, только если не хватит Free plan. Разрешение родителя нужно ([terms](https://legal.mistral.ai/terms/row-consumer-terms)).
3. Ключи хранить только на сервере (env), не во фронтенде.

### Стоимость на 100 и 1000 чеков (оба шага)

| Вариант | 1 чек | 100 чеков | 1000 чеков |
|---|---|---|---|
| **`gpt-6-luna` (основной)** | $0,00106 / 0,47 ₸ | **$0,11 / 47 ₸** | **$1,06 / 473 ₸** (плюс минимальная предоплата $5 ≈ 2 222 ₸) |
| **`mistral-ocr-4-1` + `mistral-small-2603` (запасной)** | $0,00554 / 2,46 ₸ | **$0,55 / 246 ₸** | **$5,54 / 2 461 ₸** |
| `mistral-ocr-2512` + small | $0,00354 / 1,57 ₸ | $0,35 / 157 ₸ | $3,54 / 1 573 ₸ |
| `gemini-3.5-flash-lite` (платно) | $0,00405 / 1,80 ₸ | $0,40 / 180 ₸ | $4,05 / 1 798 ₸ (на бесплатном уровне 0) |
| `claude-haiku-5-5` | $0,00109 / 0,48 ₸ | $0,11 / 48 ₸ | $1,09 / 484 ₸ |
| Yandex OCR + Alice AI LLM Flash | ~2,66 ₸ | 266 ₸ | 2 660 ₸ (с НДС) |

Цены взяты из таблицы §1.1, курс 444,30 ₸ ([НБРК](https://www.nationalbank.kz/rss/get_rates.cfm?fdate=16.11.2026)). Расчёт без учёта retry и размышлений.

---

## 3. Путь без AI: фискальный QR (часть B)

### Что видно из открытых страниц

| ОФД | Страница проверки | Что удалось выяснить |
|---|---|---|
| Казахтелеком | [consumer.oofd.kz](https://consumer.oofd.kz/) | Страница принимает query-параметры `f, i, s, t`. В JS: `f` — РНМ кассы, `i` — фискальный признак, `s` — сумма, `t` — дата и время в виде `YYYYMMDDTHHMM…`. Для QR-ссылки фронт вызывает `GET /api/consumer-proxy/api/tickets/get-by-url?f=&i=&s=&t=` без токена капчи. Без параметров ответ `400 {"code":"MISSING_REQUIRED_PARAMETERS"}`. Ручная форма требует reCAPTCHA (`recaptchaToken`). На preflight с чужим Origin приходит `403 Invalid CORS request`, заголовка `Access-Control-Allow-Origin` нет. На странице стоит `noindex`. ⚠️ Формат ответа с позициями без настоящего чека не проверен |
| kOFD (QMobile, бывший Jusan Mobile) | [kofd.kz](https://kofd.kz/) → [cabinet.kofd.kz/consumer](https://cabinet.kofd.kz/consumer) | Фронт вызывает `GET https://cabinet.kofd.kz/api/tickets?registrationNumber=&ticketNumber=&ticketDate=YYYY-MM-DD`. В ответе JSON с `data.ticket`, `data.ticketUrl`, `data.found`. Без авторизации: на пустой запрос `200 {"error":{"code":5,"text":"Касса не найдена"}}`. Капчи в коде страницы не нашёл, CORS-заголовков нет |
| Транстелеком | [ofd1.kz](https://ofd1.kz/) → `ofd.ttc.kz`, форма [/check_ticket](https://ofd1.kz/check_ticket) | HTML-форма `POST /show_ticket` с CSRF-токеном и cookie, поля `date`, `state_number`, `fiscal_mark`. Капчи в HTML нет |
| Beeline ОФД | [ofd.beeline.kz/check_ticket](https://ofd.beeline.kz/check_ticket) | Такая же HTML-форма с CSRF-токеном и полями `date`, `state_number`, `fiscal_mark`. Капчи в HTML нет |

- **Сколько всего ОФД.** Официальный список в КГД сегодня найти не удалось: старые адреса `kgd.gov.kz/ru/content/...` перенаправляют на главную [portal.kgd.gov.kz](https://portal.kgd.gov.kz/ru/). По открытым сайтам видно как минимум 4 оператора из таблицы выше. ⚠️ Полный реестр нужно уточнить.
- **Условия использования.** Ни на одной странице проверки чека пользовательского соглашения или правил автоматического доступа не нашёл. ⚠️ Массовое автоматическое скачивание чеков нужно согласовать или ограничить единичными запросами по скану пользователя.
- **Что можно проверить только на настоящем чеке:** точный формат URL в QR у каждого ОФД, есть ли позиции товаров в ответе (JSON или HTML), лимиты частоты запросов.

### Вывод

- **Основным путём QR быть не может:** операторов несколько, у каждого свой формат, CORS закрыт, а у Казахтелекома в ручной форме капча.
- **Как быстрый бесплатный путь он подходит хорошо.** Если на чеке есть QR, мы получаем точные данные без AI, а к фото возвращаемся, если QR нет, он не читается или данные не пришли.
- **Нужен свой серверный прокси**, например Vercel/Next API route:
  1. принять распознанную ссылку из QR;
  2. проверить домен по allow-list ОФД;
  3. сделать один запрос к ОФД с сервера;
  4. разобрать JSON или HTML в общую схему позиций;
  5. кешировать результат и ограничивать частоту запросов.
- Капчу не обходить. Если ОФД требует капчу, сразу переходим на распознавание фото.

---

## 4. Что не проверено ⚠️

- Правило токенов картинки для `gpt-6-luna`: модели нет в таблицах vision-доков, взято правило gpt-6-astra/5.6-luna.
- Конкретные лимиты бесплатного уровня Gemini (видны только в AI Studio) и бесплатного API Mistral.
- Возрастной пункт оферты Yandex Cloud.
- Доступность Mistral именно из Казахстана: явного списка стран нет.
- Скорость ответа всех моделей: официальных цифр нет, указанное — оценки.
- Качество на настоящих казахстанских чеках: независимых тестов (OCRBench для кириллических чеков) не нашёл, сравнивать нужно на 10–20 своих фото.
- Ответы ОФД с позициями товаров: без настоящих параметров чека не проверял и не подбирал.

---

## 5. Что реализовано в приложении (`web`)

**Как включить.** Скопировать `web/.env.local.example` в `web/.env.local`, вписать **один** ключ (`GEMINI_API_KEY` — основной вариант для хакатона, `OPENAI_API_KEY` — для масштаба) и перезапустить dev-сервер. Провайдер определится по ключу; при нескольких ключах порядок: Gemini → OpenAI → Mistral → Anthropic → OpenRouter (или явно `SCAN_PROVIDER`). Модель меняется переменными `SCAN_VISION_MODEL` / `SCAN_TEXT_MODEL`. Без ключа — демо-режим, как раньше.

**Два шага** (`web/src/lib/scan/pipeline.ts`):
1. Фото → позиции (`name`, `qty`, `price`) строго по JSON-схеме (`model.ts`). Служебные строки (итог, НДС, оплата), скидки и отрицательные суммы отбрасываются (`parse.ts`).
2. Позиции → сахар в граммах, «вредное», замена. Текстовая модель получает подсказки локального справочника (~30 категорий: газировка, соки, сладкие йогурты, шоколад, выпечка, мороженое…, `reference.ts`). Если категория узнана и объём есть в названии, сахар считается **по справочнику**, модель только дополняет то, чего в нём нет. Если второй шаг упал — чек всё равно собирается по справочнику.

**Провайдеры** (`web/src/lib/scan/providers/`):

| Ключ | Шаг 1 | Шаг 2 | API |
|---|---|---|---|
| `OPENAI_API_KEY` | `gpt-6-luna` | `gpt-6-luna` | `POST /v1/responses`, `text.format` json_schema strict, `reasoning.effort: none`, `store: false` |
| `MISTRAL_API_KEY` | `mistral-ocr-4-1` | `mistral-small-2603` | `POST /v1/ocr` + `document_annotation_format`; `POST /v1/chat/completions` + `response_format` |
| `GEMINI_API_KEY` | `gemini-3.5-flash-lite` | то же | `generateContent`, `generationConfig.responseMimeType` + `responseJsonSchema`, `thinkingLevel: LOW` для 3.x+ |
| `ANTHROPIC_API_KEY` | `claude-haiku-5-5` | то же | официальный SDK, `output_config.format` json_schema, `effort: low` |
| `OPENROUTER_API_KEY` | `qwen/qwen3.8-flash` | то же | `chat/completions` + `response_format` json_schema |

**Безопасность и ошибки.** Ключи только в переменных окружения сервера; проверено, что ни ключей, ни адресов провайдеров нет в клиентском бандле. Фото сжимается на телефоне до 1600 px (JPEG 85%), на сервере обрабатывается в памяти и не сохраняется. Лимит 8 сканов в минуту с одного адреса. Понятные сообщения: «не чек», «не читается», «пустой чек», «слишком большое фото», «слишком много чеков подряд», «сервис недоступен».

**Пометка «приблизительно».** Распознанный чек приходит с полем `approx: true` (`web/src/lib/types.ts`); экран результата должен показать по нему, что сахар оценён приблизительно. Распознанные чеки сохраняются в истории вместе с самим чеком (поле `receipt` записи).

**Тесты:** `cd web && pnpm test` — 72 теста: корректный ответ, мусор, пустой чек, отрицательные цены, «не чек», справочник и объёмы, сборка чека, оба шага с поддельной моделью, ошибки HTTP, маршрут `/api/scan` для OpenAI, Mistral и Gemini с подменённым `fetch`.

**QR-путь пока не реализован:** форматы ссылок и наличие позиций в ответах ОФД можно проверить только на настоящем чеке, а гадать параметры нельзя. Когда будет реальный чек с QR — сделать серверный прокси по §3 и пробовать его до фото.

**Что проверить с первым ключом:**
1. 10–20 своих фото чеков (мятые, длинные, с казахским текстом): правильно ли читаются названия и суммы.
2. `usage.input_tokens` в первом ответе OpenAI — сходится ли с оценкой ~2900 токенов за картинку (§4).
3. Время ответа: если дольше ~8 с, сравнить с Mistral или Gemini через `SCAN_PROVIDER`.
