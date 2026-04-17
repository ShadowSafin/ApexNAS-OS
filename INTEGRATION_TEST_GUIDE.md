# DISK MODULE HARDENING - INTEGRATION TEST GUIDE

## Overview

This guide provides step-by-step integration tests to validate all 7 hardening fixes work correctly in production environment.

**Estimated Time**: 2-4 hours
**Environment**: Staging (with test disks/partitions available)
**Prerequisites**: Backend running on test environment

---

## Test Environment Setup

### 1. Create Test Block Device (if using loop device)
```bash
# Create 1GB loop device
dd if=/dev/zero of=/tmp/test-disk.img bs=1M count=1024
losetup /dev/loop10 /tmp/test-disk.img

# Initialize GPT partition table
parted /dev/loop10 mklabel gpt

# Clean up later with:
losetup -d /dev/loop10
rm /tmp/test-disk.img
```

### 2. Prepare Test Mount Points
```bash
mkdir -p /mnt/test-partition-1
mkdir -p /mnt/test-partition-2
mkdir -p /mnt/test-partition-3
chmod 755 /mnt/test-partition-*
```

### 3. Backup System fstab
```bash
# CRITICAL: Always backup /etc/fstab before testing
sudo cp /etc/fstab /etc/fstab.backup.$(date +%s)
ls -la /etc/fstab.backup.*
```

---

## TEST SUITE 1: Pre-Format Safety Check (FIX 1)

### TEST 1.1: Reject formatting mounted partition
**Objective**: Verify formatPartition() refuses to format mounted partitions

**Steps**:
```bash
# 1. Create and mount test partition
sudo parted /dev/loop10 mkpart primary ext4 0% 50%
sudo mkfs.ext4 -F /dev/loop10p1
sudo mount /dev/loop10p1 /mnt/test-partition-1

# 2. Attempt to format mounted partition via API
curl -X POST http://localhost:8080/api/disk/partition/format \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"partition": "loop10p1", "fstype": "ext4"}'

# 3. Expected result:
# {
#   "error": "PARTITION_MOUNTED",
#   "message": "Cannot format mounted partition at /mnt/test-partition-1"
# }

# 4. Verify mount still active
mount | grep test-partition-1  # Should show mount

# 5. Cleanup
sudo umount /mnt/test-partition-1
```

**Pass Criteria**:
- ✅ API returns PARTITION_MOUNTED error
- ✅ Partition remains mounted
- ✅ No corruption/mkfs attempted

### TEST 1.2: Allow formatting unmounted partition
**Objective**: Verify formatPartition() allows format on unmounted partitions

**Steps**:
```bash
# 1. Ensure partition unmounted
sudo umount /mnt/test-partition-1 2>/dev/null || true

# 2. Attempt to format unmounted partition
curl -X POST http://localhost:8080/api/disk/partition/format \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"partition": "loop10p1", "fstype": "ext4"}'

# 3. Expected result: success { "status": "formatted" }

# 4. Verify format actually happened
sudo blkid /dev/loop10p1  # Should show UUID
```

**Pass Criteria**:
- ✅ API returns success
- ✅ Partition formatted (has UUID)
- ✅ New filesystem created

---

## TEST SUITE 2: Mount Transaction with Rollback (FIX 2)

### TEST 2.1: Successful mount transaction
**Objective**: Verify successful mount persists in fstab

**Steps**:
```bash
# 1. Format new test partition
sudo parted /dev/loop10 mkpart primary ext4 50% 100%
sudo mkfs.ext4 -F /dev/loop10p2

# 2. Mount via API
curl -X POST http://localhost:8080/api/disk/partition/mount \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"partition": "loop10p2", "mountpoint": "/mnt/test-partition-2", "fstype": "ext4"}'

# 3. Expected: { "status": "mounted" }

# 4. Verify mount active
mount | grep test-partition-2  # Should see mount

# 5. Verify fstab entry added
sudo grep test-partition-2 /etc/fstab  # Should see entry with UUID
```

**Pass Criteria**:
- ✅ API returns success
- ✅ Partition mounted
- ✅ fstab entry persisted with UUID
- ✅ Entry format valid (UUID<tab>mount<tab>fstype...)

