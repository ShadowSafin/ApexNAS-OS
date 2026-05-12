# ApexNAS Installation & Setup Guide

Complete guide to installing and configuring ApexNAS for development and production use.

## Table of Contents
- [System Requirements](#system-requirements)
- [Development Setup](#development-setup)
- [Production Deployment](#production-deployment)
- [Configuration](#configuration)
- [Initial Configuration](#initial-configuration)
- [Verification](#verification)

---

## System Requirements

### Hardware
- **CPU**: 2+ cores (4+ recommended for production)
- **RAM**: 4GB minimum (8GB+ recommended)
- **Disk**: 50GB+ for OS and applications
- **Disks for NAS**: Dedicated storage disks
### Software
- **OS**: Linux (Ubuntu 20.04+ recommended, or compatible distribution)
- **Node.js**: 18.0.0 or later
- **npm**: 8.0.0 or later (comes with Node.js)
- **npm**: 8.0.0 or later (comes with Node.js)

### Network
- Static IP address (recommended for NAS)
- Ports available: 3000 (web), 8080 (API), 139/445 (SMB), 21 (FTP), 2049 (NFS)
- Firewall configured for your use case

### Permissions
- Root or sudo access during setup (for system configuration)
- Stored procedure access (for database operations, if using)

---

## Development Setup

### Quick Start (5 minutes)

```bash
# 1. Clone the repository
git clone https://github.com/your-org/apexnas.git
cd apexnas

# 2. Install root dependencies
npm install

# 3. Install backend dependencies
cd backend
npm install
cd ..

# 4. Set up environment
cp backend/.env.example backend/.env

# 5. Edit configuration (set admin password, storage paths)
nano backend/.env

# 6. Initialize database and seed data
npm run seed

# 7. Start development server
npm run dev
```

**Server will be available at**: `http://localhost:3000`

### Step-by-Step Setup

#### Step 1: Clone Repository
```bash
git clone https://github.com/your-org/apexnas.git
cd apexnas
```

#### Step 2: Verify Prerequisites
```bash
# Check Node.js version
node --version  # Should be 18+

# Check npm version
npm --version   # Should be 8+


# Check sudo access
sudo -v            # Should work without password prompt
```

#### Step 3: Install Dependencies
```bash
# Install root-level dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..

# (Optional) Install frontend dependencies separately
cd Frontend
npm install
cd ..
```

#### Step 4: Configure Environment

Copy example environment file:
```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your settings:
```env
# Server
NODE_ENV=development
PORT=8080
API_URL=http://localhost:8080

# Authentication
JWT_SECRET=your-secret-key-change-this
ADMIN_USER=admin
ADMIN_PASSWORD=change-me-to-strong-password

# Storage
STORAGE_PATH=/mnt/storage
DATA_PATH=/var/lib/apexnas


# Logging
LOG_LEVEL=debug
LOG_PATH=./logs
```

**Important**: Change `JWT_SECRET` and `ADMIN_PASSWORD` to secure values.

#### Step 5: Initialize Database
```bash
npm run seed
```

This creates:
- Initial admin user (using `ADMIN_USER`/`ADMIN_PASSWORD`)
- Default storage configuration
- Initial logs

#### Step 6: Start Development Server
```bash
npm run dev
```

Output will show:
```
Backend API server listening on port 8080
Frontend server running on port 3000
Open http://localhost:3000 to access the web interface
```

#### Step 7: Verify Installation
1. Open `http://localhost:3000` in browser
2. Log in with `admin` / (your password from `.env`)
3. Navigate to **System** → **Info** to verify backend connection
4. Check **Dashboard** for system metrics

**✅ Installation complete!**

---

## Production Deployment

See detailed [docs/DEPLOYMENT.md](../DEPLOYMENT.md) for production setup including:
- Security hardening
- SSL/TLS certificates
- Performance tuning
- Backup configuration
- Monitoring setup

**Quick production checklist:**
- [ ] Review [docs/SECURITY.md](../SECURITY.md)
- [ ] Run security hardening script
- [ ] Generate strong JWT secret
- [ ] Set strong admin password
- [ ] Configure backup strategy
- [ ] Enable logging and monitoring
- [ ] Test all critical workflows
- [ ] Have rollback plan ready

---

## Configuration

### Environment Variables

**Core Configuration** (`backend/.env`):

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `NODE_ENV` | development | Yes | Environment (development/production) |
| `PORT` | 8080 | No | Backend API port |
| `API_URL` | http://localhost:8080 | No | API URL for frontend |
| `JWT_SECRET` | (none) | Yes | Secret key for JWT signing |
| `JWT_EXPIRY` | 3600 | No | JWT token lifetime (seconds) |
| `STORAGE_PATH` | /mnt/storage | No | Main storage mount point |
| `DATA_PATH` | /var/lib/apexnas | No | Persistent data location |
| `LOG_LEVEL` | info | No | Logging level (debug/info/warn/error) |
| `LOG_PATH` | ./logs | No | Log file directory |
| `DOCKER_SOCKET` | /var/run/docker.sock | No | Docker daemon socket |
| `ADMIN_USER` | admin | No | Default admin username |
| `ADMIN_PASSWORD` | (none) | Yes | Default admin password |

### Storage Configuration

Create storage directory:
```bash
sudo mkdir -p /mnt/storage
sudo chown $USER:$USER /mnt/storage
chmod 755 /mnt/storage
```

This directory will contain:
- NAS shares (SMB, NFS, FTP)
- Docker app data
- User files


---

## Initial Configuration

After first login to web interface:

### 1. Change Admin Password
**Admin** → **Users** → **admin** → **Change Password**

### 2. Add Storage Devices
**Storage** → **Devices**:
1. Click **Add Device**
2. Select disk from list
3. Create partitions
4. Format with filesystem (ext4 recommended)
5. Mount to `/mnt/storage`

### 4. Create Shares
**Shares** → **Create Share**:
1. Set name and description
2. Choose protocols (SMB, NFS, FTP)
3. Select storage path
4. Configure permissions
5. Enable service

### 5. Configure Users
**Admin** → **Users**:
1. Create system users
2. Set permissions (admin/user/readonly)
3. Assign share access

---

## Multi-User Setup

### Add System Users
```bash
sudo adduser nachos
```

### Configure User Permissions
1. Log in as Admin
2. **Admin** → **Users** → **Create**
3. Set username, password, role
4. Assign share access
5. User can now log in

### User Roles
- **Admin**: All operations
- **User**: Create/manage shares, limited admin functions
- **Readonly**: View only, no changes

---

## Network Configuration

### Static IP (Recommended)
```bash
# Ubuntu 22.04+ (netplan)
sudo nano /etc/netplan/01-netcfg.yaml
```

Edit to:
```yaml
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: no
      addresses:
        - 192.168.1.100/24
      gateway4: 192.168.1.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
```

Apply:
```bash
sudo netplan apply
```

### Firewall Configuration
```bash
# Ubuntu
sudo ufw enable
sudo ufw allow 3000    # Web interface
sudo ufw allow 8080    # API
sudo ufw allow 139     # SMB
sudo ufw allow 445     # SMB
sudo ufw allow 21      # FTP
sudo ufw allow 2049    # NFS
```

### Hostname Configuration
```bash
# Set hostname
sudo hostnamectl set-hostname apexnas

# Update /etc/hosts
sudo nano /etc/hosts
# Add: 192.168.1.100 apexnas
```

---

## Backup & Recovery

### Backup
```bash
# Backup database and configuration
tar czf apexnas-backup-$(date +%Y%m%d).tar.gz \
  /var/lib/apexnas \
  backend/.env \
  backend/data/
```

### Restore
```bash
# Stop services
npm stop

# Restore backup
tar xzf apexnas-backup-20260513.tar.gz -C /

# Restart services
npm run dev
```

See [docs/DEPLOYMENT.md](../DEPLOYMENT.md) for full backup strategy.

---

## Verification

### Verify Installation

```bash
# 1. Check backend process
ps aux | grep node

# 2. Check ports
netstat -tuln | grep -E ':3000|:8080'

# 3. Test API
curl -s http://localhost:8080/api/system/health | json_pp

# 4. Check logs
tail -f backend/logs/*.log

# 5. Verify file permissions
ls -la /mnt/storage
ls -la /var/lib/apexnas
```

### Test Critical Workflows

1. **Login**: http://localhost:3000
   - [ ] Admin login successful
   - [ ] Dashboard loads

2. **Storage**: Storage tab
   - [ ] Disks visible
   - [ ] Can view partitions  

4. **Users**: Admin → Users
   - [ ] Can create user
   - [ ] Can change password

---

## Troubleshooting Setup

### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Kill process (if unnecessary)
kill -9 <pid>
```

### Cannot Connect to Backend
```bash
# Check backend is running
ps aux | grep node

# Check port is listening
netstat -tuln | grep 8080

# Check logs
cat backend/logs/error.log

# Restart backend
npm run dev
```

### Database Issues
```bash
# Reset and reseed data
rm -rf backend/data/*
npm run seed
```

For more troubleshooting, see [docs/TROUBLESHOOTING.md](../TROUBLESHOOTING.md)

---

## Next Steps

1. **Learn the System**: Read [docs/ARCHITECTURE.md](../ARCHITECTURE.md)
2. **Admin Guide**: See [docs/MODULES/ADMINISTRATION.md](../MODULES/)
3. **API Development**: Check [docs/API-REFERENCE.md](../API-REFERENCE.md)
4. **Production Setup**: Review [docs/DEPLOYMENT.md](../DEPLOYMENT.md)
5. **Security**: Understand [docs/SECURITY.md](../SECURITY.md)

---

**Installation Status**: ✅ Complete  
**Next**: Configure your storage and users
