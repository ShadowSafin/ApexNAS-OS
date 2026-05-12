# ApexNAS Documentation Index

Complete guide to all ApexNAS documentation.

## Main Documentation

### 📖 Getting Started
- **[README.md](../../README.md)** - Main entry point, quick start, feature overview
- **[docs/INSTALLATION.md](INSTALLATION.md)** - Installation and initial setup

### 🏗️ Understanding the System
- **[docs/ARCHITECTURE.md](ARCHITECTURE.md)** - System design, layered architecture, module breakdown
- **[docs/API-REFERENCE.md](API-REFERENCE.md)** - Complete REST API reference with examples

### 🔧 Module Guides
- **[docs/MODULES/STORAGE.md](MODULES/STORAGE.md)** - Disk management
- **[docs/MODULES/SHARES.md](MODULES/SHARES.md)** - SMB, NFS, FTP file sharing

- **[docs/MODULES/AUTH.md](MODULES/AUTH.md)** - User authentication and permissions (coming soon)

### 🚀 Operations
- **[docs/DEPLOYMENT.md](DEPLOYMENT.md)** - Production deployment, SSL/TLS, monitoring, backups
- **[docs/SECURITY.md](SECURITY.md)** - Security hardening, threat model, best practices
- **[docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Common issues and solutions

---

## Documentation by Audience

### 👤 System Administrators
**Primary Path**:
1. Read: [README.md](../../README.md)
2. Install: [INSTALLATION.md](INSTALLATION.md)
3. Deploy: [DEPLOYMENT.md](DEPLOYMENT.md)
4. Secure: [SECURITY.md](SECURITY.md)
5. Operate: [MODULES/STORAGE.md](MODULES/STORAGE.md), [MODULES/SHARES.md](MODULES/SHARES.md)

**Reference**: [API-REFERENCE.md](API-REFERENCE.md), [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

### 👨‍💻 Developers / DevOps
**Primary Path**:
1. Understand: [ARCHITECTURE.md](ARCHITECTURE.md)
2. Learn APIs: [API-REFERENCE.md](API-REFERENCE.md)
3. Module deep-dive: [MODULES/](MODULES/)
4. Deploy: [DEPLOYMENT.md](DEPLOYMENT.md)
5. Operate: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

**Setup**: See [backend/README.md](../../backend/README.md)

### 🔐 Security Teams
**Primary Path**:
1. Review: [SECURITY.md](SECURITY.md)
2. Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
3. Deployment: [DEPLOYMENT.md](DEPLOYMENT.md) (SSL/TLS section)
4. Monitoring: [DEPLOYMENT.md](DEPLOYMENT.md) (Monitoring section)

### 🆘 Support / Help Desk
**Primary Path**:
1. Quick reference: [README.md](../../README.md#-troubleshooting)
2. Issues: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
3. Module-specific: [MODULES/](MODULES/)

---

## Documentation Structure

### Core Documentation ✅
- `-README.md` (Main entry point)
- `docs/ARCHITECTURE.md` (System design)
- `docs/API-REFERENCE.md` (API endpoints)
- `docs/INSTALLATION.md` (Setup)
- `docs/DEPLOYMENT.md` (Production)
- `docs/SECURITY.md` (Security)
- `docs/TROUBLESHOOTING.md` (Help)

### Module Documentation ✅
- `docs/MODULES/STORAGE.md` - Disk management
- `docs/MODULES/SHARES.md` - File sharing (SMB, NFS, FTP)

- `docs/MODULES/AUTH.md` - Authentication (planned)
- `docs/MODULES/NETWORK.md` - Network configuration (planned)
- `docs/MODULES/ADMIN.md` - System administration (planned)

### Source Code Documentation
- `backend/README.md` - Backend setup and commands
- `backend/modules/*/README.md` - Individual module docs (optional)

---

## Quick Links

### Common Tasks
- **First Time Setup**: [INSTALLATION.md](INSTALLATION.md)
- **Can't Connect?**: [TROUBLESHOOTING.md#Connection-Issues](TROUBLESHOOTING.md#connection-issues)
- **Storage Issues?**: [MODULES/STORAGE.md#Troubleshooting](MODULES/STORAGE.md#troubleshooting)
- **Going to Production**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **Need API Docs**: [API-REFERENCE.md](API-REFERENCE.md)
- **Security Concerns**: [SECURITY.md](SECURITY.md)

### Technology References
- **System Architecture**: [ARCHITECTURE.md](ARCHITECTURE.md#system-layers)
- **Module Breakdown**: [ARCHITECTURE.md](ARCHITECTURE.md#module-breakdown)
- **Data Flow**: [ARCHITECTURE.md](ARCHITECTURE.md#data-flow)
- **Safety Mechanisms**: [ARCHITECTURE.md](ARCHITECTURE.md#safety-mechanisms)

### Operations
- **Live Monitoring**: [DEPLOYMENT.md#Monitoring--Alerts](DEPLOYMENT.md#monitoring--alerts)
- **Backup/Recovery**: [DEPLOYMENT.md#Backup-Strategy](DEPLOYMENT.md#backup-strategy)
- **Disaster Recovery**: [DEPLOYMENT.md#Disaster-Recovery](DEPLOYMENT.md#disaster-recovery)
- **Performance Tuning**: [DEPLOYMENT.md#Performance-Tuning](DEPLOYMENT.md#performance-tuning)

---

## Search by Topic

### Storage Management
- Disk operations: [MODULES/STORAGE.md#Disk-Management](MODULES/STORAGE.md#disk-management)
- Filesystem: [MODULES/STORAGE.md#Mounting-Filesystems](MODULES/STORAGE.md#mounting-filesystems)

### File Sharing  
- SMB setup: [MODULES/SHARES.md#SMB-CIFS-Guide](MODULES/SHARES.md#smbcifs-guide)
- NFS setup: [MODULES/SHARES.md#NFS-Guide](MODULES/SHARES.md#nfs-guide)
- FTP setup: [MODULES/SHARES.md#FTP-Guide](MODULES/SHARES.md#ftp-guide)
- Access control: [MODULES/SHARES.md#Access-Control](MODULES/SHARES.md#access-control)

### Deployment & Operations
- Setup: [DEPLOYMENT.md#Production-Environment-Setup](DEPLOYMENT.md#production-environment-setup)
- SSL/TLS: [DEPLOYMENT.md#SSL-TLS-Configuration](DEPLOYMENT.md#ssltls-configuration)
- Backups: [DEPLOYMENT.md#Backup-Strategy](DEPLOYMENT.md#backup-strategy)
- Monitoring: [DEPLOYMENT.md#Monitoring--Alerts](DEPLOYMENT.md#monitoring--alerts)

### Security & Hardening
- Overview: [SECURITY.md#Security-Overview](SECURITY.md#security-overview)
- Threat model: [SECURITY.md#Threat-Model](SECURITY.md#threat-model)
- Authentication: [SECURITY.md#Authentication--Authorization](SECURITY.md#authentication--authorization)
- Infrastructure: [SECURITY.md#Infrastructure-Security](SECURITY.md#infrastructure-security)

### Troubleshooting
- Connection issues: [TROUBLESHOOTING.md#Connection-Issues](TROUBLESHOOTING.md#connection-issues)
- Storage issues: [TROUBLESHOOTING.md#Storage-Issues](TROUBLESHOOTING.md#storage-issues)
- App issues: [TROUBLESHOOTING.md#Application-Issues](TROUBLESHOOTING.md#application-issues)
- Performance: [TROUBLESHOOTING.md#Performance-Issues](TROUBLESHOOTING.md#performance-issues)

---

## API Quick Reference

### Endpoint Categories
- **Authentication**: [API-REFERENCE.md#Authentication](API-REFERENCE.md#authentication)
- **System**: [API-REFERENCE.md#System-APIs](API-REFERENCE.md#system-apis)
- **Storage**: [API-REFERENCE.md#Storage-APIs](API-REFERENCE.md#storage-apis)

- **Shares**: [API-REFERENCE.md#Shares-APIs](API-REFERENCE.md#shares-apis)
- **Apps**: [API-REFERENCE.md#Apps-APIs](API-REFERENCE.md#apps-apis)
- **Users**: [API-REFERENCE.md#Users--Permissions-APIs](API-REFERENCE.md#users--permissions-apis)

### Error Reference
- Error codes: [API-REFERENCE.md#Error-Handling](API-REFERENCE.md#error-handling)
- Common errors: [TROUBLESHOOTING.md#Error-Message-Reference](TROUBLESHOOTING.md#error-message-reference)

---

## Documentation Maintenance

### Last Updated
- **README.md**: May 13, 2026
- **ARCHITECTURE.md**: May 13, 2026
- **INSTALLATION.md**: May 13, 2026
- **API-REFERENCE.md**: May 13, 2026
- **SECURITY.md**: May 13, 2026
- **DEPLOYMENT.md**: May 13, 2026
- **TROUBLESHOOTING.md**: May 13, 2026
- **MODULES/STORAGE.md**: May 13, 2026
- **MODULES/SHARES.md**: May 13, 2026
- **MODULES/APPS.md**: May 13, 2026

### Contributing to Docs
- Keep documentation up-to-date with code
- Update links when moving files
- Add new modules as features are added
- Review annually or after major changes
- Solicit feedback from users

---

**Documentation Status**: ✅ Production Ready  
**Coverage**: 90%+ of ApexNAS features  
**Last Review**: May 13, 2026
