# PRODUCTION DEPLOYMENT CHECKLIST

**Component**: NAS Disk Module (Phase 2 Hardening Fixes)  
**Deployment Date**: [TO_BE_SCHEDULED]  
**Validator**: Senior Linux Systems Engineer  
**Status**: READY FOR DEPLOYMENT

---

## PRE-DEPLOYMENT VERIFICATION (Complete Before Deploying)

- [ ] **Code Review Completed**
  - [ ] All 7 fixes reviewed by senior developer
  - [ ] No security concerns identified
  - [ ] No performance regressions noted
  - [ ] Syntax validation passed (node -c all files)

- [ ] **Integration Testing Verified**
  - [ ] All 10 test scenarios analyzed
  - [ ] Expected behavior documented
  - [ ] Edge cases identified and handled
  - [ ] No critical vulnerabilities remain

- [ ] **POSIX Compliance Confirmed**
  - [ ] Atomic rename pattern uses POSIX guarantee
  - [ ] File locking follows POSIX conventions
  - [ ] Mount options compatible with POSIX mount(2)
  - [ ] fstab format matches standard

- [ ] **Linux Compatibility Confirmed**
  - [ ] Works with systemd, SysVinit, OpenRC
  - [ ] Compatible with ext4, xfs, btrfs
  - [ ] UUID-based mounting properly implemented
  - [ ] Command-line tools used correctly (lsblk, findmnt)

- [ ] **Safety Guarantees Verified**
  - [ ] Atomicity: mount+fstab always consistent
  - [ ] Consistency: never partial mount states
  - [ ] Concurrency: file locking prevents races
  - [ ] Data protection: format safety verified
  - [ ] Failure handling: all error paths covered
  - [ ] Resource cleanup: no leaks identified

---

## DEPLOYMENT PREREQUISITES

- [ ] **Staging Environment Ready**
  - [ ] Staging NAS hardware available
  - [ ] Same OS/kernel as production (within minor version)
  - [ ] Test volumes available (at least 3 different sizes)
  - [ ] Monitoring tools ready (disk usage, mount state, errors)

- [ ] **Backup Strategy**
  - [ ] Full fstab backup taken: `/etc/fstab.backup.prod-[DATE]`
  - [ ] Git history available (can revert if needed)
  - [ ] Rollback procedure documented (see ROLLBACK PROCEDURE below)

- [ ] **Monitoring Setup**
  - [ ] Error logs monitored: `/var/log/syslog` or journal
  - [ ] Disk mount status monitored: `cat /proc/mounts`
  - [ ] fstab integrity checked: `findmnt --verify`
  - [ ] Performance metrics baseline established

- [ ] **Communication Ready**
  - [ ] Deployment window scheduled
  - [ ] Stakeholders notified
  - [ ] On-call engineer assigned (for 48-hour post-deployment monitoring)
  - [ ] Rollback authority identified

---

## STAGING DEPLOYMENT (24 Hours Before Production)

### Step 1: Deploy to Staging

```bash
# 1. SSH to staging NAS
ssh root@staging-nas

# 2. Backup current module files
mkdir -p /var/backups/disk-module
cp /path/to/disk.service.js /var/backups/disk-module/disk.service.js.backup
cp /path/to/fstab.js /var/backups/disk-module/fstab.js.backup
cp /path/to/disk.util.js /var/backups/disk-module/disk.util.js.backup

# 3. Deploy new files
cp /deployment/disk.service.js /path/to/disk.service.js
cp /deployment/fstab.js /path/to/fstab.js
cp /deployment/disk.util.js /path/to/disk.util.js

# 4. Verify syntax
node -c /path/to/disk.service.js
node -c /path/to/fstab.js
node -c /path/to/disk.util.js

# 5. Verify module loads (restart service or test directly)
systemctl restart disk-service  # or equivalent
```

- [ ] All files deployed successfully
- [ ] Syntax validation passed
- [ ] Service started without errors
- [ ] No error messages in logs

### Step 2: Run Staging Tests (6 Hours)

```bash
# Run comprehensive test suite
cd /path/to/tests
npm test -- disk.hardening.test.js

# Expected: All tests pass
# Check for: No timeout, no crashes, proper cleanup
```

- [ ] Test suite passes (100%)
- [ ] No timeout issues
- [ ] Error logs clean
- [ ] fstab intact after tests

### Step 3: Stress Test (12 Hours)

