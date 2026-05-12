<div align="center">
  
  <br>
  <h1>🚀 ApexNAS</h1>
  <strong>Enterprise-Grade Network Attached Storage</strong>
  <br><br>

  <p align="center">
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node Version"></a>
    <a href="https://reactjs.org"><img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React"></a>
    <a href="https://linux.org"><img src="https://img.shields.io/badge/OS-Debian-A81D33?style=for-the-badge&logo=debian&logoColor=white" alt="Linux"></a>
    <br>
    <a href="https://github.com/ShadowSafin/ApexNAS-OS/commits/main"><img src="https://img.shields.io/badge/Status-Production%20Ready-success?style=flat-square" alt="Status"></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License"></a>
  </p>

  <p><i>A production-grade, self-hosted NAS system with enterprise-class features including RAID management, FTP/SMB/NFS file sharing, and comprehensive storage administration.</i></p>

</div>

---

<details>
  <summary><b>✨ Click here to see what makes ApexNAS special!</b></summary>
  <br>
  <blockquote>
    ApexNAS abstracts away the complexity of Linux command-line storage administration, offering robust user permission controls (ACLs), and real-time system monitoring natively through an incredible web interface. 
  </blockquote>
</details>

---

## ⚡ Quick Start

### Prerequisites
- Linux system with **Node.js 18+**
- Root/sudo access for storage operations

### Setup (5 minutes)

```bash
# Clone repository
git clone <repo-url>
cd NAS

# Install dependencies
npm install

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your settings

# Seed initial data
npm run seed

# Start development server
npm run dev
```

Server runs on `http://localhost:3000` with React frontend.

### First Steps
1. Log in with default credentials (`admin` / `nasos_admin`)
2. Go to **Storage** 💽 → Add disks and create RAID arrays
3. Go to **Shares** 📂 → Set up SMB/FTP/NFS shares
5. Go to **Settings** ⚙️ → Configure users and permissions

---

## 🎯 Core Features

### Storage Management
- **RAID Arrays**: Create/monitor RAID 0, 1, 5, 6 arrays with safety-first design
- **Disk Management**: Partition, format, mount filesystems with automatic fstab persistence
- **SMART Monitoring**: Health status and predictive failure warnings
- **Filesystem Support**: ext4, xfs, btrfs with full lifecycle management

### File Sharing
- **SMB/CIFS**: Windows file sharing with user authentication
- **NFS**: POSIX-compliant Unix/Linux sharing
- **FTP**: Secure SFTP with user jailing and passive mode support
- **Quotas**: Per-share and per-user storage limits



### Administration
- **User Management**: Create system users with role-based access
- **Access Control**: Permission management for shares and resources
- **Activity Logging**: Comprehensive system event tracking
- **Health Dashboard**: System resources, performance, and alerts

---

## 📁 Project Structure

```
ApexNAS/
├── README.md                              # This file
├── docs/                                  # Detailed documentation
│   ├── ARCHITECTURE.md                   # System design and components
│   ├── INSTALLATION.md                   # Setup instructions
│   ├── API-REFERENCE.md                  # Complete API endpoints
│   ├── MODULES/
│   │   ├── STORAGE.md                    # Disk and RAID management
│   │   ├── SHARES.md                     # SMB, NFS, FTP sharing
│   │   ├── AUTH.md                       # Authentication system
│   │   └── NETWORK.md                    # Network configuration
│   ├── DEPLOYMENT.md                     # Production deployment
│   ├── TROUBLESHOOTING.md                # Common issues and fixes
│   └── SECURITY.md                       # Security considerations
│
├── backend/                               # Node.js/Express API server
│   ├── app.js                            # Express app initialization
│   ├── server.js                         # Server entry point
│   ├── .env.example                      # Environment template
│   ├── config/                           # Configuration
│   ├── middleware/                       # Express middleware
│   ├── modules/                          # Feature modules
│   │   ├── auth/                         # Authentication & JWT
│   │   ├── disk/                         # Disk management
│   │   ├── raid/                         # RAID operations
│   │   ├── storage/                      # Storage operations
│   │   ├── shares/                       # SMB/NFS/FTP configuration
│   │   ├── ftp/                          # FTP service
│   │   ├── smb/                          # SMB/CIFS service
│   │   ├── nfs/                          # NFS service
│   │   ├── users/                        # User management
│   │   ├── permissions/                  # ACL & permissions
│   │   ├── system/                       # System info & health
│   │   ├── network/                      # Network configuration
│   │   └── services/                     # Service management
│   ├── lib/                              # Utilities & helpers
│   ├── tests/                            # Integration tests
│   ├── scripts/                          # Setup scripts
│   └── package.json
│
├── Frontend/                              # React web interface
│   ├── src/
│   │   ├── pages/                        # Page components
│   │   ├── components/                   # Reusable components
│   │   └── App.jsx
│   └── package.json
│
├── build-iso.sh                          # ISO image builder (optional)
├── iso-build/                            # ISO build configuration
├── data/                                 # Runtime data storage
├── logs/                                 # Application logs
└── package.json                          # Root workspace config
```

