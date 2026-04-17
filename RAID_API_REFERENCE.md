# RAID Module - API Reference Guide

**Version**: 1.0  
**Status**: ✅ Production Ready  
**Safety Level**: CRITICAL

---

## Base URL

```
/api/raid
```

---

## Endpoints

### 1. GET /api/raid/list

List all RAID arrays on the system.

**Request**:
```bash
GET /api/raid/list
```

**Response** (200 OK):
```json
{
  "success": true,
  "arrays": [
    {
      "name": "/dev/md0",
      "status": "active",
      "level": "raid1",
      "devices": [
        {
          "name": "/dev/sdb1",
          "index": 0,
          "status": "active"
        },
        {
          "name": "/dev/sdc1",
          "index": 1,
          "status": "active"
        }
      ],
      "health": "healthy",
      "rebuildProgress": null,
      "activeDevices": 2,
      "uuid": "12345678:abcdef01:...",
      "creationTime": "2026-04-01T12:34:56Z"
    }
  ],
  "count": 1
}
```

**Notes**:
- Read-only endpoint
- No confirmation needed
- Returns all arrays with current status

---

### 2. POST /api/raid/create

Create a new RAID array (with safety-first defaults).

**Request**:
```bash
POST /api/raid/create
Content-Type: application/json

{
  "name": "md0",
  "level": "raid1",
  "devices": ["/dev/sdb1", "/dev/sdc1"],
  "simulation": true,
  "confirm": ""
}
```

**Request Fields**:

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| name | string | Yes | - | Format: `mdN` (e.g., md0, md1) |
| level | string | Yes | - | One of: raid0, raid1, raid5, raid6 |
| devices | array | Yes | - | Array of device paths (min 2-4 depending on level) |
| simulation | boolean | No | true | If true, dry-run (no changes) |
| confirm | string | No | "" | Required if `simulation: false`. Must be `"YES_DESTROY_DATA"` |

**Response - Simulation Mode** (200 OK):
```json
{
  "success": true,
  "simulation": true,
  "command": "mdadm --create /dev/md0 --level=raid1 --raid-devices=2 /dev/sdb1 /dev/sdc1",
  "validated": true,
  "warnings": [],
  "message": "Simulation successful - no arrays created"
}
```

**Response - Real Execution** (200 OK):
```json
{
  "success": true,
  "created": true,
  "name": "/dev/md0",
  "level": "raid1",
  "devices": ["/dev/sdb1", "/dev/sdc1"],
  "message": "RAID raid1 array md0 created"
}
```

**Response - Validation Error** (400 Bad Request):
```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "errors": [
    "INVALID_RAID_LEVEL: raid99 not supported",
    "INSUFFICIENT_DEVICES: raid1 requires minimum 2 devices, got 1"
  ],
  "warnings": []
}
```

**Response - Blocked by Guard** (500 Internal Server Error):
```json
{
  "success": false,
  "error": "UNSAFE_OPERATION",
  "message": "Operation blocked by safety guard",
  "errors": [
    "DEVICE_MOUNTED: /dev/sdb1 is currently mounted at /mnt/data",
    "UNSAFE_OPERATION: /dev/sdc1 is the system disk"
  ],
  "checks": {
    "device_/dev/sdb1": { "valid": false, "errors": ["DEVICE_MOUNTED"] },
    "device_/dev/sdc1": { "valid": false, "errors": ["UNSAFE_OPERATION"] }
  }
}
```

**Response - Missing Confirmation** (400 Bad Request):
```json
{
  "success": false,
  "error": "CONFIRMATION_REQUIRED",
  "message": "Confirmation token required for real operations"
}
```

**Examples**:

```bash
# 1. SAFE: Simulation mode (default)
curl -X POST http://localhost:3000/api/raid/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "md0",
    "level": "raid1",
    "devices": ["/dev/sdb1", "/dev/sdc1"]
  }'
# → Returns command preview, no changes made

# 2. REAL: Authorized execution
curl -X POST http://localhost:3000/api/raid/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "md0",
    "level": "raid1",
    "devices": ["/dev/sdb1", "/dev/sdc1"],
    "simulation": false,
    "confirm": "YES_DESTROY_DATA"
  }'
# → Creates real RAID array

# 3. BLOCKED: Missing confirmation
curl -X POST http://localhost:3000/api/raid/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "md0",
    "level": "raid1",
    "devices": ["/dev/sdb1", "/dev/sdc1"],
    "simulation": false
  }'
# → Error: CONFIRMATION_REQUIRED
```

---

### 3. POST /api/raid/stop

Stop a RAID array.

