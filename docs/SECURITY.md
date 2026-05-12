# ApexNAS Security Guide

Comprehensive security documentation for ApexNAS including hardening, threat model, and security best practices.

## Table of Contents
- [Security Overview](#security-overview)
- [Threat Model](#threat-model)
- [Authentication & Authorization](#authentication--authorization)
- [Data Protection](#data-protection)
- [Infrastructure Security](#infrastructure-security)
- [Operational Security](#operational-security)
- [Incident Response](#incident-response)
- [Security Checklist](#security-checklist)

---

## Security Overview

ApexNAS is designed with security-first principles:

- **Zero Trust**: All inputs validated, all operations authenticated
- **Defense in Depth**: Multiple security layers
- **Least Privilege**: Users only access needed resources
- **Safe by Default**: Dangerous operations require explicit confirmation
- **Audit Trail**: All actions logged and traceable

---

## Threat Model

### Threats Mitigated

**1. Unauthorized Access**
- Mitigated by: JWT authentication, strong password requirements
- Detection: Failed login attempts logged and rate-limited

**2. Privilege Escalation**
- Mitigated by: RBAC with role-based permissions
- Detection: Permission denied errors logged

**3. Data Corruption**
- Mitigated by: Atomic operations, transaction rollback
- Detection: Integrity checks on critical operations

**4. Accidental Destruction**
- Mitigated by: Confirmation tokens for destructive ops, simulation mode
- Detection: All operations logged with intent tracking

### Threats Out of Scope

- Physical security (prevent unauthorized physical access)
- Supply chain attacks (compromised dependencies)
- Advanced persistent threats requiring 0-days
- Denial of service (requires infrastructure-level protection)

---

## Authentication & Authorization

### Authentication Flow

```
User → Login (username/password)
         ↓
    Verify credentials
    Hash matching via bcrypt
         ↓
    Generate JWT token (1 hour expiry)
    + Refresh token (7 day expiry)
         ↓
    Return tokens to client
         ↓
Client stores token, includes in Authorization header
         ↓
API middleware verifies token on each request
         ↓
Token expired? Use refresh token to get new access token
```

### JWT Token Structure

```json
{
  "sub": "user-id",
  "username": "admin",
  "role": "admin",
  "exp": 1684062600,
  "iat": 1684059000
}
```

**Security Properties**:
- Signed with `JWT_SECRET` (must be strong, 32+ chars)
- Cannot be tampered with without key
- Expires in 1 hour (configurable)
- Contains only non-sensitive data

### Password Security

- **Hashing**: bcrypt with 10 salt rounds
- **Requirements**: Minimum 12 characters (configurable)
- **Never**: Stored as plaintext, transmitted unencrypted
- **Rotation**: Recommended every 90 days for admin account

**Generate Strong Password:**
```bash
openssl rand -base64 16
```

### Role-Based Access Control (RBAC)

**Admin Role**:
- Create/delete users
- Modify system configuration
- View all system logs
- Access all shares
- Manage storage

**User Role**:
- Create/manage own shares
- Access permitted shares
- View own files
- Limited system information

**ReadOnly Role**:
- View system state
- No modifications
- Limited to non-sensitive data

---

## Data Protection

### In Transit
- **HTTPS/TLS**: Enable SSL/TLS for web interface (see Deployment)
- **API Encryption**: Use reverse proxy (nginx) for TLS termination
- **SMB Encryption**: SMB3 with encryption enforced
- **NFS Security**: Use export restrictions and firewalls

### At Rest
- **Filesystem**: Use encrypted filesystems (LUKS) for sensitive data
- **Database**: Encrypt sensitive fields (see backend code)
- **Logs**: Rotate and compress logs, restrict access
- **Backups**: Encrypt backup files at rest

**Enable LUKS Encryption:**
```bash
sudo cryptsetup luksFormat /dev/sdb1
sudo cryptsetup luksOpen /dev/sdb1 storage
sudo mkfs.ext4 /dev/mapper/storage
```

### Filesystem Isolation

**User Jailing** (FTP):
```bash
# User confined to home directory
chroot /home/ftpuser
```


---

## Infrastructure Security

### System Hardening

**Kernel Parameters** (`/etc/sysctl.conf`):
```bash
# Disable magic sysrq key
kernel.sysrq = 0

# Restrict PTRACE scope
kernel.yama.ptrace_scope = 2

# Enable ASLR
kernel.randomize_va_space = 2

# Restrict access to kernel logs
kernel.dmesg_restrict = 1
```

**Firewall Rules**:
```bash
# Deny all by default
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow specific ports
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 3000/tcp    # Web UI
sudo ufw allow 139/tcp     # SMB
sudo ufw allow 445/tcp     # SMB
sudo ufw allow 2049/tcp    # NFS
sudo ufw allow 21/tcp      # FTP
```

**SSH Hardening** (if using remote access):
```bash
# Edit /etc/ssh/sshd_config
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
Protocol 2
X11Forwarding no
```

### File Permissions

**Critical Directories**:
```bash
# Restrict system configuration
sudo chmod 700 /etc/nas/
sudo chown root:root /etc/nas/

# Restrict application data
sudo chmod 750 /var/lib/apexnas/
sudo chown apexnas:apexnas /var/lib/apexnas/

# Restrict storage
sudo chmod 750 /mnt/storage/
```

**Log Files**:
```bash
# Restrict access to logs
sudo chmod 640 /var/log/apexnas/*.log
sudo chown root:adm /var/log/apexnas/
```



## Operational Security

### Access Control

**Never Share Credentials**:
- Each user has unique account
- Service accounts isolated
- Rotate credentials regularly

**MFA** (Multi-Factor Authentication):
- Currently JWT only
- Future: TOTP/U2F support

### Secrets Management

**Environment Variables** (`.env`):
- Never commit to git (`*.env` in `.gitignore`)
- Use strong random secrets
- Rotate quarterly

**Generate Secrets:**
```bash
# Generate JWT secret
openssl rand -base64 32

# Generate secure passwords
pwgen -s 20 1
```

### Audit Logging

**What's Logged**:
- User logins (success and failure)
- Configuration changes
- Data access (read/write)
- Administrative actions
- Errors and exceptions

**Log Retention**:
```json
{
  "maxSize": "100M",
  "maxFiles": 30,
  "maxDays": 90
}
```

**View Logs**:
```bash
# Backend logs
tail -f /var/log/apexnas/combined.log

# System logs
journalctl -u apexnas -f
```

### Network Monitoring

**Monitor Connections**:
```bash
# Connections to web interface
ss -tuln | grep 3000

# SMB connections
netstat -tuln | grep 139

# NFS connections
netstat -tuln | grep 2049
```

---

## Incident Response

### Security Incident Process

1. **Detect**: Identify unusual activity
   - Failed login attempts
   - Unauthorized file access
   - Unexpected resource usage
   - Error spikes

2. **Contain**: Stop the bleeding
   - Disable affected account
   - Disconnect compromised device
   - Save evidence/logs

3. **Investigate**: Root cause analysis
   - Review audit logs
   - Check system state
   - Analyze network traffic
   - Interview users

4. **Remediate**: Fix the problem
   - Patch vulnerabilities
   - Reset credentials
   - Remove malicious code
   - Update access controls

5. **Recover**: Restore service
   - Restart services
   - Verify integrity
   - Test all functions
   - Monitor for recurrence

6. **Learn**: Prevent future incidents
   - Update security policies
   - Improve monitoring
   - Train users
   - Document lessons learned

### Breach Scenario

**If credentials compromised:**
1. Log out all sessions
2. Change password immediately
3. Revoke API tokens
4. Review recent changes
5. Audit file access
6. Rotate SSH keys
7. Monitor for suspicious activity

---

## Security Checklist

### Initial Setup ✅
- [ ] Change default admin password (minimum 20 chars)
- [ ] Generate strong JWT_SECRET
- [ ] Review environment variables
- [ ] Disable unnecessary services
- [ ] Configure firewall rules
- [ ] Enable SSH key authentication (if using SSH)

### Ongoing Operations ✅
- [ ] Monitor audit logs daily
- [ ] Review user access quarterly
- [ ] Update system packages monthly
- [ ] Rotate credentials every 90 days
- [ ] Test backup/recovery process quarterly
- [ ] Review security events after incidents

### Network Security ✅
- [ ] Use TLS/HTTPS for remote access
- [ ] Restrict network access (firewall)
- [ ] Use VPN for remote connections
- [ ] Monitor bandwidth anomalies
- [ ] Log all network connections
- [ ] Test intrusion detection

### Data Security ✅
- [ ] Backup data regularly (daily)
- [ ] Test backup restoration
- [ ] Encrypt sensitive data
- [ ] Restrict file permissions
- [ ] Audit data access logs
- [ ] Securely destroy old backups

### Disaster Recovery ✅
- [ ] Document disaster recovery plan
- [ ] Test recovery process annually
- [ ] Maintain offline backups
- [ ] Plan for data loss scenarios
- [ ] Document communication plan

---

## Security Resources

### Configuration Files to Harden
- `/etc/nas/config.json` - System configuration
- `backend/.env` - Application secrets

### Further Reading
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Linux Kernel Hardening](https://wiki.ubuntu.com/Hardening)
- [CIS Benchmarks](https://www.cisecurity.org/cis-benchmarks/)

---

**Security Status**: ✅ Production Ready  
**Last Reviewed**: May 13, 2026  
**Next Review Due**: August 13, 2026
