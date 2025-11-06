#!/bin/bash

# DNS Administration Script for Mail-in-a-Box
# Provides backup, restore, and verification of DNS records
# Follows AWS Server 2025 Elevated Standards

set -Eeuo pipefail
IFS=$'\n\t'

# Script configuration
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LOG_DIR="${SCRIPT_DIR}/../logs" # legacy, not used for new backups
readonly BACKUP_ROOT_DIR="${SCRIPT_DIR}/../backups"

# Default values
DEFAULT_DOMAIN="emcnotary.com"
DEFAULT_PROFILE="hepe-admin-mfa"
DEFAULT_REGION="us-east-1"

# Global variables
DOMAIN_NAME=""
STACK_NAME=""
REGION=""
PROFILE=""
MIAB_HOST=""
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
VERBOSE=false
DRY_RUN=false
declare -a REM_ARGS=()

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Error handling
trap 'log_error "Script failed at line $LINENO"' ERR

# Usage function
usage() {
    cat << EOF
Usage: $SCRIPT_NAME [OPTIONS] COMMAND [ARGS]

DNS Administration Script for Mail-in-a-Box

COMMANDS:
    backup [FILE]              Backup all DNS records to file (default: dns-backup-YYYYMMDD-HHMMSS.json)
    restore FILE               Restore DNS records from file
    verify                     Verify DNS records against CloudFormation stack
    list                       List all custom DNS records
    get RECORD_TYPE [NAME]     Get specific DNS records
    set RECORD_TYPE NAME VALUE Set a DNS record
    delete RECORD_TYPE NAME    Delete DNS records
    test                       Test DNS API connectivity

OPTIONS:
    -d, --domain DOMAIN        Domain name (default: $DEFAULT_DOMAIN)
    -p, --profile PROFILE      AWS profile (default: $DEFAULT_PROFILE)
    -r, --region REGION        AWS region (default: $DEFAULT_REGION)
    -v, --verbose              Enable verbose output
    -n, --dry-run              Show what would be done without making changes
    -h, --help                 Show this help message

EXAMPLES:
    $SCRIPT_NAME backup
    $SCRIPT_NAME backup my-dns-backup.json
    $SCRIPT_NAME restore dns-backup-20250115-143022.json
    $SCRIPT_NAME verify
    $SCRIPT_NAME set TXT test.example.com "v=spf1 include:_spf.google.com ~all"
    $SCRIPT_NAME get TXT
    $SCRIPT_NAME delete TXT test.example.com

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -d|--domain)
                DOMAIN_NAME="$2"
                shift 2
                ;;
            -p|--profile)
                PROFILE="$2"
                shift 2
                ;;
            -r|--region)
                REGION="$2"
                shift 2
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -n|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            backup|restore|verify|list|get|set|delete|test)
                COMMAND="$1"
                shift
                REM_ARGS=("$@")
                break
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done

    # Set defaults
    DOMAIN_NAME="${DOMAIN_NAME:-$DEFAULT_DOMAIN}"
    PROFILE="${PROFILE:-$DEFAULT_PROFILE}"
    REGION="${REGION:-$DEFAULT_REGION}"
    STACK_NAME="$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver"
    MIAB_HOST="https://box.${DOMAIN_NAME}"

    # Validate domain name format
    if ! [[ $DOMAIN_NAME =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
        log_error "Invalid domain name format: $DOMAIN_NAME"
        exit 1
    fi

    # Create per-domain backup directories
    mkdir -p "${BACKUP_ROOT_DIR}/${DOMAIN_NAME}/dns"
}

# Get admin credentials
get_admin_credentials() {
    log_info "Retrieving admin credentials for domain: $DOMAIN_NAME"
    
    # Check if get-admin-password.sh exists
    local admin_script="${SCRIPT_DIR}/get-admin-password.sh"
    if [[ ! -f "$admin_script" ]]; then
        log_error "Admin password script not found: $admin_script"
        exit 1
    fi

    # Get credentials
    local credentials
    if ! credentials=$("$admin_script" "$DOMAIN_NAME" 2>/dev/null | grep -A 2 "Admin credentials for Mail-in-a-Box:"); then
        log_error "Failed to retrieve admin credentials"
        exit 1
    fi

    ADMIN_EMAIL=$(echo "$credentials" | grep "Username:" | cut -d' ' -f2)
    ADMIN_PASSWORD=$(echo "$credentials" | grep "Password:" | cut -d' ' -f2)

    if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_PASSWORD" ]]; then
        log_error "Could not extract admin credentials"
        exit 1
    fi

    log_success "Retrieved admin credentials for: $ADMIN_EMAIL"
}

# Make API call to Mail-in-a-Box DNS API
make_api_call() {
    local method="$1"
    local path="$2"
    local data="${3:-}"
    local response_file
    response_file=$(mktemp)
    
    # Cleanup on exit
    trap "rm -f '$response_file'" RETURN

    local curl_cmd=(
        curl -s -w "%{http_code}"
        -o "$response_file"
        -u "${ADMIN_EMAIL}:${ADMIN_PASSWORD}"
        -X "$method"
        -H "Content-Type: application/x-www-form-urlencoded"
    )

    if [[ -n "$data" ]]; then
        curl_cmd+=(-d "value=$data")
    fi

    curl_cmd+=("${MIAB_HOST}${path}")

    if [[ "$VERBOSE" == "true" ]]; then
        log_info "Making $method request to $path"
        if [[ -n "$data" ]]; then
            log_info "Data: $data"
        fi
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would execute: ${curl_cmd[*]}"
        return 0
    fi

    local http_code
    http_code=$("${curl_cmd[@]}")
    local response_body
    response_body=$(cat "$response_file")

    if [[ "$VERBOSE" == "true" ]]; then
        log_info "Response (HTTP $http_code):"
        echo "$response_body" | jq . 2>/dev/null || echo "$response_body"
    fi

    if [[ "$http_code" != "200" ]]; then
        log_error "API call failed (HTTP $http_code): $response_body"
        return 1
    fi

    echo "$response_body"
}

# Backup DNS records
backup_dns() {
    local backup_file="${1:-}"
    
    if [[ -z "$backup_file" ]]; then
        backup_file="${BACKUP_ROOT_DIR}/${DOMAIN_NAME}/dns/dns-backup-$(date +%Y%m%d-%H%M%S).json"
    fi

    log_info "Backing up DNS records to: $backup_file"

    # Get all custom DNS records
    local records
    if ! records=$(make_api_call "GET" "/admin/dns/custom"); then
        log_error "Failed to retrieve DNS records"
        return 1
    fi

    # Save to file
    echo "$records" | jq . > "$backup_file"
    
    if [[ $? -eq 0 ]]; then
        log_success "DNS records backed up to: $backup_file"
        log_info "Backup contains $(echo "$records" | jq '. | length') records"
    else
        log_error "Failed to save backup file"
        return 1
    fi
}

# Restore DNS records
restore_dns() {
    local backup_file="$1"
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi

    log_info "Restoring DNS records from: $backup_file"

    # Validate JSON format
    if ! jq empty "$backup_file" 2>/dev/null; then
        log_error "Invalid JSON format in backup file"
        return 1
    fi

    # Read and process records
    local records
    records=$(jq -c '.[]' "$backup_file")
    local count=0
    local success_count=0

    while IFS= read -r record; do
        local qname rtype value
        qname=$(echo "$record" | jq -r '.qname')
        rtype=$(echo "$record" | jq -r '.rtype')
        value=$(echo "$record" | jq -r '.value')

        log_info "Restoring $rtype record for $qname: $value"
        
        if make_api_call "PUT" "/admin/dns/custom/$qname/$rtype" "$value"; then
            ((success_count++))
        else
            log_warning "Failed to restore $rtype record for $qname"
        fi
        
        ((count++))
    done <<< "$records"

    log_success "Restored $success_count of $count DNS records"
}

# Verify DNS records against CloudFormation stack
verify_dns() {
    log_info "Verifying DNS records against CloudFormation stack: $STACK_NAME"

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        return 1
    fi

    # Check jq
    if ! command -v jq &> /dev/null; then
        log_error "jq is not installed"
        return 1
    fi

    # Get stack outputs
    local stack_outputs
    if ! stack_outputs=$(aws cloudformation describe-stacks \
        --profile "$PROFILE" \
        --region "$REGION" \
        --stack-name "$STACK_NAME" \
        --query 'Stacks[0].Outputs' \
        --output json 2>/dev/null); then
        log_error "Failed to retrieve stack outputs for $STACK_NAME"
        return 1
    fi

    # Extract SES DNS records
    local dkim_name_1 dkim_value_1 dkim_name_2 dkim_value_2 dkim_name_3 dkim_value_3
    local mail_from_domain mail_from_mx mail_from_txt

    dkim_name_1=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenName1") | .OutputValue // empty')
    dkim_value_1=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenValue1") | .OutputValue // empty')
    dkim_name_2=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenName2") | .OutputValue // empty')
    dkim_value_2=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenValue2") | .OutputValue // empty')
    dkim_name_3=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenName3") | .OutputValue // empty')
    dkim_value_3=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenValue3") | .OutputValue // empty')
    mail_from_domain=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="MailFromDomain") | .OutputValue // empty')
    mail_from_mx=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="MailFromMXRecord") | .OutputValue // empty')
    mail_from_txt=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="MailFromTXTRecord") | .OutputValue // empty')

    # Get current DNS records
    local current_records
    if ! current_records=$(make_api_call "GET" "/admin/dns/custom"); then
        log_error "Failed to retrieve current DNS records"
        return 1
    fi

    local all_good=true

    # Verify DKIM records
    if [[ -n "$dkim_name_1" && -n "$dkim_value_1" ]]; then
        verify_record "CNAME" "$dkim_name_1" "$dkim_value_1" "$current_records" || all_good=false
    fi
    if [[ -n "$dkim_name_2" && -n "$dkim_value_2" ]]; then
        verify_record "CNAME" "$dkim_name_2" "$dkim_value_2" "$current_records" || all_good=false
    fi
    if [[ -n "$dkim_name_3" && -n "$dkim_value_3" ]]; then
        verify_record "CNAME" "$dkim_name_3" "$dkim_value_3" "$current_records" || all_good=false
    fi

    # Verify MAIL FROM records
    if [[ -n "$mail_from_domain" && -n "$mail_from_mx" ]]; then
        verify_record "MX" "$mail_from_domain" "$mail_from_mx" "$current_records" || all_good=false
    fi
    if [[ -n "$mail_from_domain" && -n "$mail_from_txt" ]]; then
        verify_record "TXT" "$mail_from_domain" "$mail_from_txt" "$current_records" || all_good=false
    fi

    # Check for required SPF and DMARC records
    verify_spf_dmarc "$current_records" || all_good=false

    if [[ "$all_good" == "true" ]]; then
        log_success "All DNS records verified successfully"
    else
        log_warning "Some DNS records are missing or incorrect"
        return 1
    fi
}

