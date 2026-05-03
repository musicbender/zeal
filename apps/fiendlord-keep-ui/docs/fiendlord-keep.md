# Fiendlord Keep Dashboard

## 1. Overview

Fiendlord Keep is a Next.js dashboard running on the Raspberry Pi named Magus. It provides real-time visibility into the health and performance of all services running on the system, along with comprehensive system metrics and service logs.

The dashboard serves as the central observability hub for the zeal ecosystem, displaying CPU usage, memory consumption, temperature, disk space, and individual service health status. It runs on port 3002 and is part of the `apps/fiendlord-keep-ui` directory within the zeal monorepo.

## 2. Architecture

The dashboard uses a client-server architecture where server components fetch data from multiple sources at render time:

```
fiendlord-keep-ui (Next.js, port 3002)
  ├── /api/magus-stats         → systeminformation (reads from OS directly)
  ├── /api/logs/[service]      → journalctl -u <service> --output json
  ├── /api/services/[name]     → proxies to each service's /health endpoint
  │     ├── gaspar             → http://localhost:3000/health
  │     ├── worfbot-gateway    → http://localhost:3001/health
  │     ├── homebridge         → http://localhost:8581 (bearer token)
  │     └── github-runner      → systemctl list-units (systemd check)
  └── Server components fetch all data at render time
```

### Key Implementation Details

- **Log Storage**: The dashboard does not maintain custom log storage. Instead, it queries systemd's journald, which handles log rotation automatically.
- **Async Execution**: All shell commands use the `execFile` function to ensure non-blocking, asynchronous execution. This prevents long-running processes from blocking the event loop.

## 3. Pages

- **`/`** — Home: Displays system statistics (CPU, memory, temperature, disk usage) alongside health status cards for all monitored services.
- **`/services/[service]`** — Service Detail: Shows detailed information for a specific service, including current status, uptime visualization, and recent log entries.
- **`/logs/[service]`** — Log Viewer: Full log history for a service with filtering by log level and automatic refresh capabilities.

## 4. Monitored Services

| Service         | Display Name    | Port | Systemd Unit    | Health Check                |
| --------------- | --------------- | ---- | --------------- | --------------------------- |
| gaspar          | Gaspar          | 3000 | gaspar          | HTTP /health                |
| worfbot-gateway | Worfbot Gateway | 3001 | worfbot-gateway | HTTP /health                |
| homebridge      | Homebridge      | 8581 | homebridge      | HTTP /health (bearer token) |
| github-runner   | GitHub Runner   | —    | actions.runner  | systemctl list-units        |

## 5. Environment Variables

| Variable             | Required | Default                 | Description                                                                                               |
| -------------------- | -------- | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `API_BASE_URL`       | No       | `http://localhost:3002` | Base URL for server-side API calls. Set this when deploying in front of a reverse proxy or in production. |
| `HOMEBRIDGE_API_KEY` | No       | —                       | Bearer token for authenticating requests to the homebridge-config-ui-x API                                |

## 6. Running on Magus

### Development

Start the dashboard in development mode:

```bash
pnpm --filter fiendlord-keep-ui dev
```

The dashboard will be available at `http://localhost:3002`.

### Production Build

Build and run the dashboard for production:

```bash
pnpm --filter fiendlord-keep-ui build
pnpm --filter fiendlord-keep-ui start
```

### Systemd Service Setup

Create a systemd service file at `/etc/systemd/system/fiendlord-keep.service`:

```ini
[Unit]
Description=Fiendlord Keep Dashboard
After=network.target

[Service]
Type=simple
User=magus
WorkingDirectory=/home/magus/apps/actions-runner/_work/zeal/zeal/apps/fiendlord-keep-ui
EnvironmentFile=/etc/fiendlord-keep/env
Environment=NODE_ENV=production
Environment=PORT=3002
Environment=HOSTNAME=0.0.0.0
ExecStart=/usr/bin/node ./node_modules/next/dist/bin/next start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Create the env file directory before first deploy:

```bash
sudo mkdir -p /etc/fiendlord-keep
sudo touch /etc/fiendlord-keep/env
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable fiendlord-keep
sudo systemctl start fiendlord-keep
```

## 7. Adding a New Service

To monitor an additional service:

1. Add an entry to the `SERVICE_REGISTRY` in `lib/services.ts` with the following properties:
   - `name`: Unique identifier for the service
   - `displayName`: Human-readable name for the UI
   - `port`: Port number (if HTTP-based; optional for systemd-only services)
   - `systemdUnit`: Name of the systemd unit to monitor
   - `color`: Color for the service card in the UI

2. Ensure the service exposes a `GET /health` endpoint that returns a JSON response like `{ status: 'ok' }` (only required for HTTP-based health checks).

3. The dashboard will automatically detect the new service and include it in:
   - The home page service grid
   - The sidebar navigation
   - The logs section

## 8. Phase Roadmap

| Phase | Status      | Scope                                                                 |
| ----- | ----------- | --------------------------------------------------------------------- |
| 1     | ✅ Complete | Scaffold, system stats, service health overview, log viewer           |
| 2     | Planned     | Individual service detail pages with richer per-service data          |
| 3     | Planned     | Gaspar sensor/exercise/solar visualizations with charts               |
| 4     | Planned     | Alerting — push notifications (ntfy.sh or similar) on health failures |
