# ApexNAS System Architecture

This document describes the high-level architecture, components, and design decisions in ApexNAS.

## Table of Contents
- [System Overview](#system-overview)
- [Layered Architecture](#layered-architecture)
- [Module Breakdown](#module-breakdown)
- [Data Flow](#data-flow)
- [Safety Mechanisms](#safety-mechanisms)
- [Performance Considerations](#performance-considerations)

---

## System Overview

ApexNAS is a modular, layered NAS system that separates concerns into three main tiers:

1. **Presentation Layer** - React web interface
2. **Business Logic Layer** - Express.js API server with service modules
3. **System Layer** - Linux system services and hardware interfaces

Each layer communicates through well-defined interfaces with validation and error handling.

---

## Layered Architecture

### Layer 1: Presentation (React Frontend)

**Location**: `/Frontend/src/`

**Responsibilities**:
- User interface for managing storage, files, and apps
- Dashboard with system health and monitoring
- Forms for configuration and administration
- Real-time status updates

**Key Components**:
- `App.jsx` - Main application shell
- `pages/` - Feature pages (Storage, Shares, Apps, Admin)
- `components/` - Reusable UI components
- `services/` - API client for backend communication

**Communication**: HTTP/REST with authentication via JWT tokens

---

### Layer 2: Business Logic (Express API)

**Location**: `/backend/`

**Responsibilities**:
- REST API endpoint handling
- Input validation and sanitization
- Business logic orchestration
- Service initialization and lifecycle
- Error handling and logging

**Core Components**:

#### `app.js` - Application Factory
- Express app setup
- Route mounting
- Middleware configuration
- Service initialization

#### `server.js` - Entry Point
- HTTP server startup
- Port binding
- Graceful shutdown handling

#### `middleware/` - Request Processing
- Authentication (JWT verification)
- Logging and request tracking
- CORS and security headers
- Error handling

#### `modules/` - Feature Modules

Each module follows a consistent structure:

```
modules/<name>/
├── <name>.service.js      # Business logic (classes and functions)
├── <name>.routes.js       # API endpoints (GET, POST, DELETE, etc.)
├── <name>.schema.js       # Input validation (Zod schemas)
├── <name>.test.js         # Integration tests (optional)
└── <name>.util.js         # Helpers specific to module (optional)
```

**Modules**:
- `auth/` - JWT authentication, login/logout
- `disk/` - Partition, format, mount management
- `raid/` - RAID array creation and management  
- `storage/` - Storage pooling and management
- `shares/` - SMB/NFS/FTP share configuration
- `ftp/` - FTP service management
- `smb/` - Samba/CIFS configuration
- `nfs/` - NFS mount configuration
- `system/` - System info, health, version
- `network/` - Network interfaces and configuration
- `services/` - System service management (systemd, etc.)

#### `lib/` - Shared Utilities
- `logger.js` - Structured logging (Winston)
- `errors.js` - Custom error classes
- `validators.js` - Common validation functions
- `execute.js` - System command execution wrapper
- `db.js` - Data persistence (JSON files or DB)

#### `config/` - Configuration
- Environment variables (`process.env`)
- Default values for services
- Constants and magic numbers

---

### Layer 3: System Services

**Responsibilities**:
- Executing system commands (mdadm, mkfs, mount, etc.)
- Managing system services (systemd units)
- File I/O and persistence
- Hardware abstraction

**Key Services**:

| Service | Command | Module | Function |
|---------|---------|--------|----------|
| RAID | `mdadm` | raid | Array creation/management |
| Disk | `parted`, `mkfs`, `mount` | disk | Partitioning and mounting |
| SMB | `smbd`, `nmbd` | smb | Windows file sharing |
| NFS | `exportfs`, `nfsd` | nfs | Unix file sharing |
| FTP | `vsftpd` | ftp | File transfer protocol |
| Storage | `lvm`, `zpool` | storage | Volume management |

**Safety Mechanisms**:
- All system commands are validated
- Operations use simulation mode first
- Confirmation tokens required for destructive ops
- Atomic writes to system files (fstab)
- Transaction rollback on failure
- File locking for concurrent access
- Comprehensive error handling

---

## Module Breakdown

### Authentication Module
**Handles**: User login, JWT token generation, authorization

**Key Endpoints**:
- `POST /api/auth/login` - Authenticate user
- `POST /api/auth/refresh` - Get new JWT token
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/logout` - Invalidate token

**Features**:
- Password hashing with bcrypt
- JWT with 1-hour expiry + refresh tokens
- Role-based access control (RBAC)
- Secure session management

---

### Storage Management (Disk + RAID)

**Disk Module** - Physical partitions and filesystems
- Partition creation/deletion
- Filesystem creation (ext4, xfs, btrfs)
- Mount/unmount operations
- fstab management with atomic writes
- SMART monitoring

**RAID Module** - Redundant Array of Independent Disks
- RAID array creation (0, 1, 5, 6)
- Array reassembly and recovery
- Device monitoring
- Safe destruction with confirmation tokens
- Simulation mode for safety

**Data Flow**:
1. User selects disks → Disk module creates partitions
2. Partitions formatted with Disk module
3. User creates RAID array → RAID module combines partitions
4. RAID mounted using Disk module
5. Storage pooled and shared via Shares module

---

### File Sharing (SMB + NFS + FTP)

**SMB Module** - Windows/Mac file sharing
- Share creation with path and permissions
- User authentication and access control
- Performance tuning (cache settings)
- Protocol version selection (SMB3 by default)

**NFS Module** - Unix/Linux file sharing
- Export configuration
- Client access rules
- Permission mapping
- NFS version support (4.1 default)

**FTP Module** - Secure file transfer
- vsftpd configuration
- User account management with chroot jailing
- Passive mode for firewall compatibility
- Per-user bandwidth limits

**Shares Module** - Unified share management
- Create/edit/delete shares across protocols
- Apply permissions and quotas
- Monitor usage statistics

---

### Administration

**Users Module** - Account management
- Create/modify/delete user accounts
- Password management
- Shell assignment

**Permissions Module** - Access control
- RBAC with roles (admin, user, readonly)
- Per-resource permissions
- ACL enforcement

**System Module** - Monitoring
- System health (CPU, RAM, disk)
- Service status
- Kernel version and uptime
- Event logging

---

## Data Flow

### Typical User Workflow: Create RAID Array

```
User Interface (React)
    ↓ Create RAID dialog
    ↓ POST /api/raid/create
    ↓
Express Handler (raid.routes.js)
    ↓ Validate input (raid.schema.js)
    ↓ Check authentication/permissions
    ↓
RAID Service (raid.service.js)
    ↓ Check device safety (mounted? system disk?)
    ↓ Validate device paths and RAID level
    ↓ Generate mdadm command
    ↓ If simulation: return command preview
    ↓ If confirmed: execute mdadm command
    ↓ Monitor array creation
    ↓
System Layer
    ↓ mdadm creates RAID array
    ↓ Device appears as /dev/md0
    ↓ Syncing starts
    ↓
RAID Service
    ↓ Return success response
    ↓
Frontend
    ↓ Show confirmation and status
    ↓ Poll status endpoint for progress
    ↓ Show completion when ready
```

### API Request/Response

```
REQUEST:
POST /api/raid/create
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "name": "md0",
  "level": "raid1",
  "devices": ["/dev/sdb1", "/dev/sdc1"],
  "simulation": true,
  "confirm": ""
}

PROCESSING:
1. Middleware: Verify JWT token
2. Routes: Parse JSON body
3. Schema: Validate fields
4. Service: Execute business logic
5. System: Run mdadm command
6. Return: Create response

RESPONSE:
{
  "success": true,
  "created": true,
  "name": "/dev/md0",
  "level": "raid1",  
  "devices": [...]
}
```

---

## Safety Mechanisms

ApexNAS implements multiple layers of safety to prevent data loss:

### 1. Input Validation
- All API inputs validated using Zod schemas
- Domain-level validation (device exists, path is valid)
- Type checking and format enforcement

### 2. Confirmation Tokens
Destructive operations (RAID delete, format disk) require explicit confirmation:
```json
{
  "operation": "remove_raid",
  "confirm": "YES_DESTROY_DATA"  // Must be exact value
}
```

### 3. Simulation Mode
By default, operations run in simulation mode:
```json
{
  "simulation": true    // Show command without executing
}
```

To execute: `"simulation": false` + `"confirm": "<token>"`

### 4. Safety Guards

**Mounted Device Protection**
- Check device is mounted before destructive ops
- Cannot format/destroy mounted filesystems

**System Disk Protection**
- Identify system disk (where / is mounted)
- Prevent operations on system disk

**Device Validation**
- Verify device paths exist
- Check device permissions
- Validate device types (block devices only)

### 5. Atomic Operations

**Atomic File Writes** - fstab persistence
```
1. Write to temporary file
2. Validate content
3. Atomic rename (POSIX guarantee)
```

Never leaves file in corrupted state.

**Transaction Rollback** - Mount with fstab
```
1. Mount partition
2. Try to add to fstab
3. If fstab fails: unmount and error
4. Never partial state (mounted but not persisted)
```

### 6. Concurrency Control

**File Locking** - Prevent concurrent writes
- Lock acquired before writing fstab
- Lock released after write
- Timeouts prevent deadlocks
- Exponential backoff for retries

### 7. Error Handling

**Comprehensive Error States**:
- Input validation errors (400)
- Authorization errors (403)
- Not found errors (404)
- Business logic errors (400 + detailed message)
- System errors (500 + logging)

All errors include:
- Error code for client handling
- Human-readable message
- Validation details (for form errors)

---

## Performance Considerations

### Backend Optimization

**Asynchronous I/O**
- All long operations use async/await
- Non-blocking event loop
- Streaming for large file operations

**Request Caching**
- RAID status cached (5 second TTL)
- Disk list cached (10 second TTL)
- Device enumeration batched

**Connection Pooling**
- Persistent connection pools where applicable
- System command batching

### Scalability

**Horizontal Scaling**
- Stateless API servers (can run multiple instances)
- Shared storage for state files
- Load balancing (nginx, haproxy)

**Vertical Scaling**
- Efficient algorithms with O(n) or O(n log n)
- Memory-efficient data structures
- Minimal disk usage for state

### Monitoring

**Performance Metrics**
- Request latency (p50, p95, p99)
- Operation success rate
- Error rates by type
- System resource usage (CPU, RAM, disk I/O)

See system dashboard for real-time metrics.

---

## Integration Points

### Frontend ↔ Backend
- REST API with JSON
- Authentication via authorization header
- CORS enabled for development
- WebSocket for real-time updates (future)

### Backend ↔ System
- Shell commands via `child_process.exec()`
- File I/O via `fs` module  
- Database via file-based JSON (scalable to SQL)
- Environment variables in `.env`

### External Services
- FTP server (`vsftpd`) connection
- System services (systemd)
- Hardware (block devices, NICs)
- Network (for SMB, NFS, FTP clients)

---

## Security Architecture

See [docs/SECURITY.md](../SECURITY.md) for detailed security design including:
- Authentication flow
- Authorization mechanisms
- Data protection
- Audit logging
- Vulnerability management

---

**Next Steps:**
- Review [docs/INSTALLATION.md](../INSTALLATION.md) for setup
- See module-specific docs in [docs/MODULES/](../MODULES/)
- Check [docs/API-REFERENCE.md](../API-REFERENCE.md) for endpoints
