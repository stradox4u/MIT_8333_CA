# Repository guidance

## Concise writing

- Keep code comments, review comments, and PR/MR comments to 1–2 short sentences focused on the reason, issue, or action.
- Write PR/MR descriptions as 1–2 short sentences explaining what changed and why, followed by one `Tests:` line. Target 60 words or fewer.
- Include only details a reviewer needs to assess the change; link to supporting context when useful.
- Expand only when explicitly requested or necessary to explain a material risk, migration, or breaking change.

## Client styling

- For every client UI change, use Tailwind utilities and shared theme tokens in Vue components. Reserve shared CSS for theme definitions, base styles, and complex effects.
- Resolve all Tailwind IntelliSense `suggestCanonicalClasses` diagnostics before completion (for example, `gap-2.5` and `aria-invalid:border-error`). Keep arbitrary values only when no canonical equivalent preserves the design.
- Use complete literal class names in variant maps so Tailwind can discover every state.
- Capture desktop and mobile baselines before styling changes and compare afterward. Preserve the agreed preview's colors, spacing, and responsive behavior; run the client integration tests, browser tests, and production build before handing off.

## Agent skills

### Issue tracker

Work tracking is disabled. See `docs/agents/issue-tracker.md`.

### Domain docs

Before exploring or changing a feature, read its relevant client/server
docs and ADRs. See `docs/agents/domain.md`.
