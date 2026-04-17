#!/bin/bash

# Phase 7 Validation Test Script
# Tests FTP service and App Installer functionality

set -e

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║ PHASE 7: FTP & APP INSTALLER VALIDATION             ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0

# Test function
test_endpoint() {
  local name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  local expected_status=$5

  echo -n "Testing: $name... "

  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "Authorization: Bearer test-token" \
      -H "Content-Type: application/json" \
      "http://localhost:3000$endpoint" 2>&1)
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "Authorization: Bearer test-token" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "http://localhost:3000$endpoint" 2>&1)
  fi

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)

  if [ "$http_code" = "$expected_status" ]; then
    echo -e "${GREEN}✓${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} (Expected: $expected_status, Got: $http_code)"
    ((TESTS_FAILED++))
  fi
}

# Test FTP Endpoints
echo -e "${BLUE}→ FTP Service Tests${NC}\n"

test_endpoint "FTP: Get status" "GET" "/api/ftp/status" "" "200"
test_endpoint "FTP: Enable service" "POST" "/api/ftp/enable" '{"port":21,"passivePortMin":6000,"passivePortMax":6100}' "200"
test_endpoint "FTP: Get enabled status" "GET" "/api/ftp/status" "" "200"
test_endpoint "FTP: Add user" "POST" "/api/ftp/users" '{"username":"testuser","password":"Test123!","homeDir":"/mnt/storage/ftp"}' "200"
test_endpoint "FTP: List users" "GET" "/api/ftp/users" "" "200"
test_endpoint "FTP: Remove user" "DELETE" "/api/ftp/users/testuser" "" "200"
test_endpoint "FTP: Disable service" "POST" "/api/ftp/disable" "" "200"

# Test App Installer Endpoints
echo -e "\n${BLUE}→ App Installer Tests${NC}\n"

test_endpoint "Apps: Get catalog" "GET" "/api/apps/catalog" "" "200"
test_endpoint "Apps: Get installed apps" "GET" "/api/apps/installed" "" "200"

# Test security validations
echo -e "\n${BLUE}→ Security Tests${NC}\n"

test_endpoint "FTP: Block invalid path" "POST" "/api/ftp/users" '{"username":"baduser","password":"Test123!","homeDir":"/etc"}' "400"

# Summary
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║ RESULTS${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"

TOTAL=$((TESTS_PASSED + TESTS_FAILED))
if [ $TOTAL -gt 0 ]; then
  PERCENTAGE=$((TESTS_PASSED * 100 / TOTAL))
  echo "Total: $TOTAL tests ($PERCENTAGE% pass rate)"
else
  echo "Total: 0 tests"
fi
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}\n"
  exit 0
else
  echo -e "${RED}Some tests failed.${NC}\n"
  exit 1
fi
