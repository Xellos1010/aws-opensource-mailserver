#!/bin/bash

# Master Documentation Extractor Script
# Extracts codebase and rules into organized master documents
# Cleans up previous generations before creating new ones

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MASTER_CODEBASE_FILE="master-codebase.md"
MASTER_RULES_FILE="master-rules.md"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Folders and files to extract from
CODEBASE_FOLDERS=("administration" "askdaokapra" "emcnotary" "hepefoundation" "policies" "telassistmd")
CODEBASE_FILES=(".pre-commit-config.yaml" "mfa-user.sh" "mailserver-infrastructure-mvp.yaml" "README.md")
RULES_FOLDER=".cursor/rules"

# File extensions to extract
EXTRACT_EXTENSIONS=("yaml" "sh" "py" "guard" "md")

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

# Check if file contains .pem references
contains_pem_references() {
    local file="$1"
    grep -q '\.pem' "$file" 2>/dev/null
}

# Extract PEM file paths from content
extract_pem_paths() {
    local content="$1"
    echo "$content" | grep -o '~/.ssh/[^"]*\.pem' | sort | uniq || true
}

# Sanitize content for markdown (escape backticks and other special chars)
sanitize_markdown() {
    local content="$1"
    # Escape backticks by wrapping in triple backticks
    echo "$content" | sed 's/`/\\`/g'
}

# Create markdown header
create_markdown_header() {
    local title="$1"
    local description="$2"

    cat << EOF
# $title

$description

## Table of Contents

EOF
}

# Add file section to markdown
add_file_section() {
    local file_path="$1"
    local display_name="$2"
    local content="$3"

    echo ""
    echo "### $display_name"
    echo ""
    echo "\`\`\`$file_path"
    echo "$content"
    echo "\`\`\`"
    echo ""
}

# Extract and format file content
extract_file_content() {
    local file_path="$1"
    local display_name="$2"

    log_info "Processing: $display_name"

    if [[ ! -f "$file_path" ]]; then
        log_warning "File not found: $file_path"
        return
    fi

    # Read file content
    local content
    content=$(cat "$file_path")

    # Check for PEM references
    if contains_pem_references "$file_path"; then
        log_info "Found PEM references in $display_name"
        local pem_paths
        pem_paths=$(extract_pem_paths "$content")

        if [[ -n "$pem_paths" ]]; then
            log_info "PEM paths found: $pem_paths"
        fi
    fi

    # Sanitize content for markdown
    content=$(sanitize_markdown "$content")

    # Add to output
    add_file_section "$file_path" "$display_name" "$content"
}

