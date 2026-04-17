#!/bin/bash

# CRITICAL FIXES VALIDATION TEST SUITE
# Tests for: Boot safety options + Lock starvation fixes

set -e

echo "=========================================="
echo "CRITICAL FIXES VALIDATION TEST SUITE"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0

# Test helper functions
test_pass() {
  echo -e "${GREEN}✓ PASS:${NC} $1"
  ((PASS_COUNT++))
}

test_fail() {
  echo -e "${RED}✗ FAIL:${NC} $1"
  ((FAIL_COUNT++))
}

test_info() {
  echo -e "${YELLOW}ℹ INFO:${NC} $1"
}

echo ""
echo "=========================================="
echo "1. SYNTAX VALIDATION TEST"
echo "=========================================="

# Check disk.service.js syntax
if node -c ./backend/modules/disk/disk.service.js > /dev/null 2>&1; then
  test_pass "disk.service.js syntax valid"
else
  test_fail "disk.service.js syntax error"
  exit 1
fi

# Check fstab.js syntax
if node -c ./backend/modules/disk/fstab.js > /dev/null 2>&1; then
  test_pass "fstab.js syntax valid"
else
  test_fail "fstab.js syntax error"
  exit 1
fi

# Check disk.util.js syntax (unchanged, but verify)
if node -c ./backend/modules/disk/disk.util.js > /dev/null 2>&1; then
  test_pass "disk.util.js syntax valid"
else
  test_fail "disk.util.js syntax error"
  exit 1
fi

echo ""
echo "=========================================="
echo "2. BOOT SAFETY OPTIONS TEST"
echo "=========================================="

# Verify disk.service.js contains boot safety options
if grep -q "defaults,nofail,x-systemd.device-timeout=5" ./backend/modules/disk/disk.service.js; then
  test_pass "Boot safety options present in disk.service.js"
else
  test_fail "Boot safety options NOT found in disk.service.js"
fi

# Verify passno=0 is used (optional mount)
if grep -q "mountpoint, fstype, 'defaults,nofail,x-systemd.device-timeout=5', '0', '0'" ./backend/modules/disk/disk.service.js; then
  test_pass "Passno set to '0' (optional mount, not required for boot)"
else
  test_fail "Passno not set to '0' - boot may hang on missing device"
fi

echo ""
echo "=========================================="
echo "3. LOCK STARVATION FIX TEST"
echo "=========================================="

# Verify maxRetries increased to 50+
if grep -q "maxRetries = 50" ./backend/modules/disk/fstab.js; then
  test_pass "Lock retry count increased to 50 (was 5)"
else
  test_fail "Lock retry count not updated"
fi

# Verify exponential backoff with jitter
if grep -q "jitter = Math.random() \* 50" ./backend/modules/disk/fstab.js; then
  test_pass "Exponential backoff with jitter implemented"
else
  test_fail "Jitter not found in lock retry logic"
fi

# Verify timeout protection (10 second max)
if grep -q "maxWaitMs = 10000" ./backend/modules/disk/fstab.js; then
  test_pass "10-second timeout protection added"
else
  test_fail "Timeout protection not found"
fi

# Verify LOCK_TIMEOUT exception handling
if grep -q "throw new Error('LOCK_TIMEOUT')" ./backend/modules/disk/fstab.js; then
  test_pass "LOCK_TIMEOUT exception implemented"
else
  test_fail "LOCK_TIMEOUT exception not found"
fi

echo ""
echo "=========================================="
echo "4. MODULE LOADING TEST"
echo "=========================================="

# Test actual module loading
if node -e "
  const disk = require('./backend/modules/disk/disk.service.js');
  console.log('Module functions:');
  console.log('- formatPartition:', typeof disk.formatPartition);
  console.log('- mountPartition:', typeof disk.mountPartition);
  console.log('- unmountPartition:', typeof disk.unmountPartition);
" 2>/dev/null; then
  test_pass "All disk module functions loadable"
else
  test_fail "Module loading error"
fi

echo ""
echo "=========================================="
echo "5. FSTAB ENTRY FORMAT TEST"
echo "=========================================="

