# Raspberry Pi GitHub Actions Runner (magus)

The self-hosted runner **magus** lives on the Raspberry Pi and handles all Pi deploys. It connects
outbound to GitHub — no open ports or VPN required.

- **Runner name:** magus
- **Runner directory:** `/home/magus/apps/actions-runner/`
- **Repo:** musicbender/zeal
- **Workflow label:** `[self-hosted, magus]`

---

## Check if the runner is active

```bash
# Quick status
sudo systemctl status actions.runner.musicbender-zeal.magus.service

# Is it set to start on boot?
systemctl is-enabled actions.runner.musicbender-zeal.magus.service

# Live log stream
journalctl -u actions.runner.musicbender-zeal.magus.service -f
```

The runner is healthy when you see `Active: active (running)` and the GitHub repo shows it as
**Idle** under Settings → Actions → Runners.

---

## Start / stop / restart

```bash
sudo systemctl start   actions.runner.musicbender-zeal.magus.service
sudo systemctl stop    actions.runner.musicbender-zeal.magus.service
sudo systemctl restart actions.runner.musicbender-zeal.magus.service
```

---

## After a Pi reboot

The runner is configured to start automatically via systemd — no manual action needed. If it does
not come back up after a reboot, check the service status and logs:

```bash
sudo systemctl status actions.runner.musicbender-zeal.magus.service
journalctl -u actions.runner.musicbender-zeal.magus.service --since "10 minutes ago"
```

Common causes: the `actions-runner` directory was moved, or the registration token expired (see
[Re-register the runner](#re-register-the-runner) below).

---

## View recent runner job logs

Runner job output is streamed live in the GitHub Actions UI. For local logs:

```bash
# All runner output
journalctl -u actions.runner.musicbender-zeal.magus.service

# Last 100 lines
journalctl -u actions.runner.musicbender-zeal.magus.service -n 100

# Since a specific time
journalctl -u actions.runner.musicbender-zeal.magus.service --since "2025-01-01 12:00:00"
```

Per-job diagnostic logs are also written to:
```
/home/magus/apps/actions-runner/_diag/
```

---

## Check deployed app services

The runner deploys `gaspar` and `worfbot-gateway` as systemd services.

```bash
# Status of both apps
sudo systemctl status gaspar
sudo systemctl status worfbot-gateway

# Live logs
journalctl -u gaspar -f
journalctl -u worfbot-gateway -f

# Recent logs
journalctl -u gaspar -n 50
journalctl -u worfbot-gateway -n 50
```

---

## Re-register the runner

If the runner loses its connection to GitHub (e.g. the registration was revoked, or the Pi was
re-imaged), re-register from inside the runner directory:

```bash
cd /home/magus/apps/actions-runner

# Remove the old registration
sudo ./svc.sh stop
sudo ./svc.sh uninstall
./config.sh remove --token <removal-token>
```

Then get a fresh registration token from GitHub (repo Settings → Actions → Runners → New
self-hosted runner) and re-run:

```bash
./config.sh --url https://github.com/musicbender/zeal --token <new-token>
# When prompted for labels, enter: magus
sudo ./svc.sh install
sudo ./svc.sh start
```

---

## Deploying manually

Deploys normally happen automatically on merge to main. To trigger a deploy manually, push an
empty commit to main:

```bash
git commit --allow-empty -m "chore: trigger deploy"
git push
```

Then approve the `pi-production` environment gate in the GitHub Actions UI.

---

## Environment secrets on the Pi

App secrets are written to these files by the deploy workflow. Edit them directly if you need to
rotate a secret without a full redeploy:

| App | Secrets file |
|-----|-------------|
| gaspar | `/etc/gaspar/env` |
| worfbot-gateway | `/etc/worfbot-gateway/env` |

After editing a secrets file, restart the relevant service:

```bash
sudo systemctl restart gaspar
# or
sudo systemctl restart worfbot-gateway
```
