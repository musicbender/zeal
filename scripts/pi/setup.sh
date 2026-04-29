#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Setting up Pi service directories..."
sudo mkdir -p /etc/gaspar /etc/worfbot-gateway
sudo chmod 700 /etc/gaspar /etc/worfbot-gateway
sudo chown magus:magus /etc/gaspar /etc/worfbot-gateway

echo "Installing systemd service files..."
sudo cp "$SCRIPT_DIR/gaspar.service" /etc/systemd/system/gaspar.service
sudo cp "$SCRIPT_DIR/worfbot-gateway.service" /etc/systemd/system/worfbot-gateway.service

echo "Granting passwordless restart permissions..."
cat <<'EOF' | sudo tee /etc/sudoers.d/magus-apps > /dev/null
magus ALL=(ALL) NOPASSWD: /bin/systemctl restart gaspar, /bin/systemctl restart worfbot-gateway
EOF
sudo chmod 440 /etc/sudoers.d/magus-apps

echo "Enabling services..."
sudo systemctl daemon-reload
sudo systemctl enable gaspar worfbot-gateway

echo "Done. Create /etc/gaspar/env and /etc/worfbot-gateway/env with secrets before starting."
echo "  /etc/gaspar/env       — DATABASE_URL"
echo "  /etc/worfbot-gateway/env — DISCORD_BOT_TOKEN, DISCORD_APP_ID, DISCORD_PUBLIC_KEY"
echo ""
echo "Then: sudo systemctl start gaspar worfbot-gateway"
