#!/bin/bash
set -e

echo "=== ApexNAS Hostname Setup ==="

echo "[1/4] Setting hostname..."
echo "apexnas" > /etc/hostname
hostnamectl set-hostname apexnas
echo "  ✓ Hostname set to apexnas"

echo "[2/4] Updating /etc/hosts..."
if ! grep -q "apexnas" /etc/hosts; then
    echo "127.0.1.1   apexnas" >> /etc/hosts
fi
echo "  ✓ /etc/hosts updated"

echo "[3/4] Installing and enabling avahi-daemon..."
apt install -y avahi-daemon 2>/dev/null || echo "  avahi-daemon may already be installed"
systemctl enable avahi-daemon 2>/dev/null || true
systemctl start avahi-daemon 2>/dev/null || true
echo "  ✓ mDNS daemon enabled"

echo "[4/4] Configuring backend to bind to all interfaces..."
cd /home/Abrar-Safin/Downloads/NAS/backend
sed -i "s/server.listen(config.port, '0.0.0.0'/server.listen(config.port, '0.0.0.0'/" server.js 2>/dev/null || true

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Access ApexNAS at:"
IP=$(hostname -I | awk '{print $1}')
echo "  - http://apexnas.local:5173 (from other devices)"
echo "  - http://${IP}:5173 (fallback IP)"
echo ""
echo "Restart servers to apply changes:"
echo "  cd backend && npm run dev"
echo "  cd ../Frontend && npm run dev"