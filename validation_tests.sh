#!/bin/bash

# END-TO-END VALIDATION TEST SCRIPT
# NAS System (Frontend + Backend Integration)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:8080}"
AUTH_TOKEN="${AUTH_TOKEN:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxIiwicm9sZSI6ImFkbWluIn0.test}"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}NAS SYSTEM - END-TO-END VALIDATION TEST SUITE${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "API URL: $API_URL"
echo "Auth Token: ${AUTH_TOKEN:0:20}..."
echo ""

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

function test_endpoint() {
  local method=$1
  local endpoint=$2
  local description=$3
  local expected_code=${4:-200}
  
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  
  echo -n "TEST $TESTS_TOTAL: $description... "
  
  # Make the request
  local response=$(curl -s -w "\n%{http_code}" \
    -X "$method" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    "$API_URL$endpoint")
  
  # Extract status code (last line)
  local status_code=$(echo "$response" | tail -1)
  # Extract body (all but last line)
  local body=$(echo "$response" | head -n -1)
  
  if [ "$status_code" = "$expected_code" ]; then
    echo -e "${GREEN}✓ PASS${NC} (HTTP $status_code)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    
    # Try to parse and display key fields if JSON
    if [ "$status_code" = "200" ] || [ "$status_code" = "201" ]; then
      # Only show first 100 chars of response for readability
      if [ ! -z "$body" ]; then
        echo "  Response: ${body:0:100}..."
      fi
    fi
  else
    echo -e "${RED}✗ FAIL${NC} (HTTP $status_code, expected $expected_code)"
    echo "  Response: $body"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
  echo ""
}

function test_group() {
  local group_name=$1
  echo -e "${YELLOW}▶ $group_name${NC}"
  echo "─────────────────────────────────────────────────────────"
}

# ============================================================================
# SECTION 1: HEALTH CHECK
# ============================================================================

test_group "HEALTH & AUTHENTICATION"

test_endpoint "GET" "/api/system/health" "Health check" 200
test_endpoint "GET" "/api/system/version" "Version check" 200

# ============================================================================
# SECTION 2: SYSTEM ENDPOINTS
# ============================================================================

test_group "SYSTEM ENDPOINTS"

test_endpoint "GET" "/api/system/info" "Get system info" 200
test_endpoint "GET" "/api/system/stats" "Get system stats" 200
test_endpoint "GET" "/api/system/cpu" "Get CPU usage" 200
test_endpoint "GET" "/api/system/memory" "Get memory usage" 200
test_endpoint "GET" "/api/system/services" "Get services list" 200
test_endpoint "GET" "/api/system/logs" "Get system logs" 200
test_endpoint "GET" "/api/system/logs?limit=5" "Get logs with limit" 200

# ============================================================================
# SECTION 3: DISK ENDPOINTS (including aliases)
# ============================================================================

test_group "DISK ENDPOINTS"

# Test new aliases (frontend expected endpoints)
test_endpoint "GET" "/api/disk/list" "List disks (NEW alias)" 200
test_endpoint "GET" "/api/disk/disks" "List disks (OLD endpoint)" 200

# Test usage endpoint
test_endpoint "GET" "/api/disk/usage" "Get disk usage" 200

# Test mount/unmount endpoints
test_endpoint "POST" "/api/disk/mount" "Mount partition (NEW)" 200
test_endpoint "POST" "/api/disk/partition/mount" "Mount partition (OLD)" 200

# ============================================================================
# SECTION 4: RAID ENDPOINTS
# ============================================================================

test_group "RAID ENDPOINTS"

test_endpoint "GET" "/api/raid/list" "List RAID arrays" 200
# Note: Other RAID endpoints would require specific RAID setup

# ============================================================================
# SECTION 5: FILESYSTEM ENDPOINTS
# ============================================================================

test_group "FILESYSTEM ENDPOINTS"

test_endpoint "GET" "/api/filesystem/list" "List filesystems" 200
# Note: Create/format would require write permission

# ============================================================================
# SECTION 6: SMB ENDPOINTS
# ============================================================================

test_group "SMB ENDPOINTS"

test_endpoint "GET" "/api/smb/shares" "List SMB shares" 200
test_endpoint "GET" "/api/smb/status" "Get SMB status" 200

# ============================================================================
# SECTION 7: NFS ENDPOINTS
# ============================================================================

test_group "NFS ENDPOINTS"

test_endpoint "GET" "/api/nfs/exports" "List NFS exports" 200
test_endpoint "GET" "/api/nfs/status" "Get NFS status" 200

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}TEST SUMMARY${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""

echo "Total Tests: $TESTS_TOTAL"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
  exit 0
else
  PASS_RATE=$((TESTS_PASSED * 100 / TESTS_TOTAL))
  echo -e "${YELLOW}⚠ TESTS COMPLETED WITH FAILURES${NC}"
  echo -e "Pass Rate: ${YELLOW}${PASS_RATE}%${NC}"
  exit 1
fi