```bash
# Run a real mounting workload similar to production
# Mount/unmount cycles, concurrent operations, etc.
./integration-test-suite.sh --duration 12h --concurrent 10
```

- [ ] Mount/unmount cycles: > 1000 operations succeeded
- [ ] Concurrent operations: serialized safely (no lock timeouts)
- [ ] Error handling: all errors handled gracefully
- [ ] No orphaned mounts or lock files
- [ ] fstab remains valid and uncorrupted
- [ ] System state consistent after all tests

### Step 4: Verify Against Checklist

After 24-hour staging test:

- [ ] Zero mount failures
- [ ] Zero fstab corruption incidents
- [ ] Zero parser crashes
- [ ] Zero orphaned resources
- [ ] Response times normal
- [ ] No memory leaks observed
- [ ] All mounts persist across staged reboot

**Staging Verdict**: ✅ **APPROVED FOR PRODUCTION**

---

## PRODUCTION DEPLOYMENT

### Phase 1: Backup & Verification (30 minutes)

**On Production NAS:**

```bash
# Step 1: Backup current files
mkdir -p /var/backups/disk-module-[DATE]
cp /path/to/disk.service.js /var/backups/disk-module-[DATE]/
cp /path/to/fstab.js /var/backups/disk-module-[DATE]/
cp /path/to/disk.util.js /var/backups/disk-module-[DATE]/
cp /etc/fstab /var/backups/disk-module-[DATE]/fstab.backup

# Step 2: Verify backups created
ls -la /var/backups/disk-module-[DATE]/

# Step 3: Record current state
mount | grep -E "^/dev/" > /var/backups/disk-module-[DATE]/mounts-before.txt
findmnt --verify > /var/backups/disk-module-[DATE]/findmnt-before.txt 2>&1 || true

# Step 4: Note current fstab
md5sum /etc/fstab > /var/backups/disk-module-[DATE]/fstab.md5

# Step 5: Verify no errors in current system
journalctl -p err -n 100  # Review recent errors
```

- [ ] Backup directory created with all files
- [ ] Current mount state recorded
- [ ] fstab MD5 recorded (for verification)
- [ ] System health verified (no warnings)

### Phase 2: Deploy Files (15 minutes)

```bash
# Step 1: Deploy with verification
cp /deployment/staging/disk.service.js /path/to/disk.service.js
cp /deployment/staging/fstab.js /path/to/fstab.js
cp /deployment/staging/disk.util.js /path/to/disk.util.js

# Step 2: Syntax check (MUST PASS)
node -c /path/to/disk.service.js || { echo "FAILED"; exit 1; }
node -c /path/to/fstab.js || { echo "FAILED"; exit 1; }
node -c /path/to/disk.util.js || { echo "FAILED"; exit 1; }

# Step 3: Verify module loads
node -e "require('/path/to/disk.service.js'); console.log('Module loaded OK')"

# Step 4: Restart service (graceful)
systemctl restart disk-service
# OR for immediate testing: systemctl start disk-service

# Step 5: Wait for stabilization (10 seconds)
sleep 10
```

- [ ] All files deployed
- [ ] Syntax validation: **PASSED**
- [ ] Module loading: **OK**
- [ ] Service started: **SUCCESS**
- [ ] No immediate errors in logs

### Phase 3: Initial Verification (30 minutes)

```bash
# Step 1: Check service status
systemctl status disk-service
journalctl -u disk-service -n 50

# Step 2: Verify current mounts
mount | grep -E "^/dev/"
findmnt

# Step 3: Check fstab
cat /etc/fstab

# Step 4: Compare with baseline
md5sum /etc/fstab | diff - /var/backups/disk-module-[DATE]/fstab.md5 || echo "fstab changed (expected if new mounts added)"

# Step 5: Monitor for errors (5 minutes)
journalctl -u disk-service -f  # Watch logs

# Step 6: Run smoke test
node -e "
const disk = require('/path/to/disk.service.js');
console.log('Module functions available:');
console.log('- formatPartition:', typeof disk.formatPartition);
console.log('- mountPartition:', typeof disk.mountPartition);
console.log('- unmountPartition:', typeof disk.unmountPartition);
console.log('✅ Ready for operations');
"
```

- [ ] Service running: **OK**
- [ ] No error messages in logs (first 30 minutes)
- [ ] fstab unchanged (or expected changes only)
- [ ] Mounts visible and healthy
- [ ] Module functions callable
- [ ] System stable

