---
title: Local infrastructure
module: platform
kind: reference
audience: [developer]
---

# Local infrastructure

Everything the apps need locally runs in Docker, defined in [compose.yaml](../../../compose.yaml). All ports are bound to `127.0.0.1`; credentials are development defaults and can be overridden by copying [.env.example](../../../.env.example) to `.env`.

## Services

| Service             | URL / address                                                                     | Login                                                                                  | Used by                                                    |
| ------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| PostgreSQL 17       | `localhost:5433`, database `flower`                                               | `flower` / `flower`                                                                    | API: all data, outbox                                      |
| pgAdmin 9           | http://localhost:5051                                                             | none — opens directly, the database is already connected                               | Developers                                                 |
| Redis 8             | `localhost:6379`                                                                  | —                                                                                      | Sessions and login limits (identity), delayed jobs (later) |
| S3 storage (RustFS) | API `http://localhost:9000`, console http://localhost:9001, bucket `flower-media` | `flower` / `flower-secret`                                                             | Product media (CAT-05)                                     |
| Prometheus 3        | http://localhost:9090                                                             | —                                                                                      | Metrics: scrapes API :3001 and worker :9464                |
| Grafana 13          | http://localhost:3030                                                             | `admin` / `admin`, Prometheus data source and the API overview dashboard preconfigured | Dashboards ([Observability](observability.md))             |
| Jaeger 2            | UI http://localhost:16686, OTLP/HTTP `localhost:4318`                             | —                                                                                      | Traces ([Observability](observability.md))                 |

## Commands

| Command                  | What it does                                    |
| ------------------------ | ----------------------------------------------- |
| `pnpm infra:up`          | Starts all services and waits for health checks |
| `pnpm infra:down`        | Stops services, keeps data                      |
| `pnpm infra:logs`        | Follows logs of all services                    |
| `docker compose down -v` | Stops services and **deletes all local data**   |

## Notes

- **PostgreSQL uses host port 5433** so it can run next to another local PostgreSQL on 5432.
- **pgAdmin** runs in desktop mode without its own login. Its entrypoint writes a `pgpass` file and `servers.json` from the compose variables, so the server is registered and never asks for a password. Safe only because the port is local; never expose it.
- **Redis** runs with `maxmemory-policy noeviction` and AOF persistence, as BullMQ requires.
- **S3** is RustFS (ADR-11): the MinIO image is no longer published on Docker Hub. The `s3-init` service creates the bucket with the AWS CLI and exits; `Exited (0)` is expected.
- **Prometheus** scrapes the apps on the host through `host.docker.internal` (API `:3001`, worker `:9464`); a target is DOWN while its process is not running. Config: [infra/prometheus/prometheus.yml](../../../infra/prometheus/prometheus.yml).
- **Grafana** data source and dashboards are provisioned from [infra/grafana/](../../../infra/grafana/) and are read-only in the UI.
- **Jaeger** keeps traces in memory; they are gone after a restart. It is not a Grafana data source: Grafana 13.2's Jaeger plugin still calls the `/api` endpoints that Jaeger 2.23 no longer serves (see the [journal](journal.md)).
- Image versions are pinned; update them deliberately.