**Request**:
```bash
POST /api/raid/stop
Content-Type: application/json

{
  "name": "md0",
  "simulation": true
}
```

**Request Fields**:

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| name | string | Yes | - | Format: `/dev/mdN` or `mdN` |
| simulation | boolean | No | true | If true, dry-run (no changes) |

**Response - Simulation** (200 OK):
```json
{
  "success": true,
  "simulation": true,
  "command": "mdadm --stop /dev/md0",
  "message": "Array /dev/md0 would be stopped"
}
```

**Response - Real Execution** (200 OK):
```json
{
  "success": true,
  "stopped": true,
  "name": "/dev/md0",
  "message": "Array /dev/md0 stopped"
}
```

---

### 4. DELETE /api/raid/remove

Remove RAID metadata from devices (VERY DESTRUCTIVE).

**Request**:
```bash
DELETE /api/raid/remove
Content-Type: application/json

{
  "devices": ["/dev/sdb1", "/dev/sdc1"],
  "simulation": true,
  "confirm": ""
}
```

**Request Fields**:

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| devices | array | Yes | - | Devices to remove metadata from |
| simulation | boolean | No | true | If true, dry-run (no changes) |
| confirm | string | No | "" | Required if `simulation: false`: `"YES_DESTROY_DATA"` |

**Response - Simulation** (200 OK):
```json
{
  "success": true,
  "simulation": true,
  "commands": [
    "mdadm --zero-superblock /dev/sdb1",
    "mdadm --zero-superblock /dev/sdc1"
  ],
  "message": "Metadata would be removed from 2 device(s)"
}
```

**Response - Real Execution** (200 OK):
```json
{
  "success": true,
  "removed": true,
  "results": [
    { "device": "/dev/sdb1", "success": true },
    { "device": "/dev/sdc1", "success": true }
  ],
  "message": "Metadata removed from 2 device(s)"
}
```

⚠️ **WARNING**: This command is DESTRUCTIVE and irreversible. Metadata removal allows devices to be reused in other arrays or formatted.

---

### 5. GET /api/raid/status/:name

Get detailed status of a specific RAID array.

**Request**:
```bash
GET /api/raid/status/md0
```

**Response** (200 OK):
```json
{
  "success": true,
  "array": {
    "name": "/dev/md0",
    "status": "active",
    "level": "raid1",
    "devices": [
      { "name": "/dev/sdb1", "index": 0, "status": "active" },
      { "name": "/dev/sdc1", "index": 1, "status": "active" }
    ],
    "health": "healthy",
    "rebuildProgress": null,
    "activeDevices": 2,
    "workingDevices": 2,
    "uuid": "12345678:abcdef01:...",
    "eventCount": 42
  }
}
```

**Response - Not Found** (404 Not Found):
```json
{
  "success": false,
  "error": "ARRAY_NOT_FOUND",
  "message": "Array /dev/md0 not found"
}
```

---

## RAID Level Reference

### RAID 0 (Striping)
- **Min devices**: 2
- **Capacity**: Sum of all devices
- **Redundancy**: None (single failure = total loss)
- **Use case**: Temporary storage, high performance (no redundancy)

### RAID 1 (Mirroring)
- **Min devices**: 2
- **Capacity**: Capacity of one device
- **Redundancy**: 1 device can fail
- **Use case**: Critical data, maximum redundancy

### RAID 5 (Striping + Parity)
- **Min devices**: 3
- **Capacity**: (n-1) × device size
- **Redundancy**: 1 device can fail
- **Use case**: Good balance of performance, capacity, and redundancy

### RAID 6 (Dual Parity)
- **Min devices**: 4
- **Capacity**: (n-2) × device size
- **Redundancy**: 2 devices can fail
- **Use case**: Large arrays, maximum safety

---

## Safety Rules (MANDATORY)

### Rule 1: Simulation First
Always test with `simulation: true` before real execution.

```bash
# Step 1: Verify the command
{ "simulation": true }

# Step 2: After confirmation, execute
{ "simulation": false, "confirm": "YES_DESTROY_DATA" }
```

### Rule 2: Confirmation Tokens
Never remove the confirmation requirement:

```bash
# ❌ NEVER do this programmatically
{ "simulation": false }  // Missing confirm - will be rejected

# ✅ ALWAYS require explicit user confirmation
```

### Rule 3: Check Devices First

Before creating RAID:
1. Verify devices with `lsblk` or `fdisk -l`
2. Confirm devices are NOT mounted
3. Confirm devices are NOT in another RAID
4. Run in simulation mode first

### Rule 4: Backup Important Data
Before executing destructive operations:
1. Backup all important data
2. Have recovery procedures ready
3. Test recovery procedures
4. Only then execute

---

