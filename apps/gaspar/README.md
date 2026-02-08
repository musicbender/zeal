# Gaspar

Fastify REST API for smart home sensor management.

## Getting Started

```bash
pnpm run dev
```

Server runs at [localhost:3000](http://localhost:3000).

## API Endpoints

- `GET /` — Health check
- `GET /health` — Health route
- `POST /sensors` — Create sensor
- `GET /sensors` — List all sensors
- `GET /sensors/:id` — Get sensor
- `PATCH /sensors/:id` — Update sensor
- `DELETE /sensors/:id` — Delete sensor