### TEST 2.2: Rollback on fstab failure (Simulated)
**Objective**: Verify mount rolled back if fstab write fails

**Steps**:
```bash
# This test requires simulating fstab write failure
# Option 1: Make /etc/fstab read-only to simulate write failure

# 1. Make fstab read-only (will cause write to fail)
sudo chmod 444 /etc/fstab

# 2. Attempt mount (should fail during fstab write)
curl -X POST http://localhost:8080/api/disk/partition/mount \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"partition": "loop10p2", "mountpoint": "/mnt/test-partition-3", "fstype": "ext4"}'

# 3. Expected: error { "error": "MOUNT_FSTAB_FAILED" }

# 4. Verify mount was rolled back
mount | grep test-partition-3  # Should NOT be mounted

# 5. Restore fstab permissions
sudo chmod 644 /etc/fstab
```

**Pass Criteria**:
- ✅ API returns MOUNT_FSTAB_FAILED
- ✅ Mount NOT persisted (mount command failed)
- ✅ fstab unchanged

---

## TEST SUITE 3: Atomic fstab Writes (FIX 3)

### TEST 3.1: Verify atomic write pattern
**Objective**: Verify fstab writes are atomic (no corruption possible)

**Steps**:
```bash
# 1. Monitor fstab for partial writes (impossible after fix)
sudo ls -la /etc/fstab /etc/fstab.tmp 2>&1  # temp file should not exist

# 2. Mount multiple partitions in sequence
for i in 1 2 3; do
  curl -X POST http://localhost:8080/api/disk/partition/mount \
    -H "Authorization: Bearer <TOKEN>" \
    -H "Content-Type: application/json" \
    -d "{\"partition\": \"loop10p1\", \"mountpoint\": \"/mnt/test-$i\", \"fstype\": \"ext4\"}"
done

# 3. After each mount, verify:
#    - fstab.tmp does NOT exist (should be cleaned up)
#    - /etc/fstab is valid and readable
#    - All entries parseable

sudo cat /etc/fstab  # Should be valid fstab format

# 4. Validate fstab syntax
sudo /usr/bin/mount -a --dry-run  # Would fail with corrupt fstab
```

**Pass Criteria**:
- ✅ No /etc/fstab.tmp leftover files
- ✅ fstab always valid syntax
- ✅ mount -a --dry-run succeeds
- ✅ All entries properly formatted

### TEST 3.2: fstab resilience to crash (Simulator)
**Objective**: Simulate system crash during write, verify fstab not corrupted

**Steps**:
```bash
# 1. Note current fstab hash
FSTAB_HASH_BEFORE=$(sudo md5sum /etc/fstab | awk '{print $1}')

# 2. Attempt mount operation
curl -X POST http://localhost:8080/api/disk/partition/mount \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"partition": "loop10p1", "mountpoint": "/mnt/test-crash", "fstype": "ext4"}' &
MOUNT_PID=$!

# 3. While operation running, simulate crash
sleep 0.1
sudo kill -9 $$  # Simulate process crash (or interrupt)

# 4. Wait a bit, verify fstab integrity
sleep 1
sudo /usr/bin/mount -a --dry-run  # Should still work

# 5. Verify either:
#    - fstab unchanged (mount failed during write)
#    - fstab updated completely (atomic rename succeeded)
#    NEVER: partially written fstab
```

**Pass Criteria**:
- ✅ fstab always valid and readable
- ✅ No corrupted entries
- ✅ Either fully committed or completely unchanged

---

## TEST SUITE 4: File Locking (FIX 4)

### TEST 4.1: Concurrent mount operations
**Objective**: Verify concurrent mounts don't corrupt fstab