## Error Responses

### 400 Bad Request

```json
{
  "success": false,
  "error": "VALIDATION_ERROR|CONFIRMATION_REQUIRED",
  "errors": ["Error description"],
  "warnings": ["Warning description"]
}
```

### 404 Not Found

```json
{
  "success": false,
  "error": "ARRAY_NOT_FOUND",
  "message": "Array /dev/md0 not found"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "error": "CREATE_ERROR|STOP_ERROR|REMOVE_ERROR|UNSAFE_OPERATION",
  "message": "Error description",
  "errors": ["Specific errors"]
}
```

---

## Code Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

// 1. List arrays
const listArrays = async () => {
  try {
    const response = await axios.get('http://localhost:3000/api/raid/list');
    console.log('Arrays:', response.data.arrays);
  } catch (error) {
    console.error('Error listing arrays:', error.response.data);
  }
};

// 2. Simulate RAID creation
const simulateCreate = async () => {
  try {
    const response = await axios.post(
      'http://localhost:3000/api/raid/create',
      {
        name: 'md0',
        level: 'raid1',
        devices: ['/dev/sdb1', '/dev/sdc1'],
        simulation: true
      }
    );
    console.log('Command would be:', response.data.command);
  } catch (error) {
    console.error('Simulation failed:', error.response.data);
  }
};

// 3. Create with confirmation
const createWithConfirmation = async () => {
  const userConfirmed = await getUserConfirmation();
  
  if (!userConfirmed) {
    console.log('User cancelled operation');
    return;
  }

  try {
    const response = await axios.post(
      'http://localhost:3000/api/raid/create',
      {
        name: 'md0',
        level: 'raid1',
        devices: ['/dev/sdb1', '/dev/sdc1'],
        simulation: false,
        confirm: 'YES_DESTROY_DATA'
      }
    );
    console.log('RAID created:', response.data.name);
  } catch (error) {
    console.error('Creation failed:', error.response.data);
  }
};
```

### cURL

```bash
# List all arrays
curl http://localhost:3000/api/raid/list

# Simulate creation
curl -X POST http://localhost:3000/api/raid/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "md0",
    "level": "raid1",
    "devices": ["/dev/sdb1", "/dev/sdc1"],
    "simulation": true
  }'

# Create with confirmation
curl -X POST http://localhost:3000/api/raid/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "md0",
    "level": "raid1",
    "devices": ["/dev/sdb1", "/dev/sdc1"],
    "simulation": false,
    "confirm": "YES_DESTROY_DATA"
  }'

# Get array status
curl http://localhost:3000/api/raid/status/md0

# Stop array
curl -X POST http://localhost:3000/api/raid/stop \
  -H "Content-Type: application/json" \
  -d '{"name": "md0", "simulation": true}'

# Remove metadata
curl -X DELETE http://localhost:3000/api/raid/remove \
  -H "Content-Type: application/json" \
  -d '{
    "devices": ["/dev/sdb1", "/dev/sdc1"],
    "simulation": true
  }'
```

---

## Best Practices

1. **Always simulate first** - Use `simulation: true` before real operations
2. **Verify devices carefully** - Check device names, mount status, existing arrays
3. **Get explicit user confirmation** - Require `confirm: "YES_DESTROY_DATA"` for real ops
4. **Check array health** - Use `/status` endpoint before stopping arrays
5. **Plan for failure** - Have recovery procedures ready
6. **Log everything** - Keep records of all RAID operations
7. **Test in staging** - Never test on production first
8. **Document procedures** - Document your RAID setup and recovery procedures

---

## Troubleshooting

### "DEVICE_MOUNTED" Error
**Cause**: Device is currently mounted  
**Solution**: Unmount the device first with `umount /dev/deviceN`

### "DEVICE_IN_USE" Error
**Cause**: Device is already part of another RAID array  
**Solution**: Stop the other array first or use different devices

### "CONFIRMATION_REQUIRED" Error
**Cause**: Missing `confirm: "YES_DESTROY_DATA"`  
**Solution**: Add explicit confirmation if you really want to proceed

### "UNSAFE_OPERATION" Error
**Cause**: Device is system disk or contains root  
**Solution**: Use different devices that aren't critical to system operation

### "INSUFFICIENT_DEVICES" Error
**Cause**: Not enough devices for RAID level  
**Solution**: Add more devices or use lower RAID level

---

## Rate Limiting

**Recommended limits** (for production):
- List operations: 50 req/min
- Status operations: 50 req/min
- Create/Stop: 10 req/min
- Remove: 5 req/min

---

**Version**: 1.0  
**Last Updated**: April 2, 2026  
**Status**: ✅ Production Ready

