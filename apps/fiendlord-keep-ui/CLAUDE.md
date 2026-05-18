# Fiendlord Keep UI

Next.js homelab dashboard running on the Raspberry Pi (port 3002). Displays live service health and system stats for all Pi-hosted services. Built with Radix UI Themes.

## Commands

```bash
pnpm --filter fiendlord-keep-ui dev    # Dev server with Turbopack on port 3002
pnpm --filter fiendlord-keep-ui build  # Production build
pnpm --filter fiendlord-keep-ui test   # Unit tests (vitest)
```

## Structure

```
app/
  layout.tsx          # Root layout — wraps in Radix <Theme> provider
  page.tsx            # Home — service health grid + magus stats
  logs/               # Log viewer page
  magus-stats/        # System stats page
  gaspar/             # Embedded gaspar sunkeep dashboard
  api/                # API routes (proxy to Pi services)
  services/           # Per-service page sections
lib/
  config.ts           # getApiBaseUrl() — resolves base URL for Pi API calls
  services.ts         # SERVICE_REGISTRY — defines all monitored services
  format.ts           # Formatting utilities
  sidebar-store.ts    # Sidebar UI state
components/
  service-card/       # Health card for a single service
  magus-stats-poller/ # Client component that polls for system stats
```

## Adding a New Service to the Dashboard

Add an entry to `SERVICE_REGISTRY` in `lib/services.ts`:

```ts
import type { ServiceConfig } from '@repo/magus-data';

// Add to the SERVICE_REGISTRY array:
{
  name: 'my-service',          // kebab-case identifier used in routing
  displayName: 'My Service',   // shown in the UI
  port: 3003,                  // optional — used for health check ping
  systemdUnit: 'my-service',   // systemd unit name for status checks
  color: 'blue',               // Radix UI color token
  subPages: [],                // optional: [{ name: 'slug', displayName: 'Label' }]
}
```

Available Radix color tokens: `teal`, `purple`, `orange`, `gray`, `blue`, `green`, `red`, `yellow`, `indigo`, `cyan`.

## Key Dependencies

- **Radix UI Themes** (`@radix-ui/themes`) — primary UI library. Use Radix theme tokens for color and spacing rather than custom CSS where possible.
- **`@repo/magus-data`** — types: `MagusStats`, `ServiceHealth`, `ServiceConfig`
- **`@repo/ui`** — shared primitive components (Button, Card, Code)

## Environment Variables

| Var                        | Description                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL for Pi API calls. Set to Pi address in prod; defaults to localhost in dev. |