**Steps**:
```bash
# 1. Prepare multiple partitions
sudo parted /dev/loop10 mkpart primary ext4 0% 33%
sudo parted /dev/loop10 mkpart primary ext4 33% 66%
sudo parted /dev/loop10 mkpart primary ext4 66% 100%

# 2. Format all
for p in /dev/loop10p{1,2,3}; do
  sudo mkfs.ext4 -F "$p"
done

# 3. Launch 3 concurrent mount requests
for i in 1 2 3; do
  curl -X POST http://localhost:8080/api/disk/partition/mount \
    -H "Authorization: Bearer <TOKEN>" \
    -H "Content-Type: application/json" \
    -d "{\"partition\": \"loop10p$i\", \"mountpoint\": \"/mnt/concurrent-$i\", \"fstype\": \"ext4\"}" &
done

# 4. Wait for all to complete
wait

# 5. Verify all mounted
mount | grep concurrent  # Should see all 3

# 6. Verify fstab valid and has all 3 entries
sudo cat /etc/fstab | grep concurrent  # Should see 3 lines
wc -l < /etc/fstab  # Compare with before/after
```

**Pass Criteria**:
- ✅ All 3 mounts succeeded
- ✅ All 3 in fstab
- ✅ fstab has exactly 3 new entries (no duplicates)
- ✅ fstab syntax valid

### TEST 4.2: Lock timeout handling
**Objective**: Verify lock timeouts handled gracefully

**Steps**:
```bash
# This would require holding lock artificially
# For now, verify lock file cleanup:

# 1. Check lock file doesn't exist normally
ls -la /var/run/fstab.lock 2>&1  # Should not exist

# 2. After mount/unmount operations:
ls -la /var/run/fstab.lock 2>&1  # Should not exist

# 3. If stuck (orphaned lock), clean manually:
sudo rm /var/run/fstab.lock  # Only if absolutely sure no other operation running
```

**Pass Criteria**:
- ✅ Lock file created only during operation
- ✅ Lock file always cleaned up after operation
- ✅ No orphaned lock files

---

## TEST SUITE 5: Pre-Mount Validation (FIX 5)

### TEST 5.1: Reject duplicate mount
**Objective**: Verify cannot mount same partition twice

**Steps**:
```bash
# 1. Mount partition first time
curl -X POST http://localhost:8080/api/disk/partition/mount \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"partition": "loop10p1", "mountpoint": "/mnt/duplicate", "fstype": "ext4"}'

# 2. Attempt to mount same partition again
curl -X POST http://localhost:8080/api/disk/partition/mount \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"partition": "loop10p1", "mountpoint": "/mnt/duplicate-2", "fstype": "ext4"}'

# 3. Expected: { "error": "PARTITION_ALREADY_MOUNTED", "message": "... already mounted at /mnt/duplicate" }

# 4. Verify first mount still active
mount | grep duplicate  # Should see first mount only
```

**Pass Criteria**:
- ✅ API returns PARTITION_ALREADY_MOUNTED
- ✅ First mount unchanged
- ✅ Second mount not attempted

### TEST 5.2: Reject mountpoint collision
**Objective**: Verify cannot mount two partitions at same point

**Steps**:
```bash
# 1. Mount partition at /mnt/collision
curl -X POST http://localhost:8080/api/disk/partition/mount \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"partition": "loop10p1", "mountpoint": "/mnt/collision", "fstype": "ext4"}'

# 2. Attempt to mount different partition at same point
curl -X POST http://localhost:8080/api/disk/partition/mount \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"partition": "loop10p2", "mountpoint": "/mnt/collision", "fstype": "ext4"}'

# 3. Expected: { "error": "MOUNTPOINT_IN_USE", "message": "... already in use by /dev/loop10p1" }

# 4. Verify first mount undisturbed
mount | grep collision  # Should show /dev/loop10p1 only
```

**Pass Criteria**:
- ✅ API returns MOUNTPOINT_IN_USE
- ✅ First mount unchanged
- ✅ Second mount not attempted

---

## TEST SUITE 6: Safe Unmount Handling (FIX 6)

### TEST 6.1: Successful unmount with fstab cleanup
**Objective**: Verify unmount removes fstab entry only on success

