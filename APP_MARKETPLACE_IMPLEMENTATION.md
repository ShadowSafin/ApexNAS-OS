# NAS-OS App Marketplace + Docker Runtime System
## Comprehensive Implementation Guide

---

## OVERVIEW

A production-grade hybrid app system combining:
- **Curated Marketplace** - Pre-approved, one-click installable apps
- **Docker Hub Integration** - Search and install any Docker image
- **Container Management** - Full lifecycle management with safety controls
- **Safety Layer** - Strict validation, no privilege escalation, filesystem isolation

---

## SYSTEM ARCHITECTURE

### Backend Components

#### 1. App Service Layer (`apps.service.js`)
- **getCatalog()** - Load curated app catalog
- **getAppById(appId)** - Get app template by ID
- **installApp(appId, overrideValues)** - Install from marketplace
- **searchDockerHub(query, limit)** - Search Docker Hub API
- **installDockerHubApp(config)** - Install custom Docker image
- **startApp(containerId)** - Start container
- **stopApp(containerId)** - Stop container
- **removeApp(containerId, removeVolumes)** - Remove container
- **syncAppState()** - Sync state with Docker daemon

#### 2. Validation Layer
- Image name format validation (Docker Hub standard)
- Container name validation (lowercase, alphanumeric, hyphen/underscore)
- Port range validation (1024-65535)
- Volume path validation (must be under /mnt/storage)
- Privileged mode blocking
- System path blocking (/etc, /root, /sys, etc.)

#### 3. Security Features
- Read-only root filesystem by default
- Capability dropping (--cap-drop=ALL)
- No new privileges security option
- No privileged containers
- Memory limits enforcement
- Volume path restriction

#### 4. API Endpoints (`apps.routes.js`)

**Marketplace:**
```
GET  /api/apps/catalog           - Get curated apps
POST /api/apps/install          - Install marketplace app
```

**Docker Hub:**
```
GET  /api/apps/search/dockerhub - Search Docker Hub
POST /api/apps/install-dockerhub - Install from Docker Hub
```

**Management:**
```
GET  /api/apps/installed        - List installed apps
POST /api/apps/start            - Start container
POST /api/apps/stop             - Stop container
DELETE /api/apps/remove         - Remove container
GET  /api/apps/:appId           - Get app details
```

---

## Frontend Components

### 1. Apps.jsx (Main Hub)
Tabbed interface with three sections:
- **Marketplace Tab** - Browse curated apps
- **Docker Hub Tab** - Search & install custom apps
- **Containers Tab** - Manage running containers

### 2. Marketplace.jsx
- Grid of curated apps with icons
- One-click "Install" button
- App details (ports, volumes, environment)
- Category badges

### 3. DockerHubSearch.jsx
- Real-time search of Docker Hub
- Search results with:
  - Official badge
  - Star rating
  - Pull count
  - Description
- Advanced configuration form:
  - Container name
  - Port mappings (hostPort:containerPort)
  - Volume mounts with R/O toggle
  - Environment variables

### 4. ContainerCard.jsx
- Shows running container status
- Start/Stop/Remove buttons
- Access links (ports)
- View logs action

---

## Curated App Catalog

**Location:** `/backend/modules/apps/app-catalog.json`

**Pre-approved Apps:**
1. **Plex Media Server** - Media streaming
2. **Nextcloud** - File sync & productivity
3. **Jellyfin** - Free media system
4. **Home Assistant** - Home automation
5. **Portainer** - Docker management

**App Template Structure:**
```json
{
  "id": "app-id",
  "name": "Display Name",
  "description": "App description",
  "image": "docker/image:tag",
  "ports": [
    {
      "host": 8080,
      "container": 80,
      "protocol": "tcp"
    }
  ],
  "volumes": [
    {
      "host": "/mnt/storage/path",
      "container": "/container/path",
      "mode": "rw"
    }
  ],
  "environment": [
    {
      "key": "ENV_VAR",
      "value": "default_value"
    }
  ],
  "privileged": false,
  "restart": "unless-stopped",
  "category": "media|productivity|automation|management"
}
```

---

## Data Persistence

### State Files

**Installed Apps State** - `/backend/data/installed-apps.json`
```json
{
  "apps": [
    {
      "id": "app-id",
      "containerId": "container-hash",
      "name": "Container Name",
      "image": "docker/image:tag",
      "ports": [...],
      "volumes": [...],
      "status": "running|stopped",
      "source": "marketplace|docker-hub",
      "installedAt": "ISO-8601 timestamp"
    }
  ],
  "lastUpdated": "ISO-8601 timestamp"
}
```

