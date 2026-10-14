# Development guide

Scholar Rank is a Manifest V3 Chrome/Edge extension built with plain JavaScript, HTML and CSS. The interface, documentation and tool output are in English. Original publication titles and source-language parser keys remain unchanged so multilingual source data can still be matched accurately.

## Project structure

| File or directory | Responsibility |
| --- | --- |
| `manifest.json` | Extension entry points, supported sites and permissions |
| `src/lib/settings.js` | Shared settings, styles, size scaling and Chrome sync storage |
| `src/lib/normalize.js` | Venue classification, normalization and candidate generation |
| `src/lib/ranking.js` | CCF/CORE/journal indexes, aliases and badge descriptions |
| `src/lib/stats.js` | Author-name recognition, summaries and filters |
| `src/content/scholar.js` | Page annotation, profile statistics and automatic publication loading |
| `src/content/badges.css` | Compact badge styles and the statistics panel |
| `src/options/` | Full settings page and venue matching probe |
| `src/popup/` | Toolbar popup and appearance preview |
| `src/data/ccf.json` / `core.json` | Bundled conference directories; CCF also includes journals |
| `src/data/journals.json` | Merged journal metrics and original source identities |
| `src/data/aliases.json` | Curated conference spellings and selected journal display names |
| `tools/` | Source-data builders, regression checks, packaging and local previews |
| `test/` | Offline Scholar fixtures, citation responses and a Chrome API shim |

Browser helpers expose `SRSettings`, `SRNorm`, `SRRanking` and `SRStats` on `globalThis`. Node tools reuse the same helpers, keeping lookup keys consistent with build-time normalization.

## Venue matching

1. Classify preprints, theses and patents before attempting rankings.
2. Remove volume/issue/page suffixes, conference wrappers and year prefixes. Extract explicit acronyms and generate full-name candidates.
3. Normalize punctuation, common abbreviations and stopwords using the same code as the data builders.
4. Match conference names exactly before trying acronyms. For journals, use exact normalized names and curated aliases.
5. For truncated names, accept only unique prefix or interior-fragment matches. Interior fragments preserve word order and check ambiguity across CCF, CORE and journal data. Never guess from a shared fragment such as “on Image Processing”.
6. Compare conference titles without edition numbers, spelled-out ordinals or publisher tokens, retaining every candidate to detect collisions. Untruncated fuzzy matches require containment of at least 0.85, Jaccard similarity of at least 0.65 and a margin of at least 0.08 over competing conferences.

Secondary tracks such as workshops, Findings and companion proceedings do not inherit a main conference ranking. Independently listed workshops remain supported.

Search-result venues that are truncated and unmatched can optionally be completed using Scholar’s citation response. Truncated conference sources in profiles use the linked same-origin publication details instead, even when a shorter title already matches, because a hidden suffix may identify workshops or a different conference; both current standalone and modal detail layouts are supported. Resolved profile sources also update statistics. If the details cannot be validated, the row receives no inferred venue ranking. Requests are sequential, separated by 400 ms and cached in `sessionStorage`. If Scholar blocks the response, further requests stop for that page. A retrieved title must agree with the truncated text before it is used.

## Maintaining aliases and names

`aliases.json` includes:

- `names`: full-name variants mapped to CCF acronyms. Use an object with `abbr` and `name` when an acronym is ambiguous, such as software-engineering FSE versus Fast Software Encryption.
- `acronyms`: alternate CCF acronym spellings.
- `ccfToCore`: conversions between directory spellings, such as SIGKDD to KDD.
- `coreNames`: name variants specific to CORE.
- `missingAcronyms`: corrections for blank source acronyms, currently including WHC.
- `displayAcronyms`: canonical short labels for recognized conferences.
- `extraConferences`: verified names absent from the bundled directories. These produce a name label only; no ranking is invented.
- `journalNames`: selected journal names/acronyms with exact accepted aliases and optional source links.

Journal names appear first, followed by JCR, CAS, IF and TOP status. A selected name must resolve to a bundled journal identity. Do not add broad aliases that could conflate related journals; PNAS Nexus must remain distinct from PNAS, and Nature Communications from Nature. The journal-name switch hides the name badge without hiding metrics.

## Appearance and settings

The default **Clean** style uses an emphasized venue name and compact 10.5 px metrics separated by dots. The badge reads `CAS 1` through `CAS 4`; its tooltip retains the broad category and source details. Alternative styles are defined by `.sr-theme-*` rules and listed in `SRSettings.THEMES`.

Use `SRSettings.applyBadgeScale()` on badge containers. Scholar pages, settings previews and the popup share the same scaling behavior. Settings persist in `chrome.storage.sync`; supported changes clear and redraw the injected badges and statistics panel.

Custom group tags, extra journal badge families and subcategory badges have been removed. Their legacy saved switches do not re-enable them.

## Profile statistics

Statistics cover currently loaded profile rows. CCF journal matching metadata remains available for summaries even though journal CCF badges are not displayed. Category filters hide nonmatching rows; totals continue to describe all loaded rows.

First-author recognition combines the profile name, parenthetical aliases and configured aliases. It supports initial/surname matching and consecutive marked co-first authors. This is a name heuristic, not a unique author identifier.

“Load all publications” clicks Scholar’s existing “Show more” control, waits for row growth and refreshes annotations. It supports cancellation, timeouts and a limit of 200 pages per run.

## Checks and previews

```sh
npm test
npm run probe -- "Nat. Commun."
npm run serve
npm run package
```

`tools/selftest.mjs` covers positive matches, forbidden matches, truncation, page bylines and author/statistics logic. `tools/conference-selftest.mjs` covers real conference editions, source aliases, collisions and track exclusions. The browser fixture `test/conferences.html` covers profile detail completion, unrelated-response rejection, both detail layouts and stopping the request queue after a blocked response. `tools/english-selftest.mjs` covers display defaults, journal identities, acronym aliases, English labels, removed options and tooltips. Add realistic positive and negative cases after changing matching logic or aliases.

Local preview URLs:

- `http://localhost:8123/test/fixture.html?theme=soft`
- `http://localhost:8123/test/conferences.html`
- `http://localhost:8123/src/options/options.html?shim=1`
- `http://localhost:8123/src/popup/popup.html?shim=1`

The shim substitutes localStorage for Chrome storage and is used only in previews. Query parameters `theme`, `bold`, `scale` and `bare` control fixture appearance. Citation fixtures simulate Scholar responses for truncated-name tests.

## Refreshing data

```sh
npm run build:ccf
npm run build:core
npm run build:journals
npm run build
```

The CCF builder fills missing source acronyms from curated corrections and writes English field labels. CORE uses the portal’s export endpoint; `CORE_SOURCE` selects another source version. The journal builder caches raw downloads under `tools/.cache/` and converts CAS broad-category metadata through `tools/cas-data.mjs`.

Do not silently refresh the bundled data while changing display styles. Dataset versions are reported in Settings. Source-language headers, localized Scholar selectors and original publication names are intentional input compatibility, not translated interface text.

## Browser installation

For active development, open `chrome://extensions/`, enable Developer mode and use **Load unpacked** with the repository folder containing `manifest.json`. Reload the extension and refresh Scholar after editing runtime files.

`npm run package` produces a clean unpacked folder and ZIP under `dist/`, containing only extension runtime files. Extract the ZIP before loading it. Browser deployment is separate from pushing source changes to GitHub.