---

## 🏗️ Architecture Overview

### System Layers

```
┌─────────────────────────────────────────┐
│   Web Browser (React)                   │
│   http://localhost:3000                 │
└────────────────┬────────────────────────┘
                 │ HTTP/JSON (REST API)
┌────────────────▼────────────────────────┐
│   Express API Server (Port 8080)        │
│   ├─ Authentication (JWT)               │
│   ├─ Route handlers                     │
│   └─ Middleware stack                   │
└────────────────┬────────────────────────┘
                 │ System commands, file I/O
┌────────────────▼────────────────────────┐
│   Backend Services                      │
│   ├─ mdadm (RAID)                       │
│   ├─ mkfs, mount (Disk)                 │
│   ├─ vsftpd, smbd, nfsd                 │
│   └─ Custom Node.js services            │
└────────────────┬────────────────────────┘
                 │ System calls
┌────────────────▼────────────────────────┐
│   Linux Kernel & Hardware               │
│   ├─ Block devices                      │
│   ├─ Filesystems                        │
│   ├─ Network stack                      │
│   └─ Storage subsystem                  │
└─────────────────────────────────────────┘
```

For detailed architecture, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## 📚 Documentation Guide

### For Different Audiences

**👤 I'm using ApexNAS as a NAS system**
- Start with: [docs/INSTALLATION.md](docs/INSTALLATION.md)
- Then: [docs/MODULES/STORAGE.md](docs/MODULES/STORAGE.md) - set up storage
- Then: [docs/MODULES/SHARES.md](docs/MODULES/SHARES.md) - configure file sharing
- Help: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

**👨‍💻 I'm developing features or fixing bugs**
- Start with: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Then: [docs/MODULES/](docs/MODULES/) - module-specific guides
- API docs: [docs/API-REFERENCE.md](docs/API-REFERENCE.md)
- Setup: Follow backend [README.md](backend/README.md)

**🚀 I'm deploying to production**
- Start with: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Security: [docs/SECURITY.md](docs/SECURITY.md)
- Checklist: See deployment section below

**🔧 I'm troubleshooting issues**
- Go to: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- Common issues section
- Error messages lookup

---

## 🚀 Deployment

### Staging Deployment
```bash
cd backend
npm install
npm run seed
npm run dev  # For development testing
```

### Production Deployment
See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for:
- Environment configuration
- Security hardening
- Performance tuning
- Backup strategies
- Monitoring setup

**Pre-deployment checklist**:
- [ ] Run test suite: `npm run test`
- [ ] Review [docs/SECURITY.md](docs/SECURITY.md)
- [ ] Verify all `.env` variables
- [ ] Test all critical workflows
- [ ] Backup existing NAS configuration
- [ ] Plan maintenance window

---

## 🔐 Security

ApexNAS includes enterprise-grade security:

- **Authentication**: JWT-based with refresh tokens
- **Authorization**: Role-based access control (RBAC)
- **Data Protection**: Atomic operations, transaction rollback
- **Path Restrictions**: User jailing, filesystem isolation
- **Validation**: Comprehensive input validation on all APIs
- **Logging**: Full audit trail of administrative actions