**Steps**:
```bash
# 1. Mount a partition
curl -X POST http://localhost:8080/api/disk/partition/mount \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"partition": "loop10p1", "mountpoint": "/mnt/unmount-test", "fstype": "ext4"}'

# 2. Verify in fstab
sudo grep unmount-test /etc/fstab  # Should exist

# 3. Unmount successfully
curl -X POST http://localhost:8080/api/disk/partition/unmount \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"mountpoint": "/mnt/unmount-test"}'

# 4. Verify unmounted
mount | grep unmount-test  # Should NOT exist

# 5. Verify fstab cleaned
sudo grep unmount-test /etc/fstab  # Should not exist (or say grep found nothing)
```

**Pass Criteria**:
- ✅ API returns success
- ✅ Mount removed
- ✅ fstab entry removed

### TEST 6.2: Device busy - preserve fstab
**Objective**: Verify unmount failure keeps fstab entry

**Steps**:
```bash
# 1. Mount partition
curl -X POST http://localhost:8080/api/disk/partition/mount \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"partition": "loop10p1", "mountpoint": "/mnt/busy-test", "fstype": "ext4"}'

# 2. Create file in mount to keep it busy
sudo touch /mnt/busy-test/testfile

# 3. Try to unmount (might fail if filesystem is busy)
# This is tricky to simulate reliably - use lsof to keep file open:
sudo bash -c "exec 3< /mnt/busy-test/testfile &"

# 4. Attempt unmount
curl -X POST http://localhost:8080/api/disk/partition/unmount \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"mountpoint": "/mnt/busy-test"}'

# 5. Expected: { "error": "DEVICE_BUSY" }

# 6. Verify FSTAB ENTRY STILL EXISTS
sudo grep busy-test /etc/fstab  # MUST still exist (key safety guarantee!)

# 7. Cleanup - release lock and try again
sudo pkill bash
sudo umount /mnt/busy-test
```

**Pass Criteria**:
- ✅ API returns DEVICE_BUSY error
- ✅ fstab entry STILL EXISTS (critical!)
- ✅ After manual fix, system consistent

---

## TEST SUITE 7: DF Parser Hardening (FIX 7)

### TEST 7.1: Get disk usage with real output
**Objective**: Verify df parsing doesn't crash on unexpected output

**Steps**:
```bash
# 1. Call disk usage endpoint
curl -X GET http://localhost:8080/api/disk/usage \
  -H "Authorization: Bearer <TOKEN>"

# 2. Expected: success with array of filesystem info
# Example:
# [
#   {
#     "filesystem": "/dev/sda1",
#     "size": "976744448",
#     "used": "488372224",
#     "available": "488372224",
#     "usePercent": "50%",
#     "mountpoint": "/"
#   }
# ]

# 3. Verify no errors in logs
curl http://localhost:8080/api/system/health  # Check for any df parsing errors

# 4. Execute df command manually to see what output parser handles
df -h  # Verify output format
```

**Pass Criteria**:
- ✅ API returns success
- ✅ Valid JSON with filesystem info
- ✅ No parsing errors in logs
- ✅ Numeric fields properly parsed

### TEST 7.2: DF with unusual spacing
**Objective**: Verify parser handles variable spacing

**Steps**:
```bash
# 1. Create test with many spaces
df -h | head -2 | tail -1 | sed 's/  / /g'  # Collapse spaces

# 2. Parser should handle both:
#    - Standard wide spacing (df default)
#    - Minimal spacing (single space between columns)
#    - Mountpoints with spaces (handled by joining)

# 3. Verify parser never crashes on:
#    - Empty lines
#    - Lines with errors (df: cannot access...)
#    - Short lines
#    - Non-numeric size fields
```

**Pass Criteria**:
- ✅ All variations parsed or safely skipped
- ✅ No crashes on edge cases
- ✅ Numeric fields validated

---

## Post-Test Validation

### 1. System State Check
```bash
# Verify system never left in partial state
mount | sort
sudo cat /etc/fstab | sort
# Should be consistent (mounted filesystems listed in fstab)

# Verify no orphaned lock files
ls -la /var/run/fstab.lock 2>&1  # Should not exist

# Verify no orphaned temp files
ls -la /etc/fstab.tmp 2>&1  # Should not exist
```