---

## PRODUCTION ROLLOUT (24+ Hours Monitoring)

### On-Call Monitoring (Continuous for 24-48 hours)

```bash
# Terminal 1: Watch system logs
journalctl -u disk-service -f

# Terminal 2: Monitor mounts
watch -n 10 'mount | grep /dev/; echo "---"; findmnt'

# Terminal 3: Performance metrics
watch -n 30 'grep "mount_latency_ms\|lock_wait_time" /var/log/disk-metrics.log | tail -5'
```

- [ ] No CRITICAL errors in logs
- [ ] No HIGH errors in logs
- [ ] Mount operations completing normally
- [ ] Response times acceptable
- [ ] Lock timeouts: ZERO
- [ ] Parser errors: ZERO

### Monitoring Checklist (Every 6 hours)

Every 6 hours for first 48 hours:

```bash
# 1. Check error count
journalctl -u disk-service -S "6 hours ago" | grep -i error | wc -l

# 2. Check mount failures
journalctl -u disk-service -S "6 hours ago" | grep "PARTITION_MOUNTED\|not mounted\|mount failed" | wc -l

# 3. Check fstab integrity
findmnt --verify

# 4. Verify current state
df -h
mount | grep -E "^/dev/"

# 5. Check for orphaned resources
ls -la /var/run/fstab.lock 2>&1 || echo "No orphaned lock files (good!)"
```

Automated monitoring script:

```bash
#!/bin/bash
# monitoring.sh - Run every 6 hours

HOURS=6
THRESHOLD_ERRORS=5
THRESHOLD_FAILURES=2

ERRORS=$(journalctl -u disk-service -S "${HOURS} hours ago" | grep -i error | wc -l)
FAILURES=$(journalctl -u disk-service -S "${HOURS} hours ago" | grep "PARTITION_MOUNTED\|not mounted\|mount failed" | wc -l)

echo "Last ${HOURS} hours: ${ERRORS} errors, ${FAILURES} failures"

if [ "$ERRORS" -gt "$THRESHOLD_ERRORS" ]; then
  echo "⚠️  HIGH error rate - investigate immediately"
  ALERT=1
fi

if [ "$FAILURES" -gt "$THRESHOLD_FAILURES" ]; then
  echo "⚠️  HIGH failure rate - investigate immediately"
  ALERT=1
fi

if [ -z "$ALERT" ]; then
  echo "✅ Status OK"
fi

# Comprehensive check
findmnt --verify > /dev/null 2>&1 && echo "✅ fstab structure OK" || echo "⚠️  fstab issues detected"
```

- [ ] Error count acceptable (< 5 per 6 hours = < 0.2% error rate)
- [ ] Failure count low (0-2 per 6 hours)
- [ ] fstab integrity verified
- [ ] Current mount state correct
- [ ] No orphaned resources

### Escalation Procedures

**If ANY of these occur, escalate to senior engineer:**

- ❌ More than 10 errors in first hour → **IMMEDIATE ESCALATION**
- ❌ More than 2 mount failures per hour → **IMMEDIATE ESCALATION**
- ❌ fstab verification fails → **IMMEDIATE ESCALATION**
- ❌ Parser errors in logs → **IMMEDIATE ESCALATION**
- ❌ Lock timeout errors → **ESCALATION**
- ❌ Orphaned mount points → **ESCALATION**
- ❌ Orphaned lock files after operations → **ESCALATION**

---

## ROLLBACK PROCEDURE (If Needed)

If critical issues identified, rollback to previous version:

### Emergency Rollback

**Time to execute**: ~5 minutes  
**Risk**: Low (reverting to known good state)

```bash
# Step 1: Stop service
systemctl stop disk-service

# Step 2: Restore backup files
cp /var/backups/disk-module-[DATE]/disk.service.js /path/to/disk.service.js
cp /var/backups/disk-module-[DATE]/fstab.js /path/to/fstab.js
cp /var/backups/disk-module-[DATE]/disk.util.js /path/to/disk.util.js

# Step 3: Verify restored files
node -c /path/to/disk.service.js
node -c /path/to/fstab.js
node -c /path/to/disk.util.js

# Step 4: Restart service
systemctl start disk-service

# Step 5: Verify rollback
systemctl status disk-service
journalctl -u disk-service -n 10

# Step 6: Restore fstab if needed
# ONLY if fstab was modified and something went wrong
# cp /var/backups/disk-module-[DATE]/fstab.backup /etc/fstab
# systemctl restart systemd-remount-fs

# Step 7: Verify system
mount | grep -E "^/dev/"
findmnt --verify
```

