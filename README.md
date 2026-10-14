# Scholar Rank

English edition · Version 1.2.0

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
