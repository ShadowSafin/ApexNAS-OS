# PHASE 7 QUICK REFERENCE
## FTP Service & App Installer System

---

## FTP SERVICE QUICK START

### Enable FTP
```bash
curl -X POST http://localhost:3000/api/ftp/enable \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "port": 21,
    "passivePortMin": 6000,
    "passivePortMax": 6100
  }'
```

### Add FTP User
```bash
curl -X POST http://localhost:3000/api/ftp/users \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john",
    "password": "SecurePass123!",
    "homeDir": "/mnt/storage/ftp/john"
  }'
```

### Check FTP Status
```bash
curl http://localhost:3000/api/ftp/status \
  -H "Authorization: Bearer TOKEN"
```

### Remove FTP User
```bash
curl -X DELETE http://localhost:3000/api/ftp/users/john \
  -H "Authorization: Bearer TOKEN"
```

### Disable FTP
```bash
curl -X POST http://localhost:3000/api/ftp/disable \
  -H "Authorization: Bearer TOKEN"
```

---

## APP INSTALLER QUICK START

### Get App Catalog
```bash
curl http://localhost:3000/api/apps/catalog \
  -H "Authorization: Bearer TOKEN"
```

### Install App (e.g., Plex)
```bash
curl -X POST http://localhost:3000/api/apps/install \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"appId": "plex"}'
```

### List Installed Apps
```bash
curl http://localhost:3000/api/apps/installed \
  -H "Authorization: Bearer TOKEN"
```

### Start App
```bash
curl -X POST http://localhost:3000/api/apps/start \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"containerId": "abc123..."}'
```

### Stop App
```bash
curl -X POST http://localhost:3000/api/apps/stop \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"containerId": "abc123..."}'
```

### Remove App
```bash
curl -X DELETE http://localhost:3000/api/apps/remove \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"containerId": "abc123...", "removeVolumes": false}'
```

---

## AVAILABLE APPS

| App | ID | Purpose | Ports |
|-----|----|---------| ------|
| Plex | plex | Media streaming | 32400 |
| Nextcloud | nextcloud | Productivity | 8080 |
| Jellyfin | jellyfin | Media system | 8096 |
| Syncthing | syncthing | File sync | 8384, 22000 |
| Vaultwarden | vaultwarden | Password mgr | 8000 |
| Home Assistant | homeassistant | Home automation | 8123 |
| Portainer | portainer | Docker UI | 9000 |

---

## STORAGE STRUCTURE

```
/mnt/storage/
├── apps/                  # All app data
│   ├── nextcloud/
│   ├── plex/
│   ├── vaultwarden/
│   └── ...
├── media/                 # Shared media files
│   ├── movies/
│   ├── music/
│   └── photos/
└── ftp/                   # FTP user directories
    ├── user1/
    └── user2/
```

---

## SECURITY RULES

### FTP
- ✓ All users jailed to `/mnt/storage`
- ✓ No anonymous access
- ✓ Passive mode enabled
- ✓ Auto-restart on failures

### Apps
- ✓ No privileged containers
- ✓ Data in `/mnt/storage` only
- ✓ Pre-validated configurations
- ✓ Admin-only access

---

## CONFIGURATION FILES

### FTP Config
Location: `/etc/nas/ftp-config.json`
```json
{
  "enabled": true,
  "port": 21,
  "passivePortMin": 6000,
  "passivePortMax": 6100,
  "users": [
    {"username": "john", "homeDir": "/mnt/storage/ftp/john"}
  ]
}
```

### Installed Apps
Location: `/etc/nas/installed-apps.json`
```json
{
  "apps": [
    {
      "id": "plex",
      "containerId": "abc123...",
      "name": "Plex Media Server",
      "status": "running",
      "ports": [{"host": 32400, "container": 32400}],
      "installedAt": "2026-04-08T10:30:00Z"
    }
  ]
}
```

---

## COMMON TASKS

### Access Nextcloud
1. Install Nextcloud: `POST /api/apps/install` with `appId: "nextcloud"`
2. Wait for container to start
3. Access at `http://nas-ip:8080`
4. Admin credentials: `admin` / `changeme` (change immediately!)

### Back Up App Data
```bash
docker run --rm -v /mnt/storage/apps/nextcloud:/data \
  -v /backup:/backup \
  busybox tar czf /backup/nextcloud-backup.tar.gz /data
```

### Add FTP User for Backup
```bash
curl -X POST http://localhost:3000/api/ftp/users \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "backup",
    "password": "BackupPass123!",
    "homeDir": "/mnt/storage/backup"
  }'
```

### Monitor App Logs
```bash
docker logs -f NAS-plex-1712574600000
```

---

## TROUBLESHOOTING

### FTP Not Working
```bash
# Check service status
curl http://localhost:3000/api/ftp/status -H "Authorization: Bearer TOKEN"

# Verify vsftpd is running
systemctl status vsftpd

# Check configuration
cat /etc/vsftpd/vsftpd.conf
```

### App Won't Start
```bash
# Check Docker is running
docker ps

# View container logs
docker logs container-id

# Verify volumes exist
ls -la /mnt/storage/apps/

# Check port is free
netstat -tuln | grep :8080
```

### Bad Permissions
```bash
# Fix app directory permissions
sudo chown -R 1000:1000 /mnt/storage/apps/
sudo chmod -R 755 /mnt/storage/apps/
```

---

## PERFORMANCE TIPS

### Optimize Storage
- Use SSD for `/mnt/storage/apps`
- Regular cleanup of old containers
- Monitor disk usage: `df -h /mnt/storage`

### Network Optimization
- Place NAS on gigabit network
- Use wired connection (not WiFi)
- Configure passive ports > 6000

### Resource Management
- Limit container resources: `docker update --memory 2g container-id`
- Monitor CPU: `docker stats`
- Use read-only mounts where possible

---

## WEB UI FEATURES

### FTP Page
- Enable/disable FTP service
- Add/remove users
- View current configuration
- Security information

### App Store Page
- Browse all available apps
- Install with one click
- View installed apps
- Start/stop containers
- Remove apps

---

## API RESPONSES

### Success Response
```json
{
  "success": true,
  "data": {...},
  "message": "Operation completed"
}
```

### Error Response
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable error message"
}
```

---

## RATE LIMITS

- Login: 5 attempts per minute per IP
- Write operations: 100 per minute per user
- Public endpoints: 60 per minute per IP

---

## SUPPORT & DOCUMENTATION

- FTP Documentation: See PHASE7_IMPLEMENTATION_COMPLETED.md
- Test Coverage: Run PHASE7_VALIDATION_TESTS.js
- Architecture: Review source code in backend/modules/

---

**Last Updated:** 2026-04-08
**Version:** 7.0.0
**Status:** Production Ready
