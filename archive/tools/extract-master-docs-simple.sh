#!/bin/bash

# Simple Master Documentation Extractor Script
# Extracts codebase and rules into organized master documents

set -euo pipefail

# Configuration
MASTER_CODEBASE_FILE="master-codebase.md"
MASTER_RULES_FILE="master-rules.md"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Cleanup function
cleanup_previous_files() {
    log_info "Cleaning up previous master documents..."

    if [[ -f "${MASTER_CODEBASE_FILE}" ]]; then
        rm -f "${MASTER_CODEBASE_FILE}"
        log_success "Removed existing ${MASTER_CODEBASE_FILE}"
    fi

    if [[ -f "${MASTER_RULES_FILE}" ]]; then
        rm -f "${MASTER_RULES_FILE}"
        log_success "Removed existing ${MASTER_RULES_FILE}"
    fi
}

# Extract PEM file paths from content
extract_pem_paths() {
    local content="$1"
    echo "$content" | grep -o '~/.ssh/[^"]*\.pem' | sort | uniq || true
}

# Add file section to markdown
add_file_section() {
    local file_path="$1"
    local display_name="$2"
    local content="$3"

    echo "" >> "$4"
    echo "### $display_name" >> "$4"
    echo "" >> "$4"
    echo "\`\`\`$file_path" >> "$4"
    echo "$content" >> "$4"
    echo "\`\`\`" >> "$4"
    echo "" >> "$4"
}

# Process a single file
process_file() {
    local file_path="$1"
    local output_file="$2"

    if [[ ! -f "$file_path" ]]; then
        log_warning "File not found: $file_path"
        return
    fi

    local display_name="${file_path#./}"
    local content

    log_info "Processing: $display_name"

    # Read file content
    content=$(cat "$file_path")

    # Check for PEM references
    if echo "$content" | grep -q '\.pem'; then
        log_info "Found PEM references in $display_name"
    fi

    # Add to output
    add_file_section "$file_path" "$display_name" "$content" "$output_file"
}

