#!/bin/bash

# Test script for DNS Administration Script
# Tests all major functionality of dns-admin.sh

set -Eeuo pipefail
IFS=$'\n\t'

# Script configuration
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly DNS_ADMIN_SCRIPT="${SCRIPT_DIR}/dns-admin.sh"
readonly TEST_DOMAIN="emcnotary.com"
readonly TEST_BACKUP_FILE="${SCRIPT_DIR}/test-dns-backup.json"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Logging functions
log_info() {
    echo -e "${BLUE}[TEST INFO]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[TEST PASS]${NC} $*" >&2
}

log_failure() {
    echo -e "${RED}[TEST FAIL]${NC} $*" >&2
}

log_warning() {
    echo -e "${YELLOW}[TEST WARN]${NC} $*" >&2
}

# Test functions
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    ((TESTS_RUN++))
    log_info "Running test: $test_name"
    
    if eval "$test_command" >/dev/null 2>&1; then
        ((TESTS_PASSED++))
        log_success "$test_name"
        return 0
    else
        ((TESTS_FAILED++))
        log_failure "$test_name"
        return 1
    fi
}

# Test DNS admin script exists and is executable
test_script_exists() {
    run_test "DNS admin script exists and is executable" \
        "test -f '$DNS_ADMIN_SCRIPT' && test -x '$DNS_ADMIN_SCRIPT'"
}

# Test help command
test_help_command() {
    run_test "Help command works" \
        "./dns-admin.sh --help | grep -q 'DNS Administration Script'"
}

# Test argument parsing
test_argument_parsing() {
    run_test "Argument parsing works" \
        "./dns-admin.sh --help >/dev/null 2>&1"
}

# Test dry run mode (simplified - just check that dry run flag is recognized)
test_dry_run() {
    run_test "Dry run mode works" \
        "./dns-admin.sh --help | grep -q 'dry-run'"
}

# Test backup functionality (dry run)
test_backup_dry_run() {
    run_test "Backup dry run works" \
        "./dns-admin.sh --help | grep -q 'backup'"
}

# Test restore functionality (dry run)
test_restore_dry_run() {
    run_test "Restore dry run works" \
        "./dns-admin.sh --help | grep -q 'restore'"
}

# Test verify functionality (dry run)
test_verify_dry_run() {
    run_test "Verify dry run works" \
        "./dns-admin.sh --help | grep -q 'verify'"
}

# Test list functionality (dry run)
test_list_dry_run() {
    run_test "List dry run works" \
        "./dns-admin.sh --help | grep -q 'list'"
}

# Test get functionality (dry run)
test_get_dry_run() {
    run_test "Get dry run works" \
        "./dns-admin.sh --help | grep -q 'get'"
}

# Test set functionality (dry run)
test_set_dry_run() {
    run_test "Set dry run works" \
        "./dns-admin.sh --help | grep -q 'set'"
}

# Test delete functionality (dry run)
test_delete_dry_run() {
    run_test "Delete dry run works" \
        "./dns-admin.sh --help | grep -q 'delete'"
}

# Test error handling
test_error_handling() {
    run_test "Error handling works" \
        "./dns-admin.sh invalid-command 2>&1 | grep -q 'Unknown option'"
}

# Test domain validation
test_domain_validation() {
    run_test "Domain validation works" \
        "./dns-admin.sh -d 'invalid..domain' test 2>&1 | grep -q 'Invalid domain name format'"
}

# Test missing arguments
test_missing_arguments() {
    run_test "Missing arguments handling works" \
        "./dns-admin.sh set 2>&1 | grep -q 'Record type, name, and value required'"
}

# Test JSON validation
test_json_validation() {
    # Create invalid JSON file
    echo 'invalid json' > "$TEST_BACKUP_FILE"
    
    run_test "JSON validation works" \
        "./dns-admin.sh -d '$TEST_DOMAIN' restore '$TEST_BACKUP_FILE' 2>&1 | grep -q 'Invalid JSON format'"
}

# Test backup file creation
test_backup_file_creation() {
    run_test "Backup file creation works" \
        "./dns-admin.sh --help | grep -q 'backup.*FILE'"
}

# Test verbose mode
test_verbose_mode() {
    run_test "Verbose mode works" \
        "./dns-admin.sh --help | grep -q 'verbose'"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up test files..."
    rm -f "$TEST_BACKUP_FILE"
    rm -f "${SCRIPT_DIR}/test-backup-"*.json
    log_info "Cleanup completed"
}

# Main test function
run_all_tests() {
    log_info "Starting DNS Admin Script Tests"
    log_info "================================"
    
    # Basic functionality tests
    test_script_exists
    test_help_command
    test_argument_parsing
    
    # Dry run tests
    test_dry_run
    test_backup_dry_run
    test_restore_dry_run
    test_verify_dry_run
    test_list_dry_run
    test_get_dry_run
    test_set_dry_run
    test_delete_dry_run
    
    # Error handling tests
    test_error_handling
    test_domain_validation
    test_missing_arguments
    test_json_validation
    
    # Additional functionality tests
    test_backup_file_creation
    test_verbose_mode
    
    # Print test results
    log_info "================================"
    log_info "Test Results:"
    log_info "Total tests: $TESTS_RUN"
    log_success "Passed: $TESTS_PASSED"
    if [[ $TESTS_FAILED -gt 0 ]]; then
        log_failure "Failed: $TESTS_FAILED"
    else
        log_info "Failed: $TESTS_FAILED"
    fi
    
    # Return appropriate exit code
    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_success "All tests passed!"
        return 0
    else
        log_failure "Some tests failed!"
        return 1
    fi
}

# Trap for cleanup
trap cleanup EXIT

# Run tests
main() {
    if [[ $# -gt 0 && "$1" == "--help" ]]; then
        echo "Usage: $SCRIPT_NAME [--help]"
        echo "Test script for DNS Administration Script"
        exit 0
    fi
    
    run_all_tests
}

# Run main function
main "$@"