**Docker Containers State** - Synced from Docker daemon via `docker ps -a`

---

## Validation & Safety Rules

### CRITICAL Validations

1. **Image Name** (Docker Hub API standard):
   - Pattern: `^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[a-z0-9]+(?:[._-][a-z0-9]+)*)?$/i`
   - Examples: `nginx`, `nginx:latest`, `myrepo/myimage:v1.0`

2. **Container Name**:
   - Pattern: `^[a-z0-9_-]{1,63}$`
   - Max 63 characters
   - Lowercase only
   - Alphanumeric, hyphen, underscore

3. **Ports**:
   - Range: 1024-65535
   - Format: `hostPort:containerPort` or `hostIp:hostPort:containerPort`
   - Auto-conflict detection

4. **Volumes** (MOST CRITICAL):
   - **ALLOWED:** `/mnt/storage/*` - Storage volumes
   - **BLOCKED:** `/`, `/etc`, `/root`, `/boot`, `/dev`, `/proc`, `/sys`, `/bin`, `/sbin`, `/usr`, `/var/www`, `/home`, `/opt`, `/srv`, `/lib`, `/lib64`
   - Path must exist before mounting
   - Encoded traversal patterns blocked

5. **Capabilities** (Security):
   - `--read-only` - Read-only root filesystem
   - `--cap-drop=ALL` - Drop all capabilities
   - `--security-opt=no-new-privileges:true` - Prevent privilege escalation
   - No `--privileged` mode allowed

---

## Installation Flows

### Flow 1: Marketplace Install

```
User clicks "Install" on Plex
  ↓
Backend validates app ID exists in catalog
  ↓
Backend pulls image: docker pull plexinc/pms-docker:latest
  ↓
Backend validates volumes & ports
  ↓
Backend creates container: docker run -d --name NAS-plex-{timestamp} ...
  ↓
Backend updates installed-apps.json state
  ↓
WebSocket broadcasts 'apps:installed' event
  ↓
Frontend refreshes containers list
  ↓
User sees running container
```

### Flow 2: Docker Hub Search & Install

```
User types "redis" in search
  ↓
Frontend → GET /api/apps/search/dockerhub?q=redis
  ↓
Backend → https://hub.docker.com/v2/search/repositories/
  ↓
Backend returns results: [
    { name: "library/redis", stars: 1000, official: true, ... },
    { name: "bitnami/redis", stars: 500, official: false, ... },
    ...
  ]
  ↓
User clicks "Configure & Install"
  ↓
Modal shows configuration form:
  - Container name: "my-redis"
  - Port mappings: "6379:6379"
  - Volume mounts: "/mnt/storage/data:/data"
  - Environment variables
  ↓
User clicks "Install"
  ↓
Frontend → POST /api/apps/install-dockerhub { image: "library/redis", ... }
  ↓
Backend validates config (name, image, ports, volumes)
  ↓
Backend pulls image: docker pull library/redis
  ↓
Backend creates container with security options
  ↓
Backend updates state & broadcasts event
  ↓
Container appears in "Running Containers" tab
```

### Flow 3: Container Lifecycle

```
Start Container:
  user clicks "start" button
  → POST /api/apps/start { containerId }
  → docker start {containerId}
  → state updated
  → UI shows "running"

Stop Container:
  user clicks "stop" button
  → POST /api/apps/stop { containerId }
  → docker stop {containerId}
  → state updated
  → UI shows "stopped"

Remove Container:
  user clicks "remove" button
  → confirmation dialog
  → DELETE /api/apps/remove { containerId, removeVolumes }
  → docker rm -v {containerId}  (if removeVolumes=true)
  → state updated
  → removed from list
```

---

## Error Handling

### Validation Errors (400 Bad Request)
```json
{
  "error": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "errors": [
    "Container name must be lowercase alphanumeric with hyphen/underscore (max 63 chars)",
    "Volume path must be under /mnt/storage"
  ]
}
```

### Service Errors (500 Internal Server Error)
```json
{
  "error": "DOCKER_ERROR",
  "message": "Failed to list containers: Command execution failed"
}
```

### Docker Hub Search Errors
```json
{
  "error": "SEARCH_ERROR",
  "message": "Cannot connect to Docker Hub. Please try again later."
}
```

---

## Environment Variables & Configuration

### Backend Configuration
- `STORAGE_BASE`: `/mnt/storage` - Root storage path
- `CATALOG_FILE`: `/backend/modules/apps/app-catalog.json`
- `INSTALLED_APPS_FILE`: `/backend/data/installed-apps.json`
- `CONTAINERS_STATE`: `/etc/nas/containers.json`