# Verify a specific record
verify_record() {
    local rtype="$1"
    local qname="$2"
    local expected_value="$3"
    local current_records="$4"

    local found_record
    found_record=$(echo "$current_records" | jq -r --arg qname "$qname" --arg rtype "$rtype" \
        '.[] | select(.qname == $qname and .rtype == $rtype) | .value // empty')

    if [[ -z "$found_record" ]]; then
        log_warning "Missing $rtype record for $qname (expected: $expected_value)"
        return 1
    elif [[ "$found_record" != "$expected_value" ]]; then
        log_warning "Incorrect $rtype record for $qname (found: $found_record, expected: $expected_value)"
        return 1
    else
        log_success "✓ $rtype record for $qname is correct"
        return 0
    fi
}

# Verify SPF and DMARC records
verify_spf_dmarc() {
    local current_records="$1"
    local all_good=true

    # Check for SPF record
    local spf_record
    spf_record=$(echo "$current_records" | jq -r --arg domain "$DOMAIN_NAME" \
        '.[] | select(.qname == $domain and .rtype == "TXT" and (.value | contains("v=spf1"))) | .value // empty')

    if [[ -z "$spf_record" ]]; then
        log_warning "Missing SPF record for $DOMAIN_NAME"
        all_good=false
    else
        log_success "✓ SPF record found for $DOMAIN_NAME"
    fi

    # Check for DMARC record
    local dmarc_record
    dmarc_record=$(echo "$current_records" | jq -r --arg domain "_dmarc.$DOMAIN_NAME" \
        '.[] | select(.qname == $domain and .rtype == "TXT" and (.value | contains("v=DMARC1"))) | .value // empty')

    if [[ -z "$dmarc_record" ]]; then
        log_warning "Missing DMARC record for _dmarc.$DOMAIN_NAME"
        all_good=false
    else
        log_success "✓ DMARC record found for _dmarc.$DOMAIN_NAME"
    fi

    return $([ "$all_good" == "true" ] && echo 0 || echo 1)
}

