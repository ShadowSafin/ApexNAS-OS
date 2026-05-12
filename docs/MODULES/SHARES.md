# ApexNAS Shares Module Documentation

Guide to configuring SMB, NFS, and FTP file sharing.

## Table of Contents
- [Shares Overview](#shares-overview)
- [SMB/CIFS Guide](#smbcifs-guide)
- [NFS Guide](#nfs-guide)
- [FTP Guide](#ftp-guide)
- [Access Control](#access-control)
- [Quotas & Limits](#quotas--limits)

---

## Shares Overview

ApexNAS supports three file sharing protocols:

| Protocol | Best For | Performance | Security | Setup |
|----------|----------|-------------|----------|-------|
| **SMB** | Windows/Mac | Medium | Good (with signing) | Easy |
| **NFS** | Linux/Unix | High | File permissions | Medium |
| **FTP** | Legacy/Mobile | Medium | Basic (auth only) | Easy |

---

## SMB/CIFS Guide

### What is SMB?

SMB (Server Message Block) is the protocol used by Windows file sharing.

**Benefits**:
- Works on Windows, Mac, Linux
- User authentication
- File-level permissions
- Printer sharing

**Modern Version**: SMB3 (encrypted, faster)

### Create SMB Share

```bash
API: POST /api/shares/create

Request:
{
  "name": "Photos",
  "description": "Family photos",
  "path": "/mnt/storage/photos",
  "protocols": ["smb"],
  "permissions": {
    "owner": "admin",
    "group": "users",
    "mode": "0755"
  }
}

Response:
{
  "success": true,
  "share": {
    "id": "share-123",
    "name": "Photos",
    "protocol": "smb",
    "path": "/mnt/storage/photos",
    "browsable": true,
    "readOnly": false
  }
}
```

### Connect from Windows

**Network Path**:
```
\\apexnas\Photos
```

**Command Line** (PowerShell):
```powershell
net use Z: \\apexnas\Photos /user:admin password
```

**File Explorer**:
1. Open File Explorer
2. Right-click "This PC" → "Add a network location"
3. Enter: `\\apexnas\Photos`
4. Browse to share
5. Enter credentials when prompted

### Connect from Mac

**Finder**:
1. Press Cmd+K (Go → Connect to Server)
2. Enter: `smb://apexnas/Photos`
3. Click Connect
4. Enter username and password

**Terminal**:
```bash
mount_smbfs smb://admin@apexnas/Photos /Volumes/Photos
```

### Connect from Linux

```bash
# Install cifs-utils
sudo apt install cifs-utils

# Mount share
sudo mount -t cifs -o username=admin,password=pass \
  //apexnas/Photos /mnt/photos

# Persistent mount (add to /etc/fstab)
//apexnas/Photos /mnt/photos cifs username=admin,password=pass,uid=1000,gid=1000,file_mode=0755,dir_mode=0755 0 0
```

---

## NFS Guide

### What is NFS?

NFS (Network File System) is Unix/Linux file sharing.

**Benefits**:
- High performance
- POSIX-compliant permissions
- Stateless (good for redundancy)
- Wide Linux/Unix support

### Create NFS Export

```bash
API: POST /api/shares/create

Request:
{
  "name": "Data",
  "description": "Shared data",
  "path": "/mnt/storage/data",
  "protocols": ["nfs"],
  "nfs": {
    "version": "4.1",
    "security": "sys",  // or "krb5" for Kerberos
    "allowedHosts": ["192.168.1.0/24", "10.0.0.0/8"]
  }
}
```

### Connect from Linux Client

```bash
# Mount NFS
sudo mount -t nfs -o vers=4.1 apexnas:/mnt/storage/data /mnt/data

# Or with options
sudo mount -t nfs4 -o rw,hard,intr,rsize=8192,wsize=8192 \
  apexnas:/mnt/storage/data /mnt/data

# Verify mount
mount | grep nfs

# Persistent mount (add to /etc/fstab)
apexnas:/mnt/storage/data /mnt/data nfs4 defaults 0 0
```

### NFS Performance Tuning

**Block Size** (rsize/wsize):
- Default: 4096 bytes
- Optimal for Gigabit: 8192-16384 bytes
- Larger = faster for bulk transfers
- Smaller = lower latency for small files

**Mount Example (Optimized)**:
```bash
sudo mount -t nfs4 -o vers=4.1,rw,hard,intr,proto=tcp,\
rsize=32768,wsize=32768,timeo=300 \
apexnas:/mnt/storage/data /mnt/data
```

---

## FTP Guide

### What is FTP?

FTP (File Transfer Protocol) for file access.

**Benefits**:
- Works with any FTP client
- Good for mobile/embedded devices
- Simple to set up
- Legacy protocol (SFTP is better for security)

### Enable FTP Service

```bash
API: POST /api/ftp/enable

Request:
{
  "port": 21,
  "passivePortRange": "6000:6100",
  "anonymous": false
}

Response:
{
  "success": true,
  "status": "enabled",
  "port": 21
}
```

### Create FTP User

```bash
API: POST /api/ftp/users

Request:
{
  "username": "john",
  "password": "securepass"
}

Response:
{
  "success": true,
  "user": {
    "username": "john",
    "homeDir": "/home/john",
    "restrictedToHome": true
  }
}
```

### Connect FTP Client

**Command Line** (Linux/Mac):
```bash
# Connect
ftp ftp.example.com

# Or specify username
ftp -u username ftp.example.com

# Commands
get filename.txt     # Download
put filename.txt     # Upload
cd dirname          # Change directory
ls                  # List files
quit                # Disconnect
```

**GUI Clients**:
- FileZilla (recommended)
- WinSCP (Windows)
- Cyberduck (Mac)

---

## Access Control

### Share Permissions

**Owner-based ACL**:
```json
{
  "owner": "admin",
  "group": "users",
  "permissions": {
    "owner": "rwx",       // 0700
    "group": "rwx",       // 0070
    "others": "rx"        // 0005
  }
}
```

**Web UI**: Shares → Edit → Permissions

### User Access Control

**Assign User to Share**:
```bash
API: PUT /api/shares/:id/access

Request:
{
  "user": "john",
  "permission": "read"  // read, write, admin
}
```

**Permission Levels**:
- **read**: Read-only access
- **write**: Read and write access
- **admin**: Full control + delete

### Per-Share Credentials

**SMB User Mapping**:
Users accessing SMB use their system login.

**FTP User Mapping**:
Each FTP user is a system user with home directory.

---

## Quotas & Limits

### Enable User Quota

```bash
API: PUT /api/shares/:id

Request:
{
  "quota": {
    "enabled": true,
    "limitGB": 100
  }
}
```

### Monitor Usage

```bash
API: GET /api/shares/:id

Response:
{
  "success": true,
  "share": {
    "id": "share-123",
    "name": "Photos",
    "quota": {
      "enabled": true,
      "limitGB": 100,
      "usedGB": 45.5,
      "percentUsed": 45.5
    }
  }
}
```

### Bandwidth Limits (FTP)

Per-user bandwidth limits prevent hogging:
```bash
API: PUT /api/ftp/users/:username

Request:
{
  "bandwidthLimitKbps": 1024  // 1 Mbps
}
```

---

## Best Practices

### Performance
1. **Use NFS for Linux clients** (faster than SMB)
2. **Tune block sizes** for network conditions
3. **Use redundant disks** for share storage
4. **Monitor usage** to plan capacity

### Security
1. **Use strong passwords** for FTP users
2. **Enable SMB signing** (SMB3 default)
3. **Restrict network access** via firewall
4. **Use VPN** for remote access
5. **Disable anonymous** FTP access

### Reliability
1. **Backup shared data** regularly
2. **Monitor share usage** and quotas
3. **Test recovery** process
4. **Keep services updated**

---

**Last Updated**: May 13, 2026  
**Module Status**: ✅ Production Ready
