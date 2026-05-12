#!/bin/bash
set -e

echo "=== ApexNAS ISO Builder ==="
echo "Note: This script must be run as root (sudo ./build-iso.sh)"

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

# --- Configuration ---
PROJECT_DIR="/home/Abrar-Safin/Downloads/NAS"
BUILD_DIR="${PROJECT_DIR}/iso-build"
STAGING_DIR="${PROJECT_DIR}/iso-config-staging"
FRONTEND_DIR="${PROJECT_DIR}/Frontend"
BACKEND_DIR="${PROJECT_DIR}/backend"

echo "[1/7] Installing live-build and setting up keys..."
apt-get update || echo "apt-get update had some errors, continuing..."
apt-get install -y live-build gnupg curl || echo "installation had some errors, continuing..."

echo "Fetching Debian Bookworm Release Keys..."
curl -sL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xF8D2585B8783D481" | gpg --no-default-keyring --keyring /usr/share/keyrings/debian-archive-keyring.gpg --import || true
curl -sL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x0E98404D386FA1D9" | gpg --no-default-keyring --keyring /usr/share/keyrings/debian-archive-keyring.gpg --import || true
curl -sL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x6ED0E7B82643E131" | gpg --no-default-keyring --keyring /usr/share/keyrings/debian-archive-keyring.gpg --import || true

echo "Applying patch for live-build bug on Bookworm (missing exclude file)..."
sed -i 's/sed -i -e '\''s|di-utils-exit-installer||'\'' exclude/touch exclude \&\& sed -i -e '\''s|di-utils-exit-installer||'\'' exclude/' /usr/lib/live/build/installer_debian-installer
sed -i 's/sed -i -e '\''s|live-installer||'\'' exclude/touch exclude \&\& sed -i -e '\''s|live-installer||'\'' exclude/' /usr/lib/live/build/installer_debian-installer

echo "[2/7] Setting up iso-build directory..."
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"
cd "${BUILD_DIR}"

echo "[3/7] Initializing live-build config..."
lb config \
  --distribution bookworm \
  --architecture amd64 \
  --binary-images iso-hybrid \
  --debian-installer live \
  --archive-areas "main contrib non-free non-free-firmware" \
  --bootappend-install "auto=true priority=critical" \
  --iso-application "ApexNAS" \
  --iso-publisher "ApexNAS — Abrar Safin" \
  --iso-volume "ApexNAS v1.0"

echo "[4/7] Copying configurations and files..."
# Copy custom configuration files from staging
cp -a "${STAGING_DIR}"/* config/

# Remove the frontend build hook since we build it on the host
rm -f config/hooks/live/build-frontend.chroot

# Make scripts executable
chmod +x config/hooks/live/*.chroot
chmod +x config/includes.chroot/opt/apexnas/setup/*.sh
chmod +x config/includes.chroot/etc/update-motd.d/*

# Also place preseed on the CD filesystem for redundancy
mkdir -p config/includes.binary/install
cp config/includes.installer/preseed.cfg config/includes.binary/install/preseed.cfg

echo "[5/7] Building frontend locally on the host..."
cd "${FRONTEND_DIR}"
npm install
npm run build
cd "${BUILD_DIR}"

# Copy backend to includes.chroot/opt/apexnas
mkdir -p config/includes.chroot/opt/apexnas
echo "Copying backend..."
cp -a "${BACKEND_DIR}" config/includes.chroot/opt/apexnas/

# Create production .env for the backend
cat > config/includes.chroot/opt/apexnas/backend/.env << 'ENVEOF'
NODE_ENV=production
PORT=8080
JWT_SECRET=apexnas-production-jwt-secret-change-me
JWT_REFRESH_SECRET=apexnas-production-refresh-secret-change-me
LOG_LEVEL=info
LOG_DIR=./logs
CORS_ORIGINS=*
DATA_DIR=./data
PLUGINS_DIR=../plugins
ENVEOF

# Copy only the compiled frontend dist folder
mkdir -p config/includes.chroot/opt/apexnas/frontend
echo "Copying frontend dist..."
cp -a "${FRONTEND_DIR}/dist" config/includes.chroot/opt/apexnas/frontend/

# Skip node_modules inside backend — chroot hook installs production deps
rm -rf config/includes.chroot/opt/apexnas/backend/node_modules

echo "[6/7] Building ISO (This will take a while)..."
lb build

echo "[7/7] Finalizing..."
if [ -f live-image-amd64.hybrid.iso ]; then
  mv live-image-amd64.hybrid.iso apexnas.iso
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  ✅ Build complete!                                        ║"
  echo "║  ISO: ${BUILD_DIR}/apexnas.iso"
  echo "║                                                            ║"
  echo "║  Flash to USB:                                             ║"
  echo "║    sudo dd if=apexnas.iso of=/dev/sdX bs=4M status=progress║"
  echo "╚══════════════════════════════════════════════════════════════╝"
else
  echo "❌ Build failed. ISO was not created."
  exit 1
fi