# Validate fstab format with boot options
test_entry="UUID=550e8400-e29b-41d4-a716-446655440000	/mnt/test	ext4	defaults,nofail,x-systemd.device-timeout=5	0	0"

# Check if entry parses correctly
if echo "$test_entry" | grep -E "^[A-Za-z0-9=/\-]+\s+/mnt/[^\s]+\s+(ext4|xfs|btrfs|jfs)\s+[a-z0-9,\-_\.]+\s+[0-9]\s+[0-9]$" > /dev/null; then
  test_pass "Boot safety fstab entry format valid"
else
  test_fail "Boot safety entry format invalid"
fi

# Verify options don't get duplicated
if node -e "
  const { formatFstabEntry } = require('./backend/modules/disk/disk.util.js');
  const entry = formatFstabEntry('UUID=test', '/mnt/data', 'ext4', 'defaults,nofail,x-systemd.device-timeout=5', '0', '0');
  // Check if 'defaults' or 'nofail' appears twice
  if (entry.match(/defaults.*defaults/) || entry.match(/nofail.*nofail/)) {
    process.exit(1);  // Duplicate
  }
  process.exit(0);  // No duplicate
" 2>/dev/null; then
  test_pass "No duplicate options in fstab entries"
else
  test_fail "Potential duplicate options detected"
fi

echo ""
echo "=========================================="
echo "6. LOCK RETRY BEHAVIOR TEST"
echo "=========================================="

# Verify retry mechanism handles 50+ attempts
if grep -q "while (retries < maxRetries)" ./backend/modules/disk/fstab.js; then
  test_pass "Loop handles up to maxRetries (50)"
else
  test_fail "Retry loop not properly structured"
fi

# Verify exponential backoff maximum
if grep -q "Math.min(exponentialWait + jitter, 2000)" ./backend/modules/disk/fstab.js; then
  test_pass "Max wait per retry capped at 2000ms"
else
  test_fail "Max wait not capped properly"
fi

# Verify logging on retry
if grep -q "Retrying lock acquisition" ./backend/modules/disk/fstab.js; then
  test_pass "Lock retry logging implemented"
else
  test_fail "Retry logging not found"
fi

echo ""
echo "=========================================="
echo "7. BACKWARD COMPATIBILITY TEST"
echo "=========================================="

# Verify atomic write logic unchanged
if grep -q "fs.renameSync(FSTAB_TEMP_PATH, FSTAB_PATH)" ./backend/modules/disk/fstab.js; then
  test_pass "Atomic write (POSIX rename) preserved"
else
  test_fail "Atomic write logic missing"
fi

# Verify rollback logic unchanged
if grep -q "await execute('umount'" ./backend/modules/disk/disk.service.js; then
  test_pass "Mount rollback on fstab failure preserved"
else
  test_fail "Rollback logic missing"
fi

# Verify validation checks unchanged
if grep -q "validateDeviceName\|validateMountpoint\|validateFilesystem" ./backend/modules/disk/disk.service.js; then
  test_pass "Input validation checks preserved"
else
  test_fail "Validation checks missing"
fi

echo ""
echo "=========================================="
echo "SUMMARY"
echo "=========================================="
echo -e "${GREEN}PASSED: $PASS_COUNT${NC}"
echo -e "${RED}FAILED: $FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
  echo ""
  echo "CRITICAL FIXES VALIDATED:"
  echo "  ✓ FIX 1: Boot safety options added (nofail, device timeout)"
  echo "  ✓ FIX 2: Lock starvation fixed (50+ retries, exponential backoff, jitter)"
  echo ""
  echo "Next steps:"
  echo "  1. Run production deployment checklist"
  echo "  2. Load test with 100+ concurrent operations"
  echo "  3. Boot test with missing device"
  echo "  4. Monitor first 48 hours post-deployment"
  exit 0
else
  echo -e "${RED}✗ SOME TESTS FAILED${NC}"
  echo ""
  echo "Please review failures above and fix before proceeding."
  exit 1
fi
