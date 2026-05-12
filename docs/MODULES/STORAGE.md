# ApexNAS Storage Module Documentation

Complete guide to storage management including disks and filesystems.

## Table of Contents
- [Overview](#overview)
- [Disk Management](#disk-management)

- [Mounting Filesystems](#mounting-filesystems)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Storage module provides comprehensive disk management with safety-first design:

- **Disk Operations**: Create partitions, format filesystems, mount/unmount

- **Filesystem Management**: Support for ext4, xfs, btrfs
- **Automatic Persistence**: Mounts persisted in fstab with boot safety
- **Safety Mechanisms**: Simulation mode, confirmations, rollback on failure

### Key Features

**Safety**:
- Cannot format mounted partitions
- Cannot destroy disks with active mounts
- Atomic fstab writes (never corrupted)
- Transaction rollback (mount with fstab atomicity)
- File locking for concurrent access

**Monitoring**:
- SMART health status

- Mount point tracking
- Capacity monitoring

---

## Disk Management

### Disk Partitioning

#### View Available Devices
```bash
API: GET /api/storage/devices
```

Returns list of all block devices with partition information.

**Web UI**: Storage → Devices tab

#### Create Partition
```bash
API: POST /api/storage/partitions/create

Request:
{
  "device": "/dev/sdb",
  "size": 1000,           // GB
  "label": "data1"
}

Response:
{
  "success": true,
  "partition": "/dev/sdb1",
  "size": 1099511627776  // bytes
}
```

**Constraints**:
- Device must not be mounted
- Cannot partition system disk
- Requires confirmation for destructive operations

#### Delete Partition
```bash
API: POST /api/storage/partitions/delete

Request:
{
  "partition": "/dev/sdb1",
  "confirm": "YES_DESTROY_DATA"
}

Response:
{
  "success": true,
  "message": "Partition deleted"
}
```

**Warning**: This is destructive and cannot be undone!

---

### Filesystem Creation

#### Create Filesystem
```bash
API: POST /api/storage/format

Request:
{
  "partition": "/dev/sdb1",
  "filesystem": "ext4",      // ext4, xfs, btrfs
  "label": "storage",
  "simulation": true         // Preview command first
}

Response (simulation):
{
  "success": true,
  "simulation": true,
  "command": "mkfs.ext4 -L storage -F /dev/sdb1",
  "message": "Format command preview"
}
```

**Supported Filesystems**:
- **ext4**: Default, stable, widely compatible
- **xfs**: High performance, good for large files
- **btrfs**: Advanced features (snapshots, compression)

**Recommendations**:
- ext4 for general use
- xfs for high-performance workloads
- btrfs for advanced features (requires more knowledge)

---

### Mounting Filesystems

#### Mount Partition
```bash
API: PUT /api/storage/mount/:partition

Request:
{
  "mountPoint": "/mnt/storage/data1",
  "options": "defaults,noatime"  // fstab options
}

Response:
{
  "success": true,
  "mounted": true,
  "mountPoint": "/mnt/storage/data1",
  "size": 1099511627776,
  "used": 0
}
```

**Mount Options**:
- `defaults`: Standard options
- `noatime`: Don't update access time (improves performance)
- `discard`: Enable TRIM on SSD
- `nofail`: Don't fail boot if device missing

**Safety Mechanisms**:
1. Partition unmounted (if previously mounted)
2. Mount attempted
3. If successful, addition to fstab attempted
4. If fstab fails, original mount is rolled back
5. Result: Either fully mounted or fully rolled back (never partial)

#### Unmount Partition
```bash
API: DELETE /api/storage/mount/:partition

Response:
{
  "success": true,
  "unmounted": true,
  "removedFromFstab": true
}
```

#### View Mounts
```bash
API: GET /api/storage/mounts

Response:
{
  "success": true,
  "mounts": [
    {
      "device": "/dev/sdb1",
      "mountPoint": "/mnt/storage/data1",
      "filesystem": "ext4",
      "options": "rw,noatime",
      "size": 1099511627776,
      "used": 274877906944,
      "available": 824633720832,
      "usagePercent": 25
    }
  ]
}
```

---

### Storage Planning
1. **Match Disks**: Use identical or similar capacity disks
2. **Plan Capacity**: Build for growth (don't partition all space)

### Maintenance
```bash
# Schedule regular backups
# (Disks can fail, protect your data)
```

### Monitoring SMART Status
```bash
# Install smartmontools
sudo apt install smartmontools

# Check disk health
sudo smartctl -a /dev/sdb1

# Schedule SMART checks
# (Handled by frontend monitoring)
```

---

## Troubleshooting



---

**Last Updated**: May 13, 2026  
**Module Status**: ✅ Production Ready
