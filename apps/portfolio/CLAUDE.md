# Portfolio

Next.js app deployed to Vercel at patjacobs.com. Personal portfolio with Hygraph CMS for content. Also hosts the one-time Tesla OAuth callback endpoint used during initial Fleet API setup.

## Commands

```bash
pnpm --filter portfolio dev    # Pulls env from Vercel then starts next dev --turbopack
pnpm --filter portfolio build  # Production build
pnpm --filter portfolio test   # Unit tests (vitest)
```

## Structure

```
app/
  layout.tsx          # Root layout
  page.tsx            # Home page (server component)
  home-page.tsx       # Home page content
  projects/           # Projects section
  tesla/              # Tesla integration display pages
  actions/            # Server actions
  api/
    tesla/
      callback/       # Tesla OAuth callback — one-time setup endpoint
globals.css
```

## Deployment

Push to `main` triggers automatic Vercel deployment — no manual step needed.

Environment variables are managed via `vercel env` CLI or the Vercel dashboard. The dev script (`scripts/pull-env.sh`) pulls them locally before starting the dev server.

## Content

All editorial content comes from Hygraph CMS via `@repo/remote-data/src/hygraph.ts`. There are no local content files.

## Tesla OAuth Callback

`app/api/tesla/callback/` handles the one-time OAuth redirect during initial Fleet API setup. This is a static, rarely-touched endpoint. Do not modify without reading the `tesla-fleet-api` skill first.

## Key Dependencies

- **`@repo/remote-data`** — Hygraph CMS client (server-only)
- **`@repo/portfolio-data`** — Portfolio-specific data types
- **`@repo/worfbot`** — Worf quotes used on the site
- **`@flags-sdk/vercel`** — Feature flags
- **`@radix-ui/themes`** — UI components
