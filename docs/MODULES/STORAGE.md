# ApexNAS Storage Module Documentation

Complete guide to storage management including disks, RAID, and filesystems.

## Table of Contents
- [Overview](#overview)
- [Disk Management](#disk-management)
- [RAID Configuration](#raid-configuration)
- [Mounting Filesystems](#mounting-filesystems)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Storage module provides comprehensive disk and RAID management with safety-first design:

- **Disk Operations**: Create partitions, format filesystems, mount/unmount
- **RAID Arrays**: Create redundant storage with RAID 0, 1, 5, 6
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
- RAID rebuild progress
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

## RAID Configuration

### RAID Levels Explained

**RAID 0 (Striping)**:
- Data split across multiple disks
- Speed: Fast (sum of all disk speeds)
- Redundancy: None (1 disk failure = total loss)
- Use Case: Temporary cache, non-critical data
- Minimum Disks: 2

**RAID 1 (Mirroring)**:
- Data identical on 2+ disks
- Speed: Good (reads parallel, writes slower)
- Redundancy: Survives 1 disk failure
- Use Case: Most common for NAS
- Minimum Disks: 2

**RAID 5 (Striping with Parity)**:
- Data and parity distributed across 3+ disks
- Speed: Good (reads parallel)
- Redundancy: Survives 1 disk failure
- Use Case: Balance of speed and capacity
- Minimum Disks: 3
- Usable Capacity: (n-1) × diskSize

**RAID 6 (Dual Parity)**:
- Like RAID 5 but with 2 parity blocks
- Speed: Slightly slower than RAID 5
- Redundancy: Survives 2 disk failures
- Use Case: High reliability, large arrays
- Minimum Disks: 4
- Usable Capacity: (n-2) × diskSize

### Creating RAID Arrays

#### Create Array (Simulation First)
```bash
# Step 1: Preview (always safe)
API: POST /api/raid/create

Request:
{
  "name": "md0",
  "level": "raid1",
  "devices": ["/dev/sdb1", "/dev/sdc1"],
  "simulation": true,   // Just preview
  "confirm": ""
}

Response:
{
  "success": true,
  "simulation": true,
  "command": "mdadm --create /dev/md0 --level=raid1 --raid-devices=2 /dev/sdb1 /dev/sdc1",
  "validated": true,
  "warnings": []
}
```

#### Create Array (Real Execution)
```bash
# Step 2: After reviewing preview, execute
API: POST /api/raid/create

Request:
{
  "name": "md0",
  "level": "raid1",
  "devices": ["/dev/sdb1", "/dev/sdc1"],
  "simulation": false,
  "confirm": "YES_DESTROY_DATA"  // Exact token required
}

Response:
{
  "success": true,
  "created": true,
  "name": "/dev/md0",
  "level": "raid1",
  "devices": ["/dev/sdb1", "/dev/sdc1"],
  "message": "RAID array created successfully"
}
```

### RAID Monitoring

#### List All Arrays
```bash
API: GET /api/raid/list

Response:
{
  "success": true,
  "arrays": [
    {
      "name": "/dev/md0",
      "status": "active",
      "level": "raid1",
      "health": "healthy",
      "devices": [
        {
          "name": "/dev/sdb1",
          "status": "active"
        },
        {
          "name": "/dev/sdc1",
          "status": "active"
        }
      ],
      "activeDevices": 2,
      "totalDevices": 2,
      "rebuildProgress": null
    }
  ]
}
```

#### Check Array Status
```bash
API: GET /api/raid/:name/status

Example: GET /api/raid/md0/status

Response:
{
  "success": true,
  "name": "/dev/md0",
  "status": "active",
  "health": "degraded",    // degraded if disk missing
  "rebuildProgress": 45.5,
  "rebuildSpeed": "50MB/s",
  "estimatedTimeRemaining": 3600
}
```

### RAID Recovery

#### Device Failure
If a device fails (rebuilding):
1. Array continues operating (with reduced redundancy)
2. Rebuild starts automatically
3. Replace failed drive with new one
4. Array rebuilds onto new drive
5. Status returns to "healthy"

#### Add Replacement Device
```bash
API: POST /api/raid/:name/add

Request:
{
  "device": "/dev/sdd1"
}

Response:
{
  "success": true,
  "message": "Device added to array"
}
```

#### Remove Faulty Device (if needed)
```bash
API: POST /api/raid/:name/remove

Request:
{
  "device": "/dev/sdc1",
  "force": false
}
```

### Stopping & Removing Arrays

#### Stop Array
```bash
API: POST /api/raid/stop

Request:
{
  "name": "md0",
  "simulation": true    // Always preview first
}

Response:
{
  "success": true,
  "simulation": true,
  "command": "mdadm --stop /dev/md0",
  "message": "Array would be stopped"
}
```

**Safety Checks**:
- Cannot stop if array is mounted
- Requires unmount first

#### Remove Array (Destructive)
```bash
API: DELETE /api/raid/remove

Request:
{
  "device": "/dev/sdb1",
  "confirm": "YES_DESTROY_DATA"  // Must provide token
}

Response:
{
  "success": true,
  "message": "RAID metadata removed"
}
```

**Warning**: Destroys RAID metadata, data becomes inaccessible!

---

## Best Practices

### Array Planning
1. **Choose Right RAID**: RAID 1 for most use cases
2. **Match Disks**: Use identical or similar capacity disks
3. **Distribute Types**: Mix old/new to detect failures
4. **Plan Capacity**: Build for growth (don't partition all space)

### Performance
- RAID 1: Best for NAS (good read/write balance)
- RAID 5: Good for larger arrays (3+ disks)
- RAID 6: Large arrays with high availability needs
- Avoid RAID 0: Risk of total failure

### Maintenance
```bash
# Monitor RAID health
cat /proc/mdstat

# Check for degraded arrays
sudo mdadm --detail /dev/md0

# Schedule regular backups
# (Array protects against disk failure, not data loss)
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

### Array Not Starting After Reboot
```bash
# Manually assemble
sudo mdadm --assemble --scan

# Check /etc/mdadm/mdadm.conf
sudo mdadm --detail --scan | sudo tee -a /etc/mdadm/mdadm.conf
```

### Degraded Array
```bash
# Check status
cat /proc/mdstat

# Watch rebuild
watch cat /proc/mdstat

# If stuck, check for errors
sudo journalctl -u mdadm -f
```

### Slow Rebuild
See [docs/TROUBLESHOOTING.md#RAID-Rebuild-Too-Slow](../TROUBLESHOOTING.md#raid-rebuild-too-slow)

---

**Last Updated**: May 13, 2026  
**Module Status**: ✅ Production Ready