# Generate master codebase document
generate_master_codebase() {
    log_info "Generating master codebase document..."

    # Create header
    cat > "${MASTER_CODEBASE_FILE}" << 'EOF'
# Master Codebase - AWS Open Source Mail Server

This document contains the complete codebase for the AWS Open Source Mail Server project, including all configuration files, scripts, and infrastructure code.

## Table of Contents

### Individual Files
- [.pre-commit-config.yaml](#pre-commit-configyaml)
- [mfa-user.sh](#mfa-usersh)
- [mailserver-infrastructure-mvp.yaml](#mailserver-infrastructure-mvpyaml)
- [README.md](#readmemd)

### Folders
- [administration/](#administration)
- [askdaokapra/](#askdaokapra)
- [emcnotary/](#emcnotary)
- [hepefoundation/](#hepefoundation)
- [policies/](#policies)
- [telassistmd/](#telassistmd)

### PEM File References
- [PEM file references](#pem-file-references)

---

## Individual Files

EOF

    # Process individual files
    process_file ".pre-commit-config.yaml" "${MASTER_CODEBASE_FILE}"
    process_file "mfa-user.sh" "${MASTER_CODEBASE_FILE}"
    process_file "mailserver-infrastructure-mvp.yaml" "${MASTER_CODEBASE_FILE}"
    process_file "README.md" "${MASTER_CODEBASE_FILE}"

    # Process directories
    for folder in administration askdaokapra emcnotary hepefoundation policies telassistmd; do
        echo "" >> "${MASTER_CODEBASE_FILE}"
        echo "---" >> "${MASTER_CODEBASE_FILE}"
        echo "" >> "${MASTER_CODEBASE_FILE}"
        echo "## $folder" >> "${MASTER_CODEBASE_FILE}"
        echo "" >> "${MASTER_CODEBASE_FILE}"
        echo "This section contains scripts and configurations specific to the $folder deployment." >> "${MASTER_CODEBASE_FILE}"
        echo "" >> "${MASTER_CODEBASE_FILE}"

        # Find and process all relevant files in directory
        while IFS= read -r -d '' file; do
            process_file "$file" "${MASTER_CODEBASE_FILE}"
        done < <(find "$folder" -type f \( -name "*.yaml" -o -name "*.sh" -o -name "*.py" -o -name "*.guard" -o -name "*.md" \) -print0 2>/dev/null | sort -z)
    done

    # Add PEM references section
    echo "" >> "${MASTER_CODEBASE_FILE}"
    echo "---" >> "${MASTER_CODEBASE_FILE}"
    echo "" >> "${MASTER_CODEBASE_FILE}"
    echo "## PEM File References" >> "${MASTER_CODEBASE_FILE}"
    echo "" >> "${MASTER_CODEBASE_FILE}"
    echo "The following .pem file paths were found in the codebase. These files contain sensitive cryptographic keys and their contents are not included in this document for security reasons. Only the file paths are listed:" >> "${MASTER_CODEBASE_FILE}"
    echo "" >> "${MASTER_CODEBASE_FILE}"

    # Extract all unique PEM paths
    local all_pem_paths=""
    for folder in administration askdaokapra emcnotary hepefoundation policies telassistmd; do
        if [[ -d "$folder" ]]; then
            while IFS= read -r -d '' file; do
                if [[ -f "$file" ]]; then
                    local pem_paths
                    pem_paths=$(extract_pem_paths "$(cat "$file")")
                    if [[ -n "$pem_paths" ]]; then
                        all_pem_paths="$all_pem_paths
$pem_paths"
                    fi
                fi
            done < <(find "$folder" -type f \( -name "*.sh" -o -name "*.py" -o -name "*.yaml" -o -name "*.md" \) -print0 2>/dev/null)
        fi
    done

    # Also check individual files
    for file in ".pre-commit-config.yaml" "mfa-user.sh" "mailserver-infrastructure-mvp.yaml" "README.md"; do
        if [[ -f "$file" ]]; then
            local pem_paths
            pem_paths=$(extract_pem_paths "$(cat "$file")")
            if [[ -n "$pem_paths" ]]; then
                all_pem_paths="$all_pem_paths
$pem_paths"
            fi
        fi
    done

    # Remove duplicates and sort
    local unique_pem_paths
    unique_pem_paths=$(echo "$all_pem_paths" | grep -v '^$' | sort | uniq)

    # Add PEM paths to document
    echo "$unique_pem_paths" | while read -r pem_path; do
        if [[ -n "$pem_path" ]]; then
            echo "- $pem_path" >> "${MASTER_CODEBASE_FILE}"
        fi
    done

    log_success "Master codebase document generated: ${MASTER_CODEBASE_FILE}"
}

# Generate master rules document
generate_master_rules() {
    log_info "Generating master rules document..."

    cat > "${MASTER_RULES_FILE}" << 'EOF'
# Master Rules - Cursor Workspace Rules

This document contains all Cursor workspace rules (.mdc files) for the AWS Open Source Mail Server project.

## Table of Contents

### Rule Categories
EOF

    # Find all .mdc files and organize by category
    local temp_file
    temp_file=$(mktemp)

    # Create a temp file with category and file path
    while IFS= read -r -d '' file; do
        local relative_path="${file#./}"
        local category="root"

        if [[ "$relative_path" =~ ^\.cursor/rules/([^/]+)/ ]]; then
            category="${BASH_REMATCH[1]}"
        fi

        echo "$category|$relative_path" >> "$temp_file"
    done < <(find ".cursor/rules" -name "*.mdc" -type f -print0 2>/dev/null | sort -z)

    # Get unique categories
    local categories
    categories=$(cut -d'|' -f1 "$temp_file" | sort | uniq)

    # Add categories to TOC
    echo "$categories" | while read -r category; do
        echo "- [$category/](#$category)" >> "${MASTER_RULES_FILE}"
    done

    cat >> "${MASTER_RULES_FILE}" << 'EOF'

---

EOF

    # Process each category
    echo "$categories" | while read -r category; do
        cat >> "${MASTER_RULES_FILE}" << EOF

## $category

This section contains $category rules for the workspace.

EOF

        # Process files in this category
        grep "^$category|" "$temp_file" | cut -d'|' -f2 | while read -r file_path; do
            if [[ -f "$file_path" ]]; then
                process_file "$file_path" "${MASTER_RULES_FILE}"
            fi
        done

        echo "" >> "${MASTER_RULES_FILE}"
        echo "---" >> "${MASTER_RULES_FILE}"
        echo "" >> "${MASTER_RULES_FILE}"
    done

    # Clean up temp file
    rm -f "$temp_file"

    log_success "Master rules document generated: ${MASTER_RULES_FILE}"
}

# Validate generated files
validate_output() {
    log_info "Validating generated files..."

    local errors=0

    if [[ ! -f "${MASTER_CODEBASE_FILE}" ]]; then
        log_error "Master codebase file was not created"
        ((errors++))
    else
        local codebase_size
        codebase_size=$(wc -c < "${MASTER_CODEBASE_FILE}")
        log_success "Master codebase file created (${codebase_size} bytes)"
    fi

    if [[ ! -f "${MASTER_RULES_FILE}" ]]; then
        log_error "Master rules file was not created"
        ((errors++))
    else
        local rules_size
        rules_size=$(wc -c < "${MASTER_RULES_FILE}")
        log_success "Master rules file created (${rules_size} bytes)"
    fi

    return $errors
}

# Main execution
main() {
    log_info "Starting master documentation extraction..."
    log_info "Working directory: $(pwd)"

    # Cleanup previous files
    cleanup_previous_files

    # Generate documents
    generate_master_codebase
    generate_master_rules

    # Validate output
    if validate_output; then
        log_success "Master documentation extraction completed successfully!"
        echo ""
        echo "Generated files:"
        echo "  - ${MASTER_CODEBASE_FILE}"
        echo "  - ${MASTER_RULES_FILE}"
        echo ""
        echo "You can now use these master documents for reference or sharing."
    else
        log_error "Master documentation extraction failed!"
        exit 1
    fi
}

# Run main function
main "$@"
