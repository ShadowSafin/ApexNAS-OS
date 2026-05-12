# ApexNAS Apps Module Documentation

Guide to installing and managing Docker applications through the marketplace.

## Table of Contents
- [Apps Overview](#apps-overview)
- [Marketplace Catalog](#marketplace-catalog)
- [Installing Apps](#installing-apps)
- [Managing Containers](#managing-containers)
- [Docker Hub Integration](#docker-hub-integration)
- [Security](#security)

---

## Apps Overview

ApexNAS provides Docker-based application deployment with two options:

**Marketplace** (Recommended)
- Pre-curated, tested applications
- One-click installation
- Pre-configured with safe defaults
- Best for most users

**Docker Hub** (Advanced)
- Any Docker image available
- Custom configuration
- More flexibility, less safety
- For advanced users

---

## Marketplace Catalog

### Pre-Approved Applications

Seven production-ready applications pre-installed:

| App | Purpose | Ports | Storage |
|-----|---------|-------|---------|
| **Plex** | Media streaming | 32400 | /config, /media |
| **Nextcloud** | File sync & productivity | 80, 443 | /config, /data |
| **Jellyfin** | Open media server | 80, 443 | /config, /media |
| **Syncthing** | File synchronization | 8384, 22000 | /data |
| **Vaultwarden** | Password manager | 80 | /data |
| **Home Assistant** | Home automation | 8123 | /config |
| **Portainer** | Docker management | 9000 | /data |

### View Available Apps

```bash
API: GET /api/apps/catalog

Response:
{
  "success": true,
  "apps": [
    {
      "id": "plex",
      "name": "Plex Media Server",
      "description": "Stream movies and music to all your devices",
      "image": "plexinc/pms-docker:latest",
      "category": "media",
      "ports": [
        {
          "host": 32400,
          "container": 32400,
          "protocol": "tcp",
          "description": "Remote Access Port"
        }
      ],
      "volumes": [
        {
          "host": "/mnt/storage/plex/config",
          "container": "/config",
          "description": "Configuration"
        },
        {
          "host": "/mnt/storage/media",
          "container": "/media",
          "description": "Media Library"
        }
      ],
      "environment": [
        {
          "key": "PLEX_CLAIM",
          "description": "Claim token from plex.tv"
        }
      ],
      "featured": true
    }
  ]
}
```

---

## Installing Apps

### Install from Marketplace

**Step 1: Browse Catalog**
```bash
API: GET /api/apps/catalog
# See list above
```

**Step 2: Install App**
```bash
API: POST /api/apps/install

Request:
{
  "appId": "plex",
  "overrides": {
    "ports": [
      {
        "host": 32401,  // Optional: custom host port
        "container": 32400
      }
    ],
    "environment": {
      "PLEX_CLAIM": "claim-token-from-plex-tv"
    }
  }
}

Response:
{
  "success": true,
  "containerId": "abc123def456",
  "status": "installing",
  "message": "App installation started..."
}
```

**Step 3: Wait for Installation**
```bash
API: GET /api/apps/installed

# Poll until status changes to "running"
```

### Installation Process

```
1. Pull Docker image (download from registry)
2. Create volume directories
3. Create and start container
4. Configure port mappings
5. Wait for container to be healthy
6. Records app in state file
7. Ready for use!
```

**Prerequisites**:
- Docker daemon running
- Sufficient disk space (50GB free minimum)
- Network connectivity (for image download)
- Required ports available (no conflicts)

---

## Managing Containers

### List Installed Apps

```bash
API: GET /api/apps/installed

Response:
{
  "success": true,
  "apps": [
    {
      "id": "plex-official",
      "containerId": "abc123def456ab",
      "name": "Plex Media Server",
      "image": "plexinc/pms-docker:latest",
      "status": "running",
      "ports": [
        {
          "host": 32400,
          "container": 32400,
          "protocol": "tcp"
        }
      ],
      "volumes": [
        {
          "host": "/mnt/storage/plex/config",
          "container": "/config"
        }
      ],
      "cpuUsage": "2.5%",
      "memoryUsage": "256MB",
      "installedAt": "2026-05-10T15:30:00Z"
    }
  ]
}
```

### Start Container

```bash
API: POST /api/apps/start/:containerId

Response:
{
  "success": true,
  "status": "running",
  "message": "Container started"
}
```

### Stop Container

```bash
API: POST /api/apps/stop/:containerId

Response:
{
  "success": true,
  "status": "stopped",
  "message": "Container stopped"
}
```

### Remove Container

```bash
API: DELETE /api/apps/remove/:containerId

Request:
{
  "removeVolumes": false  // true to delete app data
}

Response:
{
  "success": true,
  "message": "Container removed"
}
```

**Warning**: If `removeVolumes: true`, app data is deleted!

### View Container Logs

```bash
# Via CLI
docker logs -f <container_id>

# Last 100 lines
docker logs --tail 100 <container_id>
```

### Get App Details

```bash
API: GET /api/apps/<appId>

Response:
{
  "success": true,
  "app": {
    "id": "plex-official",
    "containerId": "abc123def456",
    "status": "running",
    "healthStatus": "healthy",
    "ports": [...],
    "volumes": [...],
    "environment": {...},
    "resources": {
      "cpuUsage": "2.5%",
      "memoryUsage": "256MB"
    },
    "url": "http://localhost:32400"
  }
}
```

---

## Docker Hub Integration

### Search Docker Hub

```bash
API: GET /api/apps/search/dockerhub

Query Parameters:
- q (required): Search query
- limit (optional): Results per page (default 10)

Example: GET /api/apps/search/dockerhub?q=nginx&limit=20

Response:
{
  "success": true,
  "results": [
    {
      "name": "nginx",
      "description": "Official build of Nginx",
      "starCount": 18000,
      "pullCount": 1000000000,
      "isOfficial": true,
      "automated": false,
      "lastUpdated": "2026-05-10T00:00:00Z"
    }
  ]
}
```

### Install from Docker Hub

```bash
API: POST /api/apps/install-dockerhub

Request:
{
  "image": "nginx:latest",
  "name": "my-webserver",
  "ports": [
    {
      "host": 8080,
      "container": 80,
      "protocol": "tcp"
    }
  ],
  "volumes": [
    {
      "host": "/mnt/storage/nginx/config",
      "container": "/etc/nginx/conf.d",
      "mode": "ro"  // ro=read-only, rw=read-write
    }
  ],
  "environment": {
    "NGINX_HOST": "example.com",
    "NGINX_PORT": "80"
  },
  "restart": "unless-stopped",
  "healthCheck": {
    "test": "curl -f http://localhost || exit 1",
    "interval": 30
  }
}

Response:
{
  "success": true,
  "containerId": "container-xyz",
  "status": "running"
}
```

### Common Docker Hub Images

**Web Servers**:
- `nginx:latest` - Reverse proxy, web server
- `apache:latest` - Apache web server
- `caddy:latest` - Modern web server with TLS

**Databases**:
- `postgres:latest` - PostgreSQL database
- `mysql:latest` - MySQL database
- `mongo:latest` - MongoDB database

**Development**:
- `node:18` - Node.js runtime
- `python:3.11` - Python runtime
- `golang:latest` - Go compiler

**Utilities**:
- `busybox` - Lightweight image for debugging
- `alpine` - Minimal Linux image
- `ubuntu:latest` - Full Ubuntu environment

---

## Security

### Security Measures Enforced

**No Privileged Containers**:
- Containers cannot run with root privileges
- `--privileged=false` always enforced

**Capability Dropping**:
- All Linux capabilities dropped by default
- Only required capabilities added
- Prevents privilege escalation

**Read-Only Root Filesystem**:
- Container root filesystem immutable
- Only /tmp and volumes are writable
- Prevents malware persistence

**Volume Restrictions**:
- Only paths under `/mnt/storage` allowed
- System paths blocked: `/etc`, `/root`, `/sys`, `/proc`
- Prevents access to host system

**Network Isolation**:
- Bridge network by default
- Host network access denied
- Container-to-container disabled (ICC=false)

### Validation

**Port Validation**:
- Only ports 1024-65535 allowed
- Same port cannot be used twice
- Well-known ports require permission

**Image Validation**:
- Image names must follow Docker standards
- Official images inspected before installation
- Automated builds verified

**Environment Variables**:
- Only whitelisted variables allowed
- Sensitive values never logged
- Configuration encrypted in database

---

## Best Practices

### Installation
1. **Start with marketplace** (safer than Docker Hub)
2. **Use pinned versions** (e.g., `latest-v20.04` not `latest`)
3. **Test in staging** before production
4. **Monitor resources** after installation

### Management
1. **Regularly update images** (security patches)
2. **Monitor logs** for errors
3. **Set resource limits** (memory, CPU)
4. **Backup app data** regularly
5. **Use health checks** to auto-restart

### Performance
1. **Allocate sufficient memory** (at least 512MB per app)
2. **Use local storage** for performance (/mnt/storage)
3. **Monitor CPU/memory** usage
4. **Restart container** if memory leaks detected

### Security
1. **Don't use host network** unless required
2. **Don't mount /etc or /root** volumes
3. **Use environment variables** for secrets (not command line)
4. **Enable read-only root** when possible
5. **Restrict ports** via firewall

---

## Troubleshooting

### Container Won't Start
1. Check Docker daemon: `docker ps`
2. View logs: `docker logs <container>`
3. Check port conflicts: `sudo netstat -tuln`
4. Check available disk space: `df -h`

### App Data Lost
1. Verify volume mounted: `docker inspect <container> | grep Mounts`
2. Check path exists: `ls -la /mnt/storage/apps/`
3. Restore from backup if needed

### High Resource Usage
1. Check container stats: `docker stats <container>`
2. Set memory limits: Reinstall with `memLimit` parameter
3. Stop other containers if needed
4. Increase host resources

---

**Last Updated**: May 13, 2026  
**Module Status**: ✅ Production Ready
