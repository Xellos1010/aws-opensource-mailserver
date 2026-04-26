---
name: pi-ops
description: >
  REQUIRED for ALL Raspberry Pi operations in this repo. You MUST consult this skill before
  doing anything with the Night-Agent Pi — connecting, SSH, tunneling ports, camera (start stream,
  snapshot, detect, stop, service restart/status/logs), HDMI display rotation, running remote
  commands, resetting the Pi, or checking what's running. Do not attempt to run pi-* scripts or
  Nx targets without reading this skill first — the available targets live in project.json and
  change as the repo evolves; this skill tells you how to find and invoke them correctly.
  Triggers on: "connect to pi", "pi camera", "start stream", "snapshot", "rotate display",
  "ssh into pi", "tunnel port", "restart camera service", "kill pi jobs", "reset pi",
  "what's running on the pi", "IMX219", "MJPEG", "pi-connect", "pi-camera", "pi-display",
  "pi-cmd", "pi-reset", night-agent raspberry pi, or any mention of Pi hardware interaction.
---

## Source of truth

**Always read the current target list first:**

```
support-scripts/deployment/raspberry-pi/project.json
```

This file is the canonical list of available Pi operations. New targets added to the repo are automatically available — read it before answering "what can I do with the Pi?" or choosing a target.

## Invoke pattern

All operations run from `monorepo/` (workspace root):

```bash
pnpm exec nx run pi-raspberry-pi:<target>
```

Or direct script (for ad-hoc args not covered by a named target):

```bash
bash support-scripts/deployment/raspberry-pi/<script>.sh <args>
```

## Script map

| Script | What it does |
|--------|-------------|
| `pi-connect.sh` | Discover Pi on network (ARP→mDNS→ping sweep), open SSH, or tunnel ports |
| `pi-camera.sh` | Detect IMX219, stream MJPEG/H264, snapshot, manage systemd service |
| `pi-display.sh` | Get/set HDMI rotation (0/90/180/270°), persists across reboots |
| `pi-cmd.sh` | Run/background/watch commands on Pi via SSH, track job status |
| `pi-reset.sh` | Kill camera/jobs/display or all — returns Pi to clean state |

## Common workflows

**Find & connect:**
```
pi-connect:scan       → find Pi IP
pi-connect:ssh        → open interactive SSH session
pi-connect:tunnel     → SSH + forward :3000 (night-agent API)
pi-connect:tunnel-camera → SSH + forward :8080 (stream)
```

**Camera:**
```
pi-camera:detect      → confirm IMX219 present
pi-camera:start       → MJPEG stream on :8080
pi-camera:start-720p  → 1280×720 @ 60fps
pi-camera:start-fullres → 3280×2464 @ 21fps
pi-camera:snapshot    → single frame capture
pi-camera:status      → is stream running?
pi-camera:stop        → kill stream
pi-camera:service-*   → manage persistent systemd stream service
```

**Display:**
```
pi-display:get        → current rotation
pi-display:flip       → toggle 0↔180
pi-display:rotate-90  → portrait mode
```

**Commands & reset:**
```
pi-cmd:status         → list background jobs on Pi
pi-reset              → kill everything, home screen
```

## Guidance

- If the user's request maps to a named Nx target, run that target — don't shell out directly.
- If no target fits, run the script directly with appropriate args.
- Before streaming camera, check `pi-camera:detect` if status is unknown.
- SSH session targets are interactive — tell the user they'll need to type `exit` when done.
- Pi IP is cached at `~/.cache/night-agent/pi-ip` after first successful connect.
- Secrets/SSH key: `~/.ssh/id_ed25519_raspberrypi` (see `ssh-key-import.sh` if missing).
