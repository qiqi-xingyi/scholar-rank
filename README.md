# Scholar Rank

English edition · Version 1.3.0

A Chrome / Edge extension that displays journal metrics and conference rankings directly on Google Scholar. The extension interface, badges, tooltips, settings and statistics are in English.

Open the [local preview](http://localhost:8123/test/fixture.html) after starting `npm run serve`.

## Default badges

| Publication type | Displayed information |
| --- | --- |
| Journal | Name or acronym for selected journals, JCR quartile (Q1–Q4), CAS broad-category tier (1–4), impact factor, and CAS TOP / Non-TOP status |
| Conference | Conference acronym, CCF ranking (A/B/C), and CORE ranking (A*/A/B/C or a supported Australasian tier) |
| Preprint | Preprint server label, without journal or conference rankings |

For example, CVPR displays `CVPR`, `CCF A`, and `CORE A*`. A journal can display `TIFS`, `JCR Q1`, `CAS 1`, `IF 8.7`, and `TOP`.

Only available data is displayed. An absent TOP status is not interpreted as Non-TOP. CAS tiers and JCR quartiles are separate classification systems. Subcategory badges and custom group tags have been removed.

Conference recognition includes publisher-prefixed and historical spellings such as `IEEE S&P`, `MM`, `ESEC/FSE` and `USENIX ATC`. [COLM](https://colm.cc/Conferences/2025) and [RSS](https://roboticsconference.org/2025/) can display their names when absent from the bundled ranking directories; no CCF or CORE tier is inferred. [WHC](https://2025.worldhaptics.org/) fills a missing CCF source acronym.

Selected journals display their name or acronym before their metrics: Nature, Science, Cell, Nat. Commun., Sci. Adv., PNAS, JMLR, TPAMI, TIFS, TIP, TKDE, TOG and IJCV. Full names and curated shortened venue spellings are recognized. The optional **Journal name / acronym** switch hides the name badge without affecting metrics. The list is maintained in `src/data/aliases.json` under `journalNames`; unrelated publications such as PNAS Nexus and national-academy journals from other countries do not inherit the PNAS label.

The extension covers profile publication lists, search results, cited-by lists, related articles, and publication details. Newly loaded publications are annotated automatically.

## Installation

1. Clone or download and extract this repository.
2. Open `chrome://extensions/` or `edge://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the repository folder containing `manifest.json`.
5. Open a Google Scholar profile or search page.

The datasets are already included; no dependency installation or data build is required. `npm run package` creates a distributable ZIP and a clean unpacked folder under `dist/`. After editing the code, reload the extension from the extensions page, then refresh Scholar.

## Settings and statistics

Click the extension icon to enable or disable Scholar Rank, choose a theme, or open **Settings**. Settings include badge visibility, six appearance styles, font size, bold text, author aliases, and a venue matching test.

The badge list is limited to the journal and conference metrics above. Removed options cannot be re-enabled by older saved preferences. Preprint labels and unmatched-venue diagnostics remain available. The default Clean style emphasizes the venue name and displays compact 10.5px metrics separated by subtle dots, without colored metric boxes. CAS tiers are displayed as CAS 1–4 and TOP status as TOP / Non-TOP; full category names remain in tooltips. Alternative badge styles remain available.

Profile statistics count currently loaded publications by CCF ranking, CAS tier and first authorship. Click a category to filter the list. **Load all publications** automatically clicks Scholar’s “Show more” button and can be stopped at any time. First-author recognition uses the profile name and configured aliases, including names in parentheses and marked co-first authors.

Matching uses local bundled datasets. Optional truncated-venue resolution checks profile conference sources against Scholar’s publication details and retrieves citation formats for unmatched search results. Those requests are queued, spaced apart and cached per tab.

## Development

This project uses plain JavaScript, HTML and CSS with a Manifest V3 extension. Browser scripts expose shared helpers through `globalThis`; Node tools reuse the same matching logic.

| Location | Responsibility |
| --- | --- |
| `manifest.json` | Extension configuration and script entry points |
| `src/lib/normalize.js` | Venue normalization, candidate names and preprint detection |
| `src/lib/ranking.js` | Matching, display defaults, English field labels and badge descriptions |
| `src/lib/stats.js` | Author recognition, publication summaries and filters |
| `src/lib/settings.js` | Shared settings defaults, themes and storage |
| `src/content/scholar.js` | Scholar page annotation, statistics panel and automatic loading |
| `src/content/badges.css` | Badges, themes and statistics styles |
| `src/options/` / `src/popup/` | Settings and extension popup |
| `src/data/` | Bundled rankings, journal data and aliases |
| `tools/cas-data.mjs` | Source CSV parsing and English CAS broad-category metadata |
| `tools/build-journals.mjs` | Merged journal dataset generation |
| `test/fixture.html` | Offline Scholar page preview |

```sh
npm test                       # Matching/statistics regressions and English badge/data checks
npm run probe -- "CVPR"         # Inspect one venue
npm run serve                  # Local preview on port 8123
npm run build                  # Refresh rankings, journal data and icons
npm run package                # Clean unpacked directory and ZIP under dist/
```

Local previews:

- `http://localhost:8123/test/fixture.html`
- `http://localhost:8123/test/conferences.html`
- `http://localhost:8123/src/options/options.html?shim=1`
- `http://localhost:8123/src/popup/popup.html?shim=1`

Data-building tools cache downloads in `tools/.cache/`. To add a venue spelling, update `src/data/aliases.json`. Named alias objects can specify the intended full name when an acronym is shared. `missingAcronyms` fills absent source acronyms, `displayAcronyms` standardizes labels, and `extraConferences` adds verified names without inventing rankings. Run the tests after changing matching rules or aliases.

## Bundled data sources

| Data | Source |
| --- | --- |
| CCF recommended list 2026 | [ccf.atom.im](https://ccf.atom.im/) and [CCF](https://www.ccf.org.cn/Academic_Evaluation/By_category/) |
| CORE ICORE2026 | [CORE portal](https://portal.core.edu.au/conf-ranks/) |
| CAS tiers, JCR metrics and journal warnings 2025 | [hitfyd/ShowJCR](https://github.com/hitfyd/ShowJCR) |
| EI Compendex list 2019 | [EI source list](https://github.com/HiddenStrawberry/EI-COMPENDEX-SOURCE-LIST) |
| ABDC 2025 and AJG 2024 | [Structured ranking data](https://github.com/P-M-Ferreira/ranking/tree/main/journal-ranking-app/data) |
| ABS/AJG 2021 and FT50 | [Business journal data](https://github.com/jusi-aalto/biz-journals) |
| UTD24 | [UT Dallas](https://jsom.utdallas.edu/the-utd-top-100-business-school-research-rankings/index.php) |
| NSFC management journals | [List mirror](https://static.hhkaobo.com/upload/editor/72f47437-e6ba-4df1-8740-f48d95f519f6.pdf) |
| Nature Index 2026 | [Nature Index](https://www.nature.com/nature-index/faq) |

Data rights remain with their respective owners. Venue matching can be ambiguous; verify official records for formal evaluations. Dataset versions are listed in Settings.

[Development guide](docs/DEVELOPMENT.md)

## Local metadata backend (1.3)

Requires Node.js **22.18+** (Node 24 LTS recommended). No npm packages or database server are required.

```bash
npm run backend
```

Open [the local dashboard](http://127.0.0.1:8124/). It listens on **127.0.0.1:8124 only**. Copy its pairing token into **Extension Settings → Local backend**, enable automatic completion, then **Save & test connection**. Reload Scholar after updating the unpacked extension. Leave the backend process running while browsing. To restart it later, run the command again; cache, imports, settings and missing records survive restarts.

The extension renders bundled badges immediately. When completion is enabled, it sends publication title, displayed venue, authors, year and any DOI to the local service through its MV3 service worker. Crossref and OpenAlex identify the publication's actual source. Journal rankings are joined by validated ISSN/eISSN rather than ambiguous abbreviated names. Conference titles use the existing conference matcher, including workshop exclusions. Profile statistics use verified backend results once available. The extension continues to work from bundled data if the backend is stopped.

The backend does **not** manufacture rankings. A verified source can still lack JCR, CAS, impact factor, TOP, CCF or CORE data. The dashboard retains these records, missing fields, provider outcomes and retry controls. `partial` means a source was identified but some requested metrics are missing; `unresolved` means no sufficiently confident source; `needs_review` means competing matches; `unavailable` means both metadata providers failed. An explicit unranked conference entry counts as a known result and does not produce a letter-grade badge.

### Import a ranking edition

Choose CSV or JSON in **Import rankings**, validate and preview, then import. Download the CSV headers from the dashboard. JSON accepts an array of records or `{ "rows": [...] }`.

| Field | Journal | Conference |
| --- | --- | --- |
| `type` | `journal` | `conference` |
| `name` | Full journal name | Full conference name |
| `abbr` | Optional display abbreviation | Optional display abbreviation |
| `issn` | Valid print or electronic ISSN, including check digit | Leave empty |
| `year` | **Metric edition**, not the paper's year | Ranking edition |
| `source` | Required provenance / licensed export description | Required provenance |
| `jcr` | Q1 / Q2 / Q3 / Q4 | — |
| `cas`, `category` | Broad tier 1–4 and optional broad category | — |
| `if` | Nonnegative impact factor (0 is valid) | — |
| `top` | true/false or 1/0; empty means unknown | — |
| `ccf` | — | A / B / C |
| `core` | — | A* / A / B / C, Australasian A/B/C, National, Regional, Unranked |

At least one metric is required per row. Invalid or conflicting rows reject the entire import. The same identity/metric/edition is replaced on re-import. For linked journal identifiers, conflicting values for the same edition produce a warning and withhold metrics. Imported values take precedence over bundled values of the same or older edition; a newer bundled edition remains available. Without an edition filter, each metric uses its latest available edition, shown in its tooltip. An explicit edition only uses that edition. Bundled journal metrics are the existing 2025 snapshot, CORE is ICORE2026, and the bundled CCF edition is unspecified. No historical edition is inferred from a paper's publication year.

Imports invalidate the cache immediately; retry missing records in the dashboard and reload Scholar to refresh badges. Use data you are entitled to import. Crossref/OpenAlex metadata is not a substitute for licensed JCR/CAS editions. A CSV import is capped at 50,000 rows / approximately 7 MB in the dashboard.

### Optional DeepSeek fallback

The backend uses **`deepseek-flash`**, the current low-cost model in [DeepSeek's official pricing](https://api-docs.deepseek.com/quick_start/pricing/), with [thinking disabled](https://api-docs.deepseek.com/guides/thinking_mode/) and at most 512 output tokens. It is off until you enter a key and enable it in the dashboard. API keys stay in the private local SQLite database, never in the extension or repository. You can also set `DEEPSEEK_API_KEY`, `OPENALEX_API_KEY` and `CROSSREF_MAILTO` via the environment or a private `.env` copied from `.env.example`; nonempty environment values override saved keys on startup. Keys are retained locally and can be removed in the dashboard. If set in `.env`, remove them there as well.

After ordinary provider matching fails, the model can propose one alternate bibliographic query. Results from either provider must still pass matching against the **original** title/DOI and year/author evidence. Model-generated identifiers, ranks and impact factors are never accepted. No tools or arbitrary URL requests are granted to the model. Requests count against a persistent daily cap (default **20**, UTC), including failed attempts; token usage is recorded when returned by DeepSeek. A missing key, exhausted cap or provider failure leaves the record available for review. Model pricing/availability may change; no paid calls are made by tests.

### Storage, API and development

Private state is `.local/scholar-rank.sqlite` (SQLite WAL). Its directory is created with mode 0700 and database with mode 0600. Stop the backend before copying the database for a backup. `.local/`, `.env` and archives are ignored by Git. The extension ZIP contains only extension assets. The preview server serves only `src/`, `test/`, `icons/` and the manifest, and cannot expose backend secrets.

| File | Purpose |
| --- | --- |
| `backend/server.mjs` | Loopback HTTP API, authentication and dashboard assets |
| `backend/providers.mjs` | Crossref/OpenAlex parsing, throttling, bounded retries and evidence matching |
| `backend/resolver.mjs` | Resolution, ranking joins and optional DeepSeek fallback |
| `backend/store.mjs` | Persistent cache, missing records, imports and daily usage |
| `backend/imports.mjs` | CSV/JSON validation, ISSNs, DOI and request normalization |
| `backend/public/` | English management dashboard |
| `src/background.js` | Authenticated extension-to-localhost proxy |
| `src/lib/backend.js` | Bounded completion queue and offline backoff |
| `backend/test/` | Provider, persistence, import, agent, API and extension bridge regressions |

`npm test` includes offline backend integration tests. `npm run test:backend` runs only the backend suite. Network providers are mocked in tests; real lookups can be checked in the dashboard. Provider traffic is serialized with a minimum 1.1-second gap and bounded retry/backoff. Successful source resolutions are cached for 30 days; unresolved results for one day; provider outages for one minute. Identical concurrent requests share a single job. Import/config revisions invalidate cached resolutions. Manual retry bypasses the cache.

The API requires `X-Scholar-Token`. The extension token may only resolve publications and check health; administrative APIs require the dashboard token. Origin and Host validation prevent ordinary third-party webpages from issuing authenticated requests. Administrative tokens and provider keys are never returned to the extension. This is a local development service for a trusted machine, not an Internet-facing hosted API.