# List all DNS records
list_dns() {
    log_info "Listing all custom DNS records"

    local records
    if ! records=$(make_api_call "GET" "/admin/dns/custom"); then
        log_error "Failed to retrieve DNS records"
        return 1
    fi

    echo "$records" | jq -r '.[] | "\(.qname) \(.rtype) \(.value)"' | column -t
}

# Get specific DNS records
get_dns() {
    local rtype="$1"
    local qname="${2:-}"

    local path="/admin/dns/custom"
    if [[ -n "$qname" ]]; then
        path="$path/$qname"
    fi
    if [[ -n "$rtype" ]]; then
        path="$path/$rtype"
    fi

    local records
    if ! records=$(make_api_call "GET" "$path"); then
        log_error "Failed to retrieve DNS records"
        return 1
    fi

    echo "$records" | jq .
}

# Set DNS record
set_dns() {
    local rtype="$1"
    local qname="$2"
    local value="$3"

    log_info "Setting $rtype record for $qname: $value"

    if make_api_call "PUT" "/admin/dns/custom/$qname/$rtype" "$value"; then
        log_success "Successfully set $rtype record for $qname"
    else
        log_error "Failed to set $rtype record for $qname"
        return 1
    fi
}

# Delete DNS record
delete_dns() {
    local rtype="$1"
    local qname="$2"

    log_info "Deleting $rtype record for $qname"

    if make_api_call "DELETE" "/admin/dns/custom/$qname/$rtype"; then
        log_success "Successfully deleted $rtype record for $qname"
    else
        log_error "Failed to delete $rtype record for $qname"
        return 1
    fi
}