# Process directory recursively
process_directory() {
    local dir_path="$1"
    local base_name="$2"

    log_info "Processing directory: $dir_path"

    if [[ ! -d "$dir_path" ]]; then
        log_warning "Directory not found: $dir_path"
        return
    fi

    # Find all files with specified extensions
    local found_files=()
    for ext in "${EXTRACT_EXTENSIONS[@]}"; do
        while IFS= read -r -d '' file; do
            found_files+=("$file")
        done < <(find "$dir_path" -name "*.${ext}" -type f -print0 2>/dev/null)
    done

    # Sort files for consistent output
    IFS=$'\n' found_files=($(sort <<<"${found_files[*]}"))
    unset IFS

    local file_count=${#found_files[@]}
    log_info "Found $file_count files in $dir_path"

    # Process each file
    for file_path in "${found_files[@]}"; do
        # Get relative path for display
        local relative_path="${file_path#./}"
        local display_name="${relative_path}"

        extract_file_content "$file_path" "$display_name"
    done
}

# Generate master codebase document
generate_master_codebase() {
    log_info "Generating master codebase document..."

    # Create header
    create_markdown_header "Master Codebase - AWS Open Source Mail Server" \
        "This document contains the complete codebase for the AWS Open Source Mail Server project, including all configuration files, scripts, and infrastructure code." > "${MASTER_CODEBASE_FILE}"

    # Add table of contents
    cat << 'EOF' >> "${MASTER_CODEBASE_FILE"

### Individual Files
- [.pre-commit-config.yaml](#pre-commit-configyaml)
- [mfa-user.sh](#mfa-usersh)
- [mailserver-infrastructure-mvp.yaml](#mailserver-infrastructure-mvpyaml)
- [README.md](#readmemd)

### Folders
EOF

    for folder in "${CODEBASE_FOLDERS[@]}"; do
        echo "- [$folder/](#$folder)" >> "${MASTER_CODEBASE_FILE}"
    done

    cat << 'EOF' >> "${MASTER_CODEBASE_FILE"

### PEM File References
- [PEM file references](#pem-file-references)

---

## Individual Files

EOF

    # Process individual files
    for file in "${CODEBASE_FILES[@]}"; do
        if [[ -f "$file" ]]; then
            extract_file_content "$file" "$file" >> "${MASTER_CODEBASE_FILE}"
        else
            log_warning "Individual file not found: $file"
        fi
    done

    # Process directories
    for folder in "${CODEBASE_FOLDERS[@]}"; do
        cat << EOF >> "${MASTER_CODEBASE_FILE"

---

## $folder

This section contains scripts and configurations specific to the $folder deployment.

EOF
        process_directory "$folder" "$folder" >> "${MASTER_CODEBASE_FILE}"
    done

    # Add PEM references section
    cat << 'EOF' >> "${MASTER_CODEBASE_FILE"

---

## PEM File References

The following .pem file paths were found in the codebase. These files contain sensitive cryptographic keys and their contents are not included in this document for security reasons. Only the file paths are listed:

EOF

    # Extract all unique PEM paths from codebase
    local all_pem_paths=()
    for folder in "${CODEBASE_FOLDERS[@]}"; do
        if [[ -d "$folder" ]]; then
            while IFS= read -r -d '' file; do
                if contains_pem_references "$file"; then
                    local pem_paths
                    pem_paths=$(extract_pem_paths "$(cat "$file")")
                    while read -r pem_path; do
                        if [[ -n "$pem_path" ]]; then
                            all_pem_paths+=("$pem_path")
                        fi
                    done <<< "$pem_paths"
                fi
            done < <(find "$folder" -type f \( -name "*.sh" -o -name "*.py" -o -name "*.yaml" -o -name "*.md" \) -print0 2>/dev/null)
        fi
    done

    # Also check individual files
    for file in "${CODEBASE_FILES[@]}"; do
        if [[ -f "$file" ]] && contains_pem_references "$file"; then
            local pem_paths
            pem_paths=$(extract_pem_paths "$(cat "$file")")
            while read -r pem_path; do
                if [[ -n "$pem_path" ]]; then
                    all_pem_paths+=("$pem_path")
                fi
            done <<< "$pem_paths"
        fi
    done

    # Remove duplicates and sort
    IFS=$'\n' all_pem_paths=($(sort -u <<<"${all_pem_paths[*]}"))
    unset IFS

    # Add PEM paths to document
    for pem_path in "${all_pem_paths[@]}"; do
        echo "- $pem_path" >> "${MASTER_CODEBASE_FILE}"
    done

    log_success "Master codebase document generated: ${MASTER_CODEBASE_FILE}"
}

# Generate master rules document
generate_master_rules() {
    log_info "Generating master rules document..."

    # Create header
    create_markdown_header "Master Rules - Cursor Workspace Rules" \
        "This document contains all Cursor workspace rules (.mdc files) for the AWS Open Source Mail Server project." > "${MASTER_RULES_FILE}"

    # Add table of contents
    cat << 'EOF' >> "${MASTER_RULES_FILE"

### Rule Categories
EOF

    # Find all .mdc files and organize by category
    declare -A rule_categories

    while IFS= read -r -d '' file; do
        # Get relative path
        local relative_path="${file#./}"

        # Extract category from path
        local category
        if [[ "$relative_path" =~ ^\.cursor/rules/([^/]+)/ ]]; then
            category="${BASH_REMATCH[1]}"
        else
            category="root"
        fi

        # Initialize array if not exists
        if [[ -z "${rule_categories[$category]:-}" ]]; then
            rule_categories[$category]=""
        fi

        # Add file to category
        rule_categories[$category]="${rule_categories[$category]} $relative_path"

    done < <(find "$RULES_FOLDER" -name "*.mdc" -type f -print0 2>/dev/null | sort -z)

    # Add categories to TOC
    for category in "${!rule_categories[@]}"; do
        echo "- [$category/](#$category)" >> "${MASTER_RULES_FILE}"
    done

    cat << 'EOF' >> "${MASTER_RULES_FILE"

---

EOF

    # Process each category
    for category in $(echo "${!rule_categories[@]}" | tr ' ' '\n' | sort); do
        cat << EOF >> "${MASTER_RULES_FILE"
## $category

This section contains $category rules for the workspace.

EOF

        # Process files in this category
        for file_path in ${rule_categories[$category]}; do
            if [[ -f "$file_path" ]]; then
                local display_name="${file_path#\.cursor/rules/}"
                extract_file_content "$file_path" "$display_name" >> "${MASTER_RULES_FILE}"
            fi
        done

        echo "" >> "${MASTER_RULES_FILE}"
        echo "---" >> "${MASTER_RULES_FILE}"
        echo "" >> "${MASTER_RULES_FILE}"
    done

    log_success "Master rules document generated: ${MASTER_RULES_FILE}"
}

# Validate generated files
validate_output() {
    log_info "Validating generated files..."

    local errors=0

    # Check if files exist
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

    if [[ $errors -eq 0 ]]; then
        log_success "All files generated successfully"
        return 0
    else
        log_error "File generation completed with errors"
        return 1
    fi
}

# Main execution
main() {
    log_info "Starting master documentation extraction..."
    log_info "Script directory: ${SCRIPT_DIR}"
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
