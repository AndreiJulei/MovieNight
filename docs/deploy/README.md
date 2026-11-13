# Deployment operations

The production backend runs on Render's free web-service plan
([`render.yaml`](../../render.yaml)) against a Supabase free-tier Postgres
database (bootstrap: [`supabase-bootstrap.sql`](supabase-bootstrap.sql)).
Keep-alive and the database-size guardrail are tracked in
[#18](https://github.com/AndreiJulei/MovieNight/issues/18).

## Keeping the backend awake

Render's free plan stops the service after about 15 minutes without inbound
traffic. A cold start then takes about 30–60 s or longer. Supabase pauses a free
project after about 7 days without database activity.

| Mechanism | What it does |
| --- | --- |
| `GET /api/health` | Public and cheap. It runs `select 1` and returns `{"status":"UP"}` (200), or `{"status":"DOWN"}` (503) when the database is unreachable. |
| Self-ping (`SelfPingTask`) | Requests `MN_SELF_PING_URL` every 10 minutes, starting 1 minute after start-up. The request goes through Render's edge, so it counts as inbound traffic. A blank or invalid value disables it (local and test runs). |
| [`keep-alive.yml`](../../.github/workflows/keep-alive.yml) | Scheduled for every 10 minutes, but GitHub delays scheduled runs by hours. It is only the safety net that wakes the service after a restart or deploy. |
| Frontend | Pings `/api/health` when the app loads. A read slower than 4 s shows "Waking up the server…". If that read then fails, the app waits for the health check and retries once. |

Setup: in the Render dashboard, set `MN_SELF_PING_URL` to the service's own
public health URL, `https://movienight-backend-zye9.onrender.com/api/health`.
`render.yaml` declares the same value for Blueprint syncs. On start-up, the log
line `Self-ping enabled every 10 minutes` confirms it is active.

One service running all month uses about 744 of the 750 free instance-hours.
Keep a single free service on the account.

Check that it stays awake (KA01): over 24 hours, the Render logs and
events should show no "service suspended/spun down" entries and no repeated
start-up banners. You can also request `/api/health` at random times and
confirm each one answers within normal latency. If the service still sleeps,
add an external monitor such as cron-job.org pointing at the health URL (a
human step; not configured now).

## Supabase database size (free tier: 500 MB)

Run these in the Supabase SQL editor:

```sql
-- Whole database
select pg_size_pretty(pg_database_size(current_database())) as database_size;

-- Largest tables, including their indexes and TOAST
select c.relname as table_name,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
       pg_size_pretty(pg_relation_size(c.oid))       as table_only,
       c.reltuples::bigint                           as approx_rows
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'movienight' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc
limit 10;
```

### Recorded usage

| Date | Database size | `movie_similarity` total | Notes |
| --- | --- | --- | --- |
| _not yet measured_ | | | Run the queries above against production and record them here. |

Estimate only: the shipped MovieLens similarity CSV has 2.44M rows (30
neighbours per title). Loaded into `movie_similarity` with its three indexes,
it would take roughly 250–300 MB, about 50–60% of the quota. Start-up loading
is off (`app.similarity.auto-load-on-startup=false`), so the table holds data
only if a reload was triggered. **If the measured `movie_similarity` total
exceeds about 200 MB (40% of the quota), open a follow-up** to keep fewer
neighbours per title (for example the top 20).