For security details, see [docs/SECURITY.md](docs/SECURITY.md)

---

## 📊 API Overview

ApexNAS provides comprehensive REST APIs organized by module:

### Storage APIs
```
GET    /api/storage/info           # System storage overview
PUT    /api/storage/mount/:device  # Mount partition
DELETE /api/storage/umount/:device # Unmount partition
```

### RAID APIs
```
GET    /api/raid/list              # List all RAID arrays
POST   /api/raid/create            # Create new array
POST   /api/raid/stop              # Stop array
GET    /api/raid/:name/status      # Array status
```

### Shares APIs  
```
GET    /api/shares/list            # List shares
POST   /api/shares/create          # Create share
DELETE /api/shares/:id             # Remove share
```



### Admin APIs
```
POST   /api/auth/login             # User login
GET    /api/auth/me                # Current user info
GET    /api/users/list             # List users (admin)
POST   /api/users/create           # Create user (admin)
```

For complete API reference with request/response examples, see [docs/API-REFERENCE.md](docs/API-REFERENCE.md)

---

## 🧪 Testing

### Run Test Suite
```bash
cd backend
npm run seed          # Reset test data
npm run test          # Run all tests
npm run test:unit     # Unit tests only
npm run test:integration # Integration tests
```

### Manual Testing
1. Open browser to `http://localhost:3000`
2. Log in with test credentials
3. Navigate through each module
4. Follow workflows in [docs/TROUBLESHOOTING.md#Testing](docs/TROUBLESHOOTING.md)

---

## 🐛 Troubleshooting

### Common Issues

**Can't connect to web interface**
- Check server is running: `npm run dev`
- Verify port 3000 is open: `netstat -tuln | grep 3000`
- Check firewall rules
- See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md#Connection)

**RAID creation failing**
- Verify devices aren't mounted: `lsblk -f`
- Check device paths: `lsblk --output NAME,SIZE,TYPE`
- See [docs/MODULES/STORAGE.md#RAID-Troubleshooting](docs/MODULES/STORAGE.md)



**SMB/FTP not accessible**
- Service running? Check dashboard
- Firewall rules? Open ports 139, 445 (SMB), 21 (FTP)
- See [docs/MODULES/SHARES.md](docs/MODULES/SHARES.md)

For more issues, see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

---

## 📝 Development

### Getting Started as Developer

```bash
# Install dependencies (from root)
npm install

# Start backend development server
npm run dev

# In another terminal, start frontend (if using separate dev server)
cd Frontend
npm run dev
```

### Code Structure
- Backend modules in `/backend/modules/` - each module (auth, disk, raid, etc.) has:
  - `*.service.js` - Business logic
  - `*.routes.js` - API endpoints
  - `*.schema.js` - Input validation
  - (optionally) `*.test.js` - Tests

- Frontend in `/Frontend/src/` - React components organized by feature

### Contributing
1. Create feature branch from `main`
2. Make changes following existing code patterns
3. Add tests for new functionality
4. Run test suite and verify all pass
5. Create pull request with description

---

## 🗺️ Roadmap

### Completed ✅
- Core backend infrastructure
- Authentication & user management
- Disk and RAID management with safety mechanisms
- FTP service with user management
- SMB/CIFS file sharing
- NFS support
- Comprehensive API layer

### Planned 🔄
- Web UI improvements and mobile responsiveness
- Advanced RAID recovery tools
- Backup and snapshot management
- Enhanced monitoring and alerting
- HA (High Availability) clustering
- Performance optimization and tuning

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🤝 Support

### Documentation
- See [docs/](docs/) for comprehensive guides
- Check [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for common issues

### Reporting Issues
1. Search existing issues
2. Collect relevant logs from `/logs/`
3. Include system info: `uname -a`
4. Create detailed issue report

### Community
- Discussions: Check GitHub discussions
- Security issues: Report privately to maintainers

---

## 🔄 Version Information

- **Current Version**: 1.0.0 (Production Ready) ✅
- **Node.js**: 18+
- **Linux**: Ubuntu 20.04+ or compatible

---

