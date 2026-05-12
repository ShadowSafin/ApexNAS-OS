# ApexNAS Troubleshooting Guide

Solutions for common issues and error messages.

## Table of Contents
- [Connection Issues](#connection-issues)
- [Storage Issues](#storage-issues)
- [Share & File Access Issues](#share--file-access-issues)
- [Application Issues](#application-issues)
- [Authentication Issues](#authentication-issues)
- [Performance Issues](#performance-issues)
- [System Issues](#system-issues)
- [Error Message Reference](#error-message-reference)

---

## Connection Issues

### Can't Connect to Web Interface

**Symptom**: Browser shows "Connection refused" or times out  
**Port**: http://localhost:3000 (or your server IP)

**Check 1: Server Running?**
```bash
ps aux | grep "node server.js"
```
If not running:
```bash
cd /path/to/NAS
npm run dev
```

**Check 2: Port Listening?**
```bash
netstat -tuln | grep 3000
```
If not showing:
```bash
# Check if port is in use by something else
sudo lsof -i :3000

# Kill process if needed
kill -9 <pid>

# Restart ApexNAS
npm run dev
```

**Check 3: Firewall Blocking?**
```bash
# Check UFW (Ubuntu)
sudo ufw status

# Allow port
sudo ufw allow 3000

# Check iptables (alternative)
sudo iptables -L | grep 3000
```

**Check 4: Wrong URL?**
- Local access: `http://localhost:3000`
- Remote access: `http://<SERVER_IP>:3000`
- Production: `https://apexnas.example.com` (requires reverse proxy + SSL)

**Check 5: Backend API Not Responding?**
```bash
# Test API directly
curl http://localhost:8080/api/system/health

# If fails, check backend
ps aux | grep "Express"
tail -f backend/logs/error.log
```

---

### Connection Works But Slow

**Check Network**:
```bash
# Ping server
ping <server-ip>

# Check bandwidth
iperf3 -c <server-ip>

# Check latency
traceroute <server-ip>
```

**Check Resources**:
```bash
# CPU usage
top -b -n 1 | head -20

# Memory usage
free -h

# Disk I/O
iostat -x 1 5
```

**Solution**: See [Performance Issues](#performance-issues)

---

## Storage Issues

### Can't See Available Disks

**Symptom**: Storage page shows no devices

**Check 1: Disks Physically Connected?**
```bash
# List all block devices
lsblk

# If no devices shown, disks may not be connected
# Reseat cables or check BIOS
```

**Check 2: Permissions**
```bash
# ApexNAS needs access to block devices
ls -la /dev/sd*
```

**Check 3: Backend Connection**
```bash
# Test API directly
curl http://localhost:8080/api/storage/devices | json_pp

# Check backend logs
tail -f backend/logs/error.log
```

**Solution**: Verify disks in BIOS, check physical connections, ensure proper permissions


## Share & File Access Issues

### SMB Share Not Accessible

**Symptom**: Can't connect from Windows/Mac

**Check 1: SMB Service Running?**
```bash
# Check status
sudo systemctl status smbd
sudo systemctl status nmbd

# If not running, start it
sudo systemctl start smbd
sudo systemctl start nmbd
```

**Check 2: Firewall Open?**
```bash
sudo ufw allow 139/tcp
sudo ufw allow 445/tcp
sudo ufw status | grep 139
sudo ufw status | grep 445
```

**Check 3: Share Path Exists?**
```bash
# Verify share path
ls -la /mnt/storage/sharename

# Create if missing
sudo mkdir -p /mnt/storage/sharename
sudo chmod 755 /mnt/storage/sharename
```

**Check 4: Mount the Share**

Windows:
```batch
net use Z: \\apexnas\sharename /user:admin password
```

Mac:
```bash
mount_smbfs smb://admin@apexnas/sharename /Volumes/sharename
```

Linux:
```bash
sudo mount -t cifs -o username=admin,password=pass //apexnas/sharename /mnt/nas
```

---

### FTP Not Working

**Symptom**: Can't connect with FTP client

**Check 1: FTP Service Running?**
```bash
# Check vsftpd status
sudo systemctl status vsftpd

# Start if needed
sudo systemctl start vsftpd
```

**Check 2: Port Open?**
```bash
sudo ufw allow 21/tcp
sudo ufw allow 6000:6100/tcp  # Passive mode port range

# Verify
sudo ufw status | grep 21
```

**Check 3: User Created?**
```bash
# List FTP users
curl http://localhost:8080/api/ftp/users

# Create FTP user if needed
curl -X POST http://localhost:8080/api/ftp/users \
  -H "Content-Type: application/json" \
  -d '{"username":"ftpuser","password":"pass"}'
```

**Test Connection**:
```bash
ftp ftp.example.com
# Or: ftp 192.168.1.100
# Login with FTP user credentials
```

---

### NFS Share Not Mounting

**Symptom**: `mount: No such file or directory` or connection timeout

**Check 1: NFS Service Running?**
```bash
sudo systemctl status nfs-server

# If not running
sudo systemctl start nfs-server
```

**Check 2: Export Configured?**
```bash
# Check exports
cat /etc/exports

# Verify share is listed
grep /mnt/storage /etc/exports
```

**Check 3: Firewall Open?**
```bash
sudo ufw allow 2049/tcp
sudo ufw allow 111/tcp
sudo ufw status | grep 2049
```

**Test Mounting**:
```bash
# From client machine
sudo mount -t nfs -o vers=4.1 apexnas:/mnt/storage /mnt/nas

# Check if mounted
mount | grep /mnt/nas
```

---

## Application Issues

#

## Authentication Issues

### Can't Log In

**Symptom**: "Invalid username or password" (authentication failed)

**Check 1: User Exists?**
```bash
# List users (as admin)
curl http://localhost:8080/api/users/list

# Create user if missing
curl -X POST http://localhost:8080/api/users/create \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"newpass","role":"admin"}'
```

**Check 2: Password Correct?**
- No password hints!
- Password is case-sensitive
- Don't confuse similar characters (0/O, 1/l/I, etc.)

**Reset Password** (as admin):
```bash
# Use admin account to reset user password
curl -X PUT http://localhost:8080/api/users/<user_id> \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"password":"newpassword"}'
```

**Emergency Restart** (if locked out):
```bash
# Delete user database and reseed
rm backend/data/users.json
npm run seed

# Use default admin credentials from .env
```

---

### Session Expired

**Symptom**: Logged in but got redirected to login page

**Cause**: JWT token expired (valid 1 hour)

**Solution**: Log in again or use refresh token (automatic in UI)

---

## Performance Issues

### Web Interface Very Slow

**Check 1: Network Latency**
```bash
# From client
ping <server>

# Check speed from server
curl -w "Time: %{time_total}s\n" https://api.example.com
```

**Check 2: Server Resources**
```bash
# CPU usage
top

# Memory usage
free -h

# Disk I/O
iostat -x 1 5

# Network
netstat -s

# If any resource > 80%, that's likely the bottleneck
```

**Check 3: Database Queries Slow?**
```bash
# Check query logs (if applicable)
# Optimize slow queries
# Add indexes to frequently queried fields
```

**Solutions**:
- Upgrade hardware (CPU/RAM/SSD)
- Reduce data size (archive old logs)
- Enable caching
- Use CDN for static files
- Implement database optimization

---


---

### Network Transfers Slow

**Check 1: Network Speed**
```bash
# Test bandwidth
iperf3 -c <server>

# Between 100Mbps-1Gbps is typical
```

**Check 2: SMB/NFS Transfer Settings**
```bash
# Optimize SMB parameters
# Increase buffer sizes
# Use larger packet sizes

# Or use faster protocol (NFS usually faster than SMB)
```

**Check 3: Storage I/O**
```bash
# Check disk read/write
iostat -x 1

# If I/O% high, storage is bottleneck
- Replace slow disks
- Check for file fragmentation
```

---

## System Issues

### System Won't Boot

**Automatic Steps Being Taken**:
1. Mounts filesystems from fstab
2. Starts services

**If Stuck**: Press Ctrl-Alt-Del to reboot, or power cycle

**After Boot Fails**:
1. Boot into rescue mode (if available)
2. Check `/etc/fstab` for errors
3. Run `fsck` to repair filesystem

---

### High Disk Usage

**Find Large Files**
```bash
# Find largest directories
du -sh /mnt/storage/* | sort -hr | head -10

# Find largest files
find /mnt/storage -type f -size +1G -exec ls -lh {} \;
```

**Clean Up**:
```bash
# Remove old backups
rm -rf /var/backups/old_*

# Clear logs
truncate -s 0 /var/log/apexnas/*.log
```

---

### High Memory Usage

**Check What's Using Memory**
```bash
top -o %MEM | head -20

# Or with specific process
ps aux | grep <process> | grep -v grep
```

**Solutions**:- Restart ApexNAS service
- Add more RAM

---

## Error Message Reference

| Error | Meaning | Solution |
|-------|---------|----------|
| `DEVICE_MOUNTED` | Cannot format/destroy mounted device | Unmount device first |
| `CONFIRMATION_REQUIRED` | Destructive op needs token | Add `confirm: "YES_DESTROY_DATA"` |
| `UNSAFE_OPERATION` | Operation blocked by safety guard | Check device safety |
| `VALIDATION_ERROR` | Input validation failed | Check request format |
| `UNAUTHORIZED` | JWT token missing/invalid | Log in again |
| `FORBIDDEN` | Insufficient permissions | Use admin account or request access |
| `NOT_FOUND` | Resource doesn't exist | Verify resource ID |
| `CONFLICT` | Resource already exists | Use different name/ID |
| `MOUNT_FAILED` | Cannot mount partition | Check device and mount point |
| `FSTAB_FAILED` | Failed to persist mount | Check fstab permissions |

---

## Getting Help

1. **Check logs first**:
   - `tail -f backend/logs/error.log`
   - `journalctl -u apexnas -f`
2. **Verify configuration**:
   - Check `.env` file
   - Verify file permissions
   - Test API endpoints directly with curl

3. **Search documentation**:
   - [docs/ARCHITECTURE.md](ARCHITECTURE.md)
   - [docs/API-REFERENCE.md](API-REFERENCE.md)
   - Module guides in [docs/MODULES/](MODULES/)

4. **Still stuck?**
   - Collect logs and system info
   - Create detailed issue report
   - Contact support/development team

---

**Last Updated**: May 13, 2026  
**Support Status**: ✅ Active
