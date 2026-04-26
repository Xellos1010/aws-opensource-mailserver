---
name: pi-camera-stream
description: >
  Start the Pi camera stream and open it in a browser via HTTP MJPEG relay.
  Use this skill whenever the user says "open camera stream", "show camera in browser",
  "start stream", "view pi camera", or any variant of viewing the live Pi camera feed
  in a web browser. Handles: ensuring stream is running on Pi, starting the HTTP relay,
  and opening the browser. All-in-one pipeline.
---

## What this skill does

Starts the Pi camera TCP stream (if not already running), launches the HTTP MJPEG relay (`pi-camera-http-relay.py`), and opens the stream in the browser at `http://localhost:8090`.

## Pipeline steps

### Step 1 — Check if Pi stream is running

```bash
cd monorepo && pnpm exec nx run pi-raspberry-pi:pi-camera:status 2>&1 | grep "Status:"
```

If output is `Status: RUNNING` → skip to Step 3.
If output is `Status: STOPPED` or `Status: UNKNOWN` → continue to Step 2.

### Step 2 — Start Pi camera stream (if not running)

```bash
cd monorepo && pnpm exec nx run pi-raspberry-pi:pi-camera:start
```

Wait for "Successfully ran" before continuing.

### Step 3 — Kill any existing relay on port 8090

```bash
fuser -k 8090/tcp 2>/dev/null || true
```

### Step 4 — Start HTTP MJPEG relay in background (Rust binary)

```bash
PI_IP=$(cat ~/.cache/night-agent/pi-ip 2>/dev/null || echo "192.168.4.27")
monorepo/support-scripts/deployment/raspberry-pi/pi-camera-relay/target/release/pi-camera-relay \
  "${PI_IP}" 8080 8090 &
echo $! > /tmp/pi-camera-relay.pid
sleep 2
```

If binary missing, build first:
```bash
cd monorepo && pnpm exec nx run pi-raspberry-pi:pi-camera:relay-build
```

Verify relay started:
```bash
cat /tmp/pi-camera-relay.pid && echo "Relay running"
```

### Step 5 — Open browser

```bash
xdg-open http://localhost:8090 2>/dev/null || \
  open http://localhost:8090 2>/dev/null || \
  echo "Open in browser: http://localhost:8090"
```

### Step 6 — Report to user

Tell the user:
- Stream URL: `http://localhost:8090`
- Relay PID (from `/tmp/pi-camera-relay.pid`)
- To stop the relay: `kill $(cat /tmp/pi-camera-relay.pid)`

## Environment overrides

| Env var | Default | Purpose |
|---|---|---|
| `PI_IP` | from `~/.cache/night-agent/pi-ip` | Pi IP address |
| `PI_CAMERA_PORT` | `8080` | Pi TCP stream port |
| `PI_HTTP_PORT` | `8090` | Local HTTP relay port |

## Stopping the relay

```bash
kill $(cat /tmp/pi-camera-relay.pid) 2>/dev/null && echo "Relay stopped"
```

## Troubleshooting

- **Black screen in browser**: Pi stream may not be running — run Step 2.
- **Port 8090 in use**: Step 3 kills it. If it persists: `sudo fuser -k 8090/tcp`.
- **Relay exits immediately**: Pi IP may have changed. Check with `nx run pi-raspberry-pi:pi-connect:scan`.
- **relay.py not found**: Run from repo root (`/home/stormtropper/Night-Agent`), not `monorepo/`.