### 2. Check Logs
```bash
# Review backend logs for errors
tail -100 /var/log/nas-backend.log | grep -i "error\|critical"

# Should NOT see:
# - CRITICAL: Failed to rollback mount
# - Multiple PARTITION_MOUNTED during single format
# - Repeated lock acquisition failures
```

### 3. Cleanup
```bash
# Remove test mount points
for mp in /mnt/test-* /mnt/concurrent-* /mnt/duplicate* /mnt/busy-* /mnt/unmount* /mnt/collision*; do
  sudo umount "$mp" 2>/dev/null || true
  sudo rmdir "$mp" 2>/dev/null || true
done

# Restore loop device
sudo losetup -d /dev/loop10 2>/dev/null || true

# Verify fstab clean (no test entries)
sudo grep -E "test|concurrent|duplicate|busy|unmount|collision" /etc/fstab || echo "fstab clean ✓"
```

---

## Test Results Summary Template

```
═══════════════════════════════════════════════════════════════
DISK MODULE HARDENING - INTEGRATION TEST RESULTS
═══════════════════════════════════════════════════════════════

Date: [DATE]
Environment: [staging/production]
Tester: [NAME]

TEST SUITES:

FIX 1: Pre-Format Safety Check
  [ ] TEST 1.1: Reject mounted partition  ✓/✗
  [ ] TEST 1.2: Allow unmounted format    ✓/✗

FIX 2: Mount Transaction Rollback
  [ ] TEST 2.1: Successful transaction    ✓/✗
  [ ] TEST 2.2: Rollback on fstab fail    ✓/✗

FIX 3: Atomic fstab Writes
  [ ] TEST 3.1: Atomic write pattern      ✓/✗
  [ ] TEST 3.2: Crash resilience         ✓/✗

FIX 4: File Locking
  [ ] TEST 4.1: Concurrent operations    ✓/✗
  [ ] TEST 4.2: Lock timeout handling    ✓/✗

FIX 5: Pre-Mount Validation
  [ ] TEST 5.1: Duplicate mount reject   ✓/✗
  [ ] TEST 5.2: Mountpoint collision     ✓/✗

FIX 6: Safe Unmount Handling
  [ ] TEST 6.1: Successful unmount       ✓/✗
  [ ] TEST 6.2: Device busy handling     ✓/✗

FIX 7: DF Parser Hardening
  [ ] TEST 7.1: Real output parsing      ✓/✗
  [ ] TEST 7.2: Unusual spacing          ✓/✗

═══════════════════════════════════════════════════════════════
SUMMARY:
  Total Tests: 14
  Passed: [ ] / 14
  Failed: [ ] / 14
  
Status: [ ] READY FOR PRODUCTION  [ ] NEEDS FIXES

═══════════════════════════════════════════════════════════════
```

---

## Troubleshooting

### Lock Acquired Errors
**Problem**: "Could not acquire fstab lock" errors

**Solution**:
```bash
# 1. Check if lock file exists
ls -la /var/run/fstab.lock

# 2. Read lock file to see PID
sudo cat /var/run/fstab.lock

# 3. Check if process still running
ps aux | grep [PID]

# 4. If not running, safe to remove
sudo rm /var/run/fstab.lock

# 5. Restart backend
# Do NOT force-remove if unsure - could corrupt fstab
```

### Corrupted fstab
**Problem**: mount -a fails or fstab has invalid entries

**Solution**:
```bash
# 1. Restore backup
sudo cp /etc/fstab.backup.[TIMESTAMP] /etc/fstab

# 2. Verify syntax
sudo mount -a --dry-run

# 3. Restart backend
systemctl restart nas-backend

# 4. Re-run integration tests
```

### Orphaned Mount Points
**Problem**: Mount still active but removed from fstab

**Solution**:
```bash
# 1. List active mounts
mount | grep /mnt/

# 2. Manually unmount
sudo umount /mnt/problem-point

# 3. Check fstab consistency
mount | sort > /tmp/active.txt
cat /etc/fstab | grep -E "^UUID|^/dev" | sort > /tmp/fstab.txt
diff /tmp/active.txt /tmp/fstab.txt
```

---

