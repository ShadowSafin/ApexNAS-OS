# ApexNAS API Reference

Complete reference for all ApexNAS REST API endpoints, organized by module.

## Table of Contents
- [Authentication](#authentication)
- [System APIs](#system-apis)
- [Storage APIs](#storage-apis)
- [RAID APIs](#raid-apis)
- [Shares APIs](#shares-apis)
- [Apps APIs](#apps-apis)
- [Users & Permissions APIs](#users--permissions-apis)
- [Error Handling](#error-handling)

---

## Authentication

### POST /api/auth/login
Authenticate user and receive JWT token.

**Request:**
```json
{
  "username": "admin",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600,
  "user": {
    "id": "user-123",
    "username": "admin",
    "role": "admin"
  }
}
```

**Errors:**
- `401` - Invalid credentials
- `429` - Too many login attempts (rate limited)

---

### POST /api/auth/refresh
Get new access token using refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600
}
```

---

### GET /api/auth/me
Get current user information.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "user-123",
    "username": "admin",
    "role": "admin",
    "createdAt": "2026-01-01T00:00:00Z"
  }
}
```

---

### POST /api/auth/logout
Invalidate current session.

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## System APIs

### GET /api/system/health
System health check (no auth required for monitoring).

**Response (200):**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2026-05-13T10:30:00Z",
  "uptime": 864000,
  "services": {
    "api": "running",
    "docker": "running",
    "smb": "running",
    "nfs": "running",
    "ftp": "running"
  }
}
```

---

### GET /api/system/info
Get system information and resource usage.

**Response (200):**
```json
{
  "success": true,
  "system": {
    "hostname": "apexnas",
    "uptime": 864000,
    "kernel": "5.15.0-91-generic",
    "platform": "linux"
  },
  "cpu": {
    "cores": 4,
    "usage": 23.5,
    "model": "Intel(R) Core(TM) i7-8700K"
  },
  "memory": {
    "total": 8589934592,
    "used": 2147483648,
    "available": 6442450944,
    "usagePercent": 25
  },
  "disk": {
    "total": 1099511627776,
    "used": 274877906944,
    "available": 824633720832,
    "usagePercent": 25
  }
}
```

---

### GET /api/system/version
Get version information.

**Response (200):**
```json
{
  "success": true,
  "version": "1.0.0",
  "apiVersion": "v1",
  "buildDate": "2026-05-13",
  "nodeVersion": "18.16.0"
}
```

---

## Storage APIs

### GET /api/storage/info
Get overall storage information.

**Response (200):**
```json
{
  "success": true,
  "storage": {
    "totalSize": 1099511627776,
    "usedSize": 274877906944,
    "availableSize": 824633720832,
    "usagePercent": 25,
    "devices": 4,
    "mounted": 3,
    "raidArrays": 2
  }
}
```

---

### GET /api/storage/devices
List all storage devices.

**Response (200):**
```json
{
  "success": true,
  "devices": [
    {
      "name": "sda",
      "size": 1099511627776,
      "type": "disk",
      "status": "active",
      "partitions": [
        {
          "name": "sda1",
          "size": 107374182400,
          "type": "partition",
          "mountPoint": "/",
          "filesystem": "ext4"
        }
      ]
    }
  ]
}
```

---

### GET /api/storage/mounts
List all mounted filesystems.

**Response (200):**
```json
{
  "success": true,
  "mounts": [
    {
      "device": "/dev/sda1",
      "mountPoint": "/",
      "filesystem": "ext4",
      "options": "rw,relatime",
      "size": 107374182400,
      "used": 26843545600,
      "available": 80530636800
    },
    {
      "device": "/dev/md0",
      "mountPoint": "/mnt/storage",
      "filesystem": "ext4",
      "options": "rw",
      "size": 1099511627776,
      "used": 274877906944,
      "available": 824633720832
    }
  ]
}
```

---

## RAID APIs

### GET /api/raid/list
List all RAID arrays.

**Response (200):**
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
      "totalDevices": 2,
      "creationTime": "2026-04-01T12:34:56Z"
    }
  ]
}
```

---

### POST /api/raid/create
Create a new RAID array.

**Request:**
```json
{
  "name": "md0",
  "level": "raid1",
  "devices": ["/dev/sdb1", "/dev/sdc1"],
  "simulation": true,
  "confirm": ""
}
```

**Response (200) - Simulation:**
```json
{
  "success": true,
  "simulation": true,
  "command": "mdadm --create /dev/md0 --level=raid1 --raid-devices=2 /dev/sdb1 /dev/sdc1",
  "validated": true,
  "message": "Simulation successful - array would be created"
}
```

**Response (200) - Real Creation:**
```json
{
  "success": true,
  "created": true,
  "name": "/dev/md0",
  "level": "raid1",
  "devices": ["/dev/sdb1", "/dev/sdc1"],
  "message": "RAID array created successfully"
}
```

---

### POST /api/raid/stop
Stop a RAID array.

**Request:**
```json
{
  "name": "md0",
  "simulation": true
}
```

**Response (200) - Simulation:**
```json
{
  "success": true,
  "simulation": true,
  "command": "mdadm --stop /dev/md0",
  "message": "Array would be stopped"
}
```

---

### DELETE /api/raid/remove
Remove RAID metadata from devices (DESTRUCTIVE).

**Request:**
```json
{
  "device": "/dev/sdb1",
  "confirm": "YES_DESTROY_DATA"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "RAID metadata removed from /dev/sdb1"
}
```

**Note:** Requires exact confirmation token.

---

### GET /api/raid/:name/status
Get status of specific RAID array.

**Response (200):**
```json
{
  "success": true,
  "name": "/dev/md0",
  "level": "raid1",
  "status": "active",
  "health": "degraded",
  "rebuildProgress": 45.5,
  "rebuildSpeed": "50MB/s",
  "estimatedTimeRemaining": 3600,
  "devices": [...]
}
```

---

## Shares APIs

### GET /api/shares/list
List all shares (SMB, NFS, FTP).

**Response (200):**
```json
{
  "success": true,
  "shares": [
    {
      "id": "share-123",
      "name": "Media",
      "description": "Media library",
      "path": "/mnt/storage/media",
      "protocols": ["smb", "nfs"],
      "permissions": {
        "owner": "admin",
        "group": "users",
        "mode": "0755"
      },
      "quota": {
        "enabled": false,
        "limitGB": 0
      },
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ]
}
```

---

### POST /api/shares/create
Create a new share.

**Request:**
```json
{
  "name": "Media",
  "description": "Media library",
  "path": "/mnt/storage/media",
  "protocols": ["smb", "nfs"],
  "permissions": {
    "mode": "0755"
  },
  "quota": {
    "enabled": false
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "share": {
    "id": "share-123",
    "name": "Media",
    ...
  }
}
```

---

### PUT /api/shares/:id
Update an existing share.

**Request:** Same as create.

**Response (200):** Updated share object.

---

### DELETE /api/shares/:id
Delete a share.

**Response (200):**
```json
{
  "success": true,
  "message": "Share deleted successfully"
}
```

---

## Apps APIs

### GET /api/apps/catalog
Get list of available apps from marketplace.

**Response (200):**
```json
{
  "success": true,
  "apps": [
    {
      "id": "plex",
      "name": "Plex Media Server",
      "description": "Stream movies and music to all your devices",
      "image": "plexinc/pms-docker:latest",
      "icon": "https://...",
      "category": "media",
      "ports": [
        {"host": 32400, "container": 32400, "protocol": "tcp"}
      ],
      "volumes": [
        {
          "host": "/mnt/storage/media/plex",
          "container": "/config",
          "mode": "rw"
        }
      ],
      "environment": [...],
      "featured": true
    }
  ]
}
```

---

### POST /api/apps/install
Install an app from marketplace.

**Request:**
```json
{
  "appId": "plex"
}
```

**Response (201):**
```json
{
  "success": true,
  "containerId": "container-xyz",
  "status": "installing",
  "message": "App installation started"
}
```

---

### GET /api/apps/installed
List currently installed apps.

**Response (200):**
```json
{
  "success": true,
  "apps": [
    {
      "id": "plex-installed",
      "containerId": "abc123def456",
      "name": "Plex Media Server",
      "image": "plexinc/pms-docker:latest",
      "status": "running",
      "ports": [
        {"host": 32400, "container": 32400}
      ],
      "volumes": [...],
      "installedAt": "2026-05-10T15:30:00Z"
    }
  ]
}
```

---

### POST /api/apps/start/:id
Start a container.

**Response (200):**
```json
{
  "success": true,
  "status": "running",
  "message": "Container started"
}
```

---

### POST /api/apps/stop/:id
Stop a running container.

**Response (200):**
```json
{
  "success": true,
  "status": "stopped",
  "message": "Container stopped"
}
```

---

### DELETE /api/apps/remove/:id
Completely remove an installed app.

**Query Parameters:**
- `removeVolumes` (boolean) - Also delete app data volumes

**Response (200):**
```json
{
  "success": true,
  "message": "App removed successfully"
}
```

---

### GET /api/apps/search/dockerhub
Search Docker Hub for images.

**Query Parameters:**
- `q` (required) - Search query
- `limit` (optional) - Results per page (default: 10)

**Response (200):**
```json
{
  "success": true,
  "results": [
    {
      "name": "nginx",
      "description": "Official build of Nginx",
      "starCount": 18000,
      "pullCount": 1000000000,
      "isOfficial": true,
      "automated": false
    }
  ]
}
```

---

### POST /api/apps/install-dockerhub
Install app from Docker Hub with custom configuration.

**Request:**
```json
{
  "image": "nginx:latest",
  "name": "my-nginx",
  "ports": [
    {"host": 8080, "container": 80}
  ],
  "volumes": [
    {
      "host": "/mnt/storage/nginx",
      "container": "/usr/share/nginx/html",
      "mode": "rw"
    }
  ],
  "environment": {
    "NGINX_HOST": "example.com"
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "containerId": "container-abc",
  "status": "running"
}
```

---

## Users & Permissions APIs

### GET /api/users/list
List all users.

**Response (200):**
```json
{
  "success": true,
  "users": [
    {
      "id": "user-123",
      "username": "admin",
      "role": "admin",
      "createdAt": "2026-01-01T00:00:00Z",
      "lastLoggedIn": "2026-05-13T10:30:00Z"
    }
  ]
}
```

---

### POST /api/users/create
Create a new user.

**Request:**
```json
{
  "username": "john",
  "password": "securepassword",
  "role": "user"
}
```

**Response (201):**
```json
{
  "success": true,
  "user": {
    "id": "user-456",
    "username": "john",
    "role": "user"
  }
}
```

---

### PUT /api/users/:id
Update user information.

**Request:**
```json
{
  "role": "admin",
  "password": "newpassword"
}
```

**Response (200):** Updated user object.

---

### DELETE /api/users/:id
Delete a user.

**Response (200):**
```json
{
  "success": true,
  "message": "User deleted"
}
```

---

### GET /api/permissions/list
List all permissions/roles.

**Response (200):**
```json
{
  "success": true,
  "permissions": {
    "admin": {
      "description": "Full system access",
      "permissions": ["read", "write", "delete", "manage_users"]
    },
    "user": {
      "description": "Standard user access",
      "permissions": ["read", "write"]
    }
  }
}
```

---

## Error Handling

All error responses follow this format:

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human readable error message",
  "details": {}
}
```

### Common Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `INVALID_INPUT` | 400 | Validation error |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `UNSAFE_OPERATION` | 400 | Operation blocked by safety guard |
| `CONFIRMATION_REQUIRED` | 400 | Destructive op requires confirmation token |
| `DEVICE_MOUNTED` | 400 | Cannot operate on mounted device |
| `INTERNAL_ERROR` | 500 | Server error |

### Validation Error Example

```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Input validation failed",
  "details": {
    "fields": {
      "devices": "At least 2 devices required for RAID"
    }
  }
}
```

---

## Rate Limiting

- **Login**: 5 attempts per minute
- **General API**: 100 requests per minute per user
- **File Operations**: 10 concurrent uploads

After limit exceeded: `429 Too Many Requests`

---

## Response Headers

All responses include:
```
Content-Type: application/json
X-Request-ID: <unique-id>
X-Response-Time: <milliseconds>
```

---

**Last Updated**: May 13, 2026  
**API Version**: v1.0.0
