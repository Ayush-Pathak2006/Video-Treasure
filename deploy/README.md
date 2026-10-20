# Video Treasure: load-balanced demo (Docker Compose + Nginx)

A local demo of the architecture Video Treasure is built for. Production runs as a single process on Render; this
runs the same code split up:

| Container | What it does |
|---|---|
| `nginx` | Serves the built frontend and load-balances `/api` over the 3 API containers (`least_conn`). Same origin, so the auth cookies are first-party. Rate-limits search with `limit_req`. |
| `api1`, `api2`, `api3` | The Express API, started with `RUN_JOBS_IN_API=false`: they only serve requests. |
| `worker` | `node src/worker.js`: the startup migrations and the scheduled jobs (niche crawler, 30-day refresh, trend crawler). |
| `mongo` | MongoDB 7, with a named volume. |

What makes several API copies safe:
- **Shared refills** use a MongoDB lease (`refill:<search, platform, page token>`), so 3 containers asked for the same uncached search at once make one YouTube call.
- **The flood limit** counts in MongoDB (`RATE_LIMIT_STORE=mongo`), so a client can't get 3 times the limit by being spread over 3 containers.
- **A leader lease** makes sure only one worker runs the jobs, even if you start more than one.
- YouTube runs in stub mode (`YOUTUBE_MODE=stub`), so the demo never spends the real quota. Dailymotion and the Google Trends feed are called for real; both are free.

## Run it

You need Docker Desktop running.

```sh
cd deploy
docker compose up --build
```

Open http://localhost:8080. The demo can't send verification emails, so create a user that can log in by email:

```sh
docker compose run --rm -v ./create-demo-user.mjs:/usr/src/app/create-demo-user.mjs worker node create-demo-user.mjs
```

In Git Bash on Windows, put `MSYS_NO_PATHCONV=1 ` in front, or Git Bash rewrites `/usr/src/app/...` into a Windows path.

Then log in with `demo@example.com` / `demo-password-123`.

Google login works only if `http://localhost:8080/api/v1/auth/google/callback` is registered as a redirect URI in
Google Cloud Console for the client you pass in (`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in your shell
before `docker compose up`). Otherwise, use email login.

## Demo 1: a container goes down, the site keeps working

```sh
docker compose stop api2
```

Keep using the site: Nginx sends requests to `api1` and `api3`. A request that lands on the stopped container
waits up to 2 s (`proxy_connect_timeout`) before Nginx retries it on another one, and the container is then
skipped for 10 s. `docker compose logs -f nginx` shows the failed attempts. Bring it back with
`docker compose start api2`.

Nginx resolves `api1`–`api3` when it starts, so start Nginx with all three up (as `docker compose up` does).

## Demo 2: `limit_req` rejects a flood

Search allows 5 requests a second per client IP, with bursts of 10. Send 40 at once:

```sh
for i in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8080/api/v1/videos/search?q=nginx+demo&platform=youtube" & done; wait
```

Around 11 come back `200` and the rest `429`, straight from Nginx, before reaching the API. The API's own flood
limit (120 requests a minute per IP, shared by the 3 containers) is a second line behind it.

## Demo 3: one leader among workers

```sh
docker compose up -d --scale worker=2
docker compose logs worker | grep scheduler
```

One worker logs `is the leader and runs the jobs`, the other `is on standby`. Stop the leader and the other takes
over within a minute.

## Clean up

```sh
docker compose down          # keeps the database volume
docker compose down -v       # also deletes it
```
