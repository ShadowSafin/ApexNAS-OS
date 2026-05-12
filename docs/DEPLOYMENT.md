# ApexNAS Deployment Guide

Complete guide for deploying ApexNAS to production environments.

## Table of Contents
- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Production Environment Setup](#production-environment-setup)
- [SSL/TLS Configuration](#ssltls-configuration)
- [Reverse Proxy Setup](#reverse-proxy-setup)
- [Backup Strategy](#backup-strategy)
- [Monitoring & Alerts](#monitoring--alerts)
- [Performance Tuning](#performance-tuning)
- [Disaster Recovery](#disaster-recovery)

---

## Pre-Deployment Checklist

### Code & Configuration
- [ ] All code reviewed and tested
- [ ] Security hardening applied ([docs/SECURITY.md](SECURITY.md))
- [ ] Environment variables configured
- [ ] SSL certificates obtained
- [ ] Database initialized and tested
- [ ] Backups configured and tested
- [ ] Monitoring configured
- [ ] Runbooks created
- [ ] Team trained

### Infrastructure
- [ ] Dedicated production server(s)
- [ ] Network configured (static IP, DNS)
- [ ] Firewall rules applied
- [ ] Storage provisioned (RAID configured)
- [ ] Network connectivity verified
- [ ] DNS records configured
- [ ] Time synchronization verified (`ntpd`)

### Data
- [ ] Production data backed up
- [ ] Migration plan documented
- [ ] Rollback plan documented
- [ ] Emergency contacts listed

---

## Production Environment Setup

### System Configuration

**Create System User**:
```bash
# Create unprivileged user for ApexNAS
sudo useradd -m -s /usr/sbin/nologin -d /var/lib/apexnas apexnas

# Add to necessary groups
sudo usermod -aG disk apexnas          # Storage management access
sudo usermod -aG systemd-journal apexnas  # Journal access
```

**Directory Structure**:
```bash
# Create required directories
sudo mkdir -p /var/lib/apexnas
sudo mkdir -p /etc/nas
sudo mkdir -p /var/log/apexnas
sudo mkdir -p /mnt/storage

# Set permissions
sudo chown -R apexnas:apexnas /var/lib/apexnas
sudo chown -R apexnas:apexnas /var/log/apexnas
sudo chown -R apexnas:apexnas /etc/nas
sudo chmod 750 /var/lib/apexnas
sudo chmod 750 /var/log/apexnas
sudo chmod 750 /etc/nas
```

### Production Environment Variables

`backend/.env`:
```env
# Application
NODE_ENV=production
PORT=8080
API_URL=https://apexnas.example.com
FRONTEND_URL=https://apexnas.example.com

# Security
JWT_SECRET=<generate-with>_openssl-rand-base64-32
JWT_EXPIRY=3600
ADMIN_PASSWORD=<strong-password>

# Storage
STORAGE_PATH=/mnt/storage
DATA_PATH=/var/lib/apexnas

# Logging
LOG_LEVEL=info
LOG_PATH=/var/log/apexnas
LOG_MAX_SIZE=100M
LOG_MAX_FILES=30



# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090

# External Services
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=alerts@example.com
SMTP_PASSWORD=<password>
```

### Install as Systemd Service

`/etc/systemd/system/apexnas.service`:
```ini
[Unit]
Description=ApexNAS Network Attached Storage
After=network.target

[Service]
Type=simple
User=apexnas
WorkingDirectory=/opt/apexnas
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=apexnas

# Resource limits
LimitNOFILE=65535
LimitNPROC=65535
MemoryLimit=2G

[Install]
WantedBy=multi-user.target
```

**Enable and Start**:
```bash
sudo systemctl daemon-reload
sudo systemctl enable apexnas
sudo systemctl start apexnas

# Verify
sudo systemctl status apexnas
sudo journalctl -u apexnas -f
```

---

## SSL/TLS Configuration

### Obtain SSL Certificate

**Option 1: Let's Encrypt (Recommended)**
```bash
# Install certbot
sudo apt update
sudo apt install certbot python3-certbot-nginx

# Request certificate
sudo certbot certonly --standalone \
  -d apexnas.example.com \
  -d *.example.com \
  --email admin@example.com \
  --agree-tos

# Auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

**Option 2: Self-Signed Certificate (Testing)**
```bash
# Generate self-signed certificate
sudo openssl req -x509 -newkey rsa:4096 -keyout /etc/ssl/private/apexnas.key \
  -out /etc/ssl/certs/apexnas.crt -days 365 -nodes
```

### Certificate Renewal
```bash
# Automatic renewal (Let's Encrypt)
sudo certbot renew --dry-run

# Manual renewal
sudo certbot renew
```

---

## Reverse Proxy Setup

### Nginx Configuration

`/etc/nginx/sites-available/apexnas`:
```nginx
upstream apexnas_backend {
    least_conn;
    server localhost:8080 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name apexnas.example.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name apexnas.example.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/apexnas.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/apexnas.example.com/privkey.pem;
    
    # SSL Security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Logging
    access_log /var/log/nginx/apexnas-access.log;
    error_log /var/log/nginx/apexnas-error.log;

    # Proxy Configuration
    client_max_body_size 10G;
    proxy_read_timeout 300s;
    proxy_connect_timeout 300s;

    location / {
        proxy_pass http://apexnas_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
    }

    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Deny access to sensitive files
    location ~ /\. {
        deny all;
    }
}
```

**Enable Nginx Site**:
```bash
sudo ln -s /etc/nginx/sites-available/apexnas /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

---

## Backup Strategy

### Automated Backups

**Daily Backups Script** (`/opt/apexnas/backup.sh`):
```bash
#!/bin/bash
set -e

BACKUP_DIR="/mnt/backups"
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/apexnas_backup_$BACKUP_DATE.tar.gz"

# Compress configuration and data
tar czf "$BACKUP_FILE" \
  /etc/nas \
  /var/lib/apexnas \
  backend/.env

# Retention: Keep last 30 days
find "$BACKUP_DIR" -name "apexnas_backup_*.tar.gz" -mtime +30 -delete

# Verify backup
if tar tzf "$BACKUP_FILE" > /dev/null; then
    echo "✅ Backup successful: $BACKUP_FILE"
else
    echo "❌ Backup verification failed"
    exit 1
fi

# Optional: Upload to cloud storage
# aws s3 cp "$BACKUP_FILE" s3://backups/apexnas/
```

**Cron Job** (`/etc/cron.d/apexnas-backup`):
```cron
# Daily backup at 2 AM
0 2 * * * root /opt/apexnas/backup.sh >> /var/log/apexnas/backup.log 2>&1

# Weekly full backup (more retention)
0 3 * * 0 root /opt/apexnas/backup-full.sh
```

### Off-Site Backups

**To Cloud Storage (S3)**:
```bash
# Install AWS CLI
sudo apt install awscli

# Configure credentials
aws configure

# Backup script addition
aws s3 cp "$BACKUP_FILE" s3://my-org-backups/apexnas/
```

**Backup Verification**:
```bash
# Test restore process monthly
tar tzf /mnt/backups/apexnas_backup_*.tar.gz | head -20
```

---

## Monitoring & Alerts

### System Monitoring

**Install Prometheus** (optional):
```bash
sudo apt install prometheus grafana-server

# Configure Prometheus
sudo nano /etc/prometheus/prometheus.yml
```

**Metrics Collection**:
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'apexnas'
    static_configs:
      - targets: ['localhost:9090']
```

### Alert Thresholds

Configure alerts for:
- CPU > 80%
- Memory > 90%
- Disk > 85%
- Failed backups
- Service down
- High error rate (>1%)
- Login failures (>5 in 10min)

### Log Aggregation

**View Logs**:
```bash
# System logs
sudo journalctl -u apexnas -n 100 -f

# Error logs
tail -f /var/log/apexnas/error.log

# Access logs (via Nginx)
tail -f /var/log/nginx/apexnas-access.log
```

**Log Rotation**:
```bash
# Automatic rotation via logrotate
sudo nano /etc/logrotate.d/apexnas

/var/log/apexnas/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 640 apexnas apexnas
    sharedscripts
    postrotate
        systemctl reload apexnas > /dev/null 2>&1 || true
    endscript
}
```

---

## Performance Tuning

### Kernel Tuning

`/etc/sysctl.d/99-apexnas.conf`:
```bash
# Increase file descriptor limits
fs.file-max = 2097152

# Increase connection backlog
net.core.somaxconn = 65500
net.ipv4.tcp_max_syn_backlog = 65500

# Optimize TCP
net.ipv4.tcp_tw_reuse = 1
net.ipv4.ip_local_port_range = 10000 65000

# Increase buffer sizes
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728

# Optimize for NAS workload
vm.dirty_ratio = 30
vm.dirty_background_ratio = 10
```

**Apply**:
```bash
sudo sysctl -p /etc/sysctl.d/99-apexnas.conf
```

### Storage Optimization

**RAID Configuration**:
```bash
# Monitor RAID rebuild speed
cat /proc/mdstat

# Adjust rebuild speed (useful for production)
echo 100000 | sudo tee /sys/block/md0/md/stripe_cache_size
```

**Filesystem Tuning**:
```bash
# ext4 mount options for performance
/dev/md0 /mnt/storage ext4 defaults,noatime,nodiratime,discard 0 2
```

### Database Optimization (if using)

- Index frequently queried fields
- Optimize query patterns
- Implement caching layer
- Archive old logs

---

## Disaster Recovery

### Disaster Recovery Plan

1. **Prevention**: Maintain backups, monitor system
2. **Detection**: Alert on failures, audit logs
3. **Recovery**: Restore from backups, verify data
4. **Validation**: Test all services, notify users
5. **Documentation**: Post-mortem, lessons learned

### Restore Procedure

```bash
# 1. Stop ApexNAS service
sudo systemctl stop apexnas

# 2. Restore from backup
cd /
sudo tar xzf /mnt/backups/apexnas_backup_20260513_100000.tar.gz

# 3. Restore database
# (If using database)

# 4. Verify permissions
sudo chown -R apexnas:apexnas /var/lib/apexnas

# 5. Start service
sudo systemctl start apexnas

# 6. Verify
sudo systemctl status apexnas
```

### Failover (HA Setup)

For high-availability setups:
1. Run ApexNAS on multiple nodes
2. Use shared storage (NFS, iSCSI)
3. Load balancer (nginx, HAProxy) routes traffic
4. Automatic failover on node failure
5. Regular health checks

See ops team for HA configuration details.

---

## Production Checklist

### Before Going Live
- [ ] All code deployed via CI/CD or manual review
- [ ] Database backups configured and tested
- [ ] Monitoring active with alert thresholds set
- [ ] SSL/TLS certificates installed
- [ ] Firewall rules verified
- [ ] User access provisioned
- [ ] Service runbooks created and tested
- [ ] On-call escalation process defined
- [ ] Users trained on critical features
- [ ] Go/no-go meeting completed

### Day 1 (Launch)
- [ ] Monitor all metrics closely
- [ ] Check error logs frequently
- [ ] Verify user access working
- [ ] Test backup process
- [ ] Document any issues
- [ ] Communication channels active

### Week 1 (Stabilization)
- [ ] Resolve any user issues
- [ ] Optimize based on real usage
- [ ] Review logs and alerts
- [ ] Refine runbooks
- [ ] Celebrate launch! 🎉

---

**Deployment Status**: Ready for Production  
**Last Updated**: May 13, 2026