### Docker Hub API
- Endpoint: `https://hub.docker.com/v2/search/repositories/`
- Rate limit: Generally 60 requests/hour (unauthenticated)
- Timeout: 10 seconds per request

---

## Testing Validation Checklist

- [x] Curated app install works (Plex, Nextcloud, etc.)
- [x] Docker Hub search returns results
- [x] Custom container install with validation
- [x] Port conflicts detected
- [x] Invalid volume paths blocked
- [x] System paths blocked from mounting
- [x] Privileged containers rejected
- [x] Container runs with security options
- [x] Logs accessible via container logs
- [x] Remove container works (with/without volumes)
- [x] State persistence after reboot
- [x] No system compromise possible

---

## Frontend UI Sections

### Marketplace Tab
```
┌─────────────────────────────────────────┐
│ 🛒 Curated Marketplace                  │
│ One-click installation of trusted apps  │
├─────────────────────────────────────────┤
│ [Plex Card] [Nextcloud Card] [Jellyfin] │
│ [Home Ass] [Portainer]                  │
│                                         │
│ Each card shows:                        │
│  - App name & description               │
│  - Category badge                       │
│  - Ports × Volumes                      │
│  - [Install] button                     │
└─────────────────────────────────────────┘
```

### Docker Hub Tab
```
┌─────────────────────────────────────────┐
│ 🔍 Docker Hub Search                    │
│ Discover and install additional apps    │
├─────────────────────────────────────────┤
│ [Search input────────────────] [Search] │
├─────────────────────────────────────────┤
│ [Redis Card]   [MySQL Card]  [Nginx]    │
│ ⭐ 1000 | Pulls 1M           │          │
│ [Configure & Install]                   │
│                                         │
│ Configuration Modal (on click):         │
│  Name: [my-redis──────]                │
│  Ports: [6379:6379────]                │
│  Volumes: [/mnt/storage:/data]         │
│  Environment: [Add Variables]           │
│  [Install] [Cancel]                    │
└─────────────────────────────────────────┘
```

### Running Containers Tab
```
┌─────────────────────────────────────────┐
│ 📦 Running Containers                   │
│ 2 containers running          [Refresh] │
├─────────────────────────────────────────┤
│ [Plex Card]              [Nextcloud]    │
│ Status: Running ✓        Status: Down ✗ │
│ Port: 32400              Port: 8080     │
│ [View Logs]              [View Logs]    │
│ [Stop] [Remove]          [Start] [Rem] │
└─────────────────────────────────────────┘
```

---

## Advanced Features

### 1. One-Click Install
- Pre-configured apps in marketplace
- Default volumes, ports, environment variables
- User can override before install
- Automatic image pull

### 2. Docker Hub Integration
- Real-time search via Docker Hub API
- Official badge indication
- Star ratings & pull counts
- Advanced configuration options

### 3. Port Conflict Detection
- Automatic scanning of used ports
- Error message if port already in use
- Suggestions for alternative ports

### 4. Volume Management
- Path validation before mount
- Automatic directory creation
- Read-only toggle per volume
- Data persistence across restarts

### 5. Container Lifecycle
- Full control: start, stop, remove
- Status tracking: running, stopped
- Log viewing via container logs
- Resource limits enforcement

---

## Performance Considerations

- Docker Hub search: 10-second timeout
- Image pull: 5-minute timeout (configurable)
- Container operations: 1-minute timeout
- State sync: On-demand (no polling)

---

## Security Considerations

1. **No Root Required** - All operations via Docker CLI
2. **Isolated Filesystem** - Read-only root, volumes in /mnt/storage only
3. **No Capability Escalation** - Security options enforced
4. **No Privileged Mode** - Rejected at validation layer
5. **Input Sanitization** - All inputs validated against strict patterns
6. **No Shell Injection** - All commands use array format, no shell involved

---

## Future Enhancements

- [ ] Custom app creation/sharing
- [ ] App versioning & rollback
- [ ] Resource limits UI configuration
- [ ] Health checks & auto-restart
- [ ] Backup/restore functionality
- [ ] Image registry integration
- [ ] Multi-container compose support
- [ ] Performance monitoring

---

## Success Criteria — ALL MET ✓

✓ Users can install apps easily (Marketplace with one-click install)
✓ Advanced users can run custom containers (Docker Hub search + custom config)
✓ System remains secure (Strict validation, no privilege escalation, path isolation)
✓ Storage integration works correctly (All volumes under /mnt/storage, validation)
