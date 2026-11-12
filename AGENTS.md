# AGENTS.md — ROMA Lab website maintenance rules

This file tells any AI agent (or human) how to safely edit this repository.
Read it before making changes. It is the single source of truth for conventions.

## What this repo is

Static site for ROMA Lab, deployed by GitHub Pages from `main`.
No build step, no framework, no package manager. Edit files → commit → push → Pages redeploys in ~1 minute.

Live at: https://roma-ai-lab.site and https://roma-ai-lab.github.io

## Where content lives

| Edit this | To change |
| --- | --- |
| `data/news.json` | News items on home + news page |
| `data/people.json` + `content/people/<slug>.md` | Members (JSON drives cards; md is an optional long bio) |
| `data/projects.json` + `content/projects/<slug>.md` | Projects |
| `data/publications.bib` | Publications (BibTeX) |
| `data/gallery*.json`, `data/videos.json`, `data/reputation.json` | Media, videos, peer quotes |
| `data/settings.json` | Manual link, news visibility, cutoff |
| `index.html`, `pages/*.html`, `css/styles.css`, `js/main.js`, `pages/pages.js` | Layout, styles, rendering |

## Hard constraints

1. **`manual/` must be kept.** It holds the archived 2025 handbook static pages. Do not delete.
2. **`content/` must not be deleted.** Member and project detail pages depend on it.
3. **`quiz/` is a separate sub-system.** Any change there needs its own review; never touch it as part of an unrelated edit.
4. **New public pages** require adding the URL to `sitemap.xml` and setting `canonical` + `og:*` meta tags.
5. **Images**: prefer `.avif` for display assets. Gallery thumbnails should be 520px wide (`sips --resampleWidth 520`).
6. **Privacy**: this is a public repo. Never add student grades, phone numbers, internal documents, meeting notes, or any content from the lab's private Notion space. Only publish what the member agreed to make public.

## Member data conventions (`data/people.json`)

- `slug` must be unique, lowercase, hyphenated, and stable (it is the URL: `pages/person.html?slug=<slug>`). Never change an existing slug — it breaks links.
- `status` values in use: `lead`, `student`, `ra`, `partner`, `sc`. Filters and grouping rely on these.
- `role` must stay short enough for one line on a card. Put extra detail in `education`, not in `role`. Example: `Undergraduate Researcher`, not `Undergraduate Researcher (Some Long College Name)`.
- `affiliation` shows the education path, using short codes: e.g. `UCL → SEU`, `CSU → SEU`. If the latest prior education is also Southeast University, write `Southeast University` alone.
- `avatar`: empty string renders a placeholder block. Do not invent a path — a missing file shows a broken image.
- Field order used across entries: `name, slug, role, email, site, avatar, topics, affiliation, status, education, selected_publications, awards, placement`.
- Arrays are written inline when short: `"topics": ["A","B","C"]`.

## Editing workflow

```bash
cd <repo>
git pull --ff-only origin main

# make changes...

python3 -c "import json,glob; [json.load(open(f)) for f in glob.glob('data/*.json')]"   # validate JSON
node --check js/main.js && node --check pages/pages.js                                   # validate JS if touched

python3 -m http.server 8000        # then open http://localhost:8000
# pages use fetch() for data; opening .html via file:// will NOT work

git add -A && git commit -m "<concise message>" && git push origin main
```

After pushing, verify the deployed files, not just the push result:

```bash
curl -s --compressed "https://roma-ai-lab.site/data/people.json?ts=$(date +%s)" | head -c 200
```

Use `--compressed` — the CDN may return gzip and raw `curl` output will fail to parse. CDN caches for a minute or two; ask the user to hard-refresh (Cmd/Ctrl+Shift+R) when checking visuals.

## Git and credentials

- `git config http.version HTTP/1.1` is required in this clone; HTTP/2 pushes have failed here before.
- Credentials live in the OS keychain. Never write tokens into any file in this repo.
- Use a fine-grained PAT scoped to this single repository (`Contents: read and write`), never a classic token.
- Only one session should push at a time. If two agents work on this repo concurrently, pull before committing and resolve conflicts rather than force-pushing.

## Rendering notes

- `js/main.js` renders the home page; `pages/pages.js` renders the standalone pages. Member cards are rendered by `personCardHome()` and `personCard()` — keep the two in sync when changing card markup.
- Home member grid (`.v-scroll`) is capped at 520px and scrolls internally, so adding members does not stretch the page.
- The home news panel height follows the left hero column (`fitHomeNewsToHero()`), clipped with a bottom fade. Do not reintroduce a fixed item count.
- Member cards show Email/Profile as small icon buttons next to the name (`ICON_MAIL`, `ICON_PERSON`). Do not move them back to a bottom action row — it made card bottoms uneven.

## What "done" means

1. JSON/JS validated.
2. Previewed locally over HTTP (not `file://`).
3. Committed with a message that says what changed and why.
4. Pushed to `main`.
5. Deployed files verified via curl with a cache-busting query string.