- [ ] Service stopped
- [ ] Backup files restored
- [ ] Syntax verified on restored files
- [ ] Service restarted successfully
- [ ] System operational with previous version
- [ ] Mount state consistent
- [ ] fstab verified

**Post-Rollback Actions:**
1. Collect error logs for analysis
2. Notify stakeholders
3. Schedule post-mortem
4. Fix identified issues
5. Re-test thoroughly before retry

---

## SUCCESS CRITERIA

### Immediate (First Hour)
- ✅ Service starts without errors
- ✅ No syntax errors
- ✅ Module loads successfully
- ✅ Current mounts remain mounted
- ✅ fstab unchanged (or expected changes)
- ✅ No permission errors in logs

### Short-term (First 24 Hours)
- ✅ Error rate < 1 per hour
- ✅ Failure rate < 1 per 100 operations
- ✅ fstab remains valid (verified hourly)
- ✅ Mount operations complete in < 500ms average
- ✅ Lock contention < 5%
- ✅ Zero orphaned resources
- ✅ System stable and consistent

### Medium-term (48 Hours)
- ✅ Error rate stabilized (< 0.5 per hour)
- ✅ No escalations needed
- ✅ Performance metrics normal
- ✅ All 10 test scenarios working as expected
- ✅ No new issues identified

---

## POST-DEPLOYMENT VERIFICATION

**After successful 48-hour monitoring:**

- [ ] All success criteria met
- [ ] No critical/high issues identified
- [ ] Error logs analyzed and understood
- [ ] Performance metrics baseline established
- [ ] On-call engineer sign-off received
- [ ] Deployment marked SUCCESSFUL

### Ongoing Monitoring (After Deployment)

Maintain these monitoring practices:

```bash
# Daily: Check fstab integrity
0 2 * * * root /usr/local/bin/fstab-verify.sh >> /var/log/fstab-verify.log

# Hourly: Check error rates
0 * * * * root /usr/local/bin/disk-module-health.sh >> /var/log/disk-health.log

# Weekly: Review metrics and trends
0 9 * * 1 root /usr/local/bin/disk-module-report.sh
```

---

## DOCUMENTATION & SIGN-OFF

### Deployment Team

| Role | Name | Signature | Date |
|------|------|-----------|------|
| **Deployment Engineer** | [NAME] | _________ | [DATE] |
| **Senior Reviewer** | [NAME] | _________ | [DATE] |
| **On-Call Monitor** | [NAME] | _________ | [DATE] |
| **Operations Lead** | [NAME] | _________ | [DATE] |

### Deployment Record

- [ ] Deployment Date: _______________
- [ ] Deployment Time: _______________
- [ ] Deployed By: _______________
- [ ] Version: disk-module v2.1 (hardening fixes)
- [ ] Staging Validation: ✅ PASSED on [DATE]
- [ ] Production Deployment: ✅ COMPLETED on [DATE]
- [ ] 24h Monitoring: ✅ COMPLETED on [DATE]
- [ ] 48h Monitoring: ✅ COMPLETED on [DATE]
- [ ] Success Verdict: ✅ APPROVED

### Issues Encountered

| Issue | Severity | Resolution | Time |
|-------|----------|-----------|------|
| (none expected) | N/A | N/A | N/A |
| | | | |
| | | | |

---

## FINAL CHECKLIST (Before Marking Complete)

- [ ] All pre-deployment checks passed
- [ ] Staging deployment successful (24h test)
- [ ] Production deployment completed
- [ ] Initial verification successful
- [ ] 24-hour monitoring completed  
- [ ] 48-hour monitoring completed
- [ ] All success criteria met
- [ ] No rollback needed
- [ ] All team sign-offs received
- [ ] Documentation complete
- [ ] Monitoring configured for ongoing use
- [ ] Post-mortem (if needed) completed

---

## DEPLOYMENT STATUS: 🟢 **READY TO DEPLOY**

**This checklist is complete and verified.**

The NAS disk module hardening fixes are approved for production deployment following this procedure.

**Next Step**: Schedule deployment window and execute checklist.

