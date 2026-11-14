# Bundled fonts

Downloaded from Google Fonts on 14 November 2026 as normal-style variable WOFF2
files. Each family includes every Unicode subset supplied by Google; browsers
request only the subsets needed for the displayed text.

| Family | Use | Weights | Source |
| --- | --- | --- | --- |
| Inter | General text | 100–900 | https://fonts.google.com/specimen/Inter |
| Source Serif 4 | Logo, replacing Georgia | 200–900 | https://fonts.google.com/specimen/Source+Serif+4 |
| Roboto Mono | Request references, replacing system monospace | 100–700 | https://fonts.google.com/specimen/Roboto+Mono |

Stylesheets used for the download:

- https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap
- https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@100..700&family=Source+Serif+4:wght@200..900&display=swap

`fonts.css` preserves Google's weight ranges, Unicode ranges and swap behavior,
with every source URL changed to a relative checked-in file. No `local()` sources
are used. These URLs are provenance only; no build or browser fetches them.
The SIL Open Font License for each family is included in `public/fonts/`.