# Test DNS API connectivity
test_dns() {
    log_info "Testing DNS API connectivity for domain: $DOMAIN_NAME"

    # Test basic connectivity
    local test_hostname="test.${DOMAIN_NAME}"
    local test_value="DNS API test $(date)"

    log_info "Adding test TXT record..."
    if make_api_call "POST" "/admin/dns/custom/$test_hostname/TXT" "$test_value"; then
        log_success "Successfully added test record"
    else
        log_error "Failed to add test record"
        return 1
    fi

    log_info "Verifying test record..."
    local records
    if records=$(make_api_call "GET" "/admin/dns/custom/$test_hostname/TXT"); then
        local found_value
        found_value=$(echo "$records" | jq -r '.[] | select(.qname == "'"$test_hostname"'") | .value // empty')
        if [[ "$found_value" == "$test_value" ]]; then
            log_success "Test record verified successfully"
        else
            log_warning "Test record verification failed"
        fi
    fi

    log_info "Cleaning up test record..."
    if make_api_call "DELETE" "/admin/dns/custom/$test_hostname/TXT" "$test_value"; then
        log_success "Test record cleaned up"
    else
        log_warning "Failed to clean up test record"
    fi

    log_success "DNS API test completed"
}

# Main function
main() {
    parse_args "$@"

    # Get admin credentials
    get_admin_credentials

    # Execute command
    case "${COMMAND:-}" in
        backup)
            backup_dns ${REM_ARGS:+"${REM_ARGS[0]}"}
            ;;
        restore)
            if [[ ${#REM_ARGS[@]} -lt 1 ]]; then
                log_error "Backup file required for restore command"
                usage
                exit 1
            fi
            restore_dns "${REM_ARGS[0]}"
            ;;
        verify)
            verify_dns
            ;;
        list)
            list_dns
            ;;
        get)
            if [[ ${#REM_ARGS[@]} -lt 1 ]]; then
                log_error "Record type required for get command"
                usage
                exit 1
            fi
            get_dns "${REM_ARGS[0]}" "${REM_ARGS[1]:-}"
            ;;
        set)
            if [[ ${#REM_ARGS[@]} -lt 3 ]]; then
                log_error "Record type, name, and value required for set command"
                usage
                exit 1
            fi
            set_dns "${REM_ARGS[0]}" "${REM_ARGS[1]}" "${REM_ARGS[2]}"
            ;;
        delete)
            if [[ ${#REM_ARGS[@]} -lt 2 ]]; then
                log_error "Record type and name required for delete command"
                usage
                exit 1
            fi
            delete_dns "${REM_ARGS[0]}" "${REM_ARGS[1]}"
            ;;
        test)
            test_dns
            ;;
        *)
            log_error "Unknown command: ${COMMAND:-}"
            usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
