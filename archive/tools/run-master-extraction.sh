#!/bin/bash

# Master Documentation Extraction Runner
# Executes the documentation extraction and organizes output into timestamped folders

set -euo pipefail

# Configuration
TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$TOOLS_DIR")"
EXTRACTION_SCRIPT="$TOOLS_DIR/extract-master-docs-simple.sh"
OUTPUT_DIR="$PROJECT_ROOT/output"

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

# Create timestamped operation name
create_operation_name() {
    echo "master-docs-extraction-$(date +%Y%m%d-%H%M%S)"
}

# (setup_output_directory function removed - now inline in main)

# Execute the extraction
run_extraction() {
    local operation_dir="$1"

    log_info "Starting master documentation extraction..."

    # Change to project root for extraction
    cd "$PROJECT_ROOT"

    # Run the extraction script with output logging
    if "$EXTRACTION_SCRIPT" > "$operation_dir/logs/extraction.log" 2>&1; then
        log_success "Extraction completed successfully"
        return 0
    else
        local exit_code=$?
        log_error "Extraction failed (exit code: $exit_code)"
        log_info "Check logs: $operation_dir/logs/extraction.log"
        return 1
    fi
}

# Organize generated files
organize_output_files() {
    local operation_dir="$1"

    log_info "Organizing generated files..."

    # Move master documentation files to docs folder
    if [[ -f "master-codebase.md" ]]; then
        mv "master-codebase.md" "$operation_dir/docs/"
        log_success "Moved master-codebase.md to output directory"
    else
        log_warning "master-codebase.md not found"
    fi

    if [[ -f "master-rules.md" ]]; then
        mv "master-rules.md" "$operation_dir/docs/"
        log_success "Moved master-rules.md to output directory"
    else
        log_warning "master-rules.md not found"
    fi
}

# Generate operation summary
generate_summary() {
    local operation_dir="$1"
    local operation_name="$2"
    local start_time="$3"
    local end_time="$4"

    local summary_file="$operation_dir/summary.txt"
    local duration=$((end_time - start_time))

    log_info "Generating operation summary..."

    cat > "$summary_file" << EOF
Master Documentation Extraction Summary
======================================

Operation: $operation_name
Started: $(date -r "$start_time" '+%Y-%m-%d %H:%M:%S')
Completed: $(date -r "$end_time" '+%Y-%m-%d %H:%M:%S')
Duration: ${duration} seconds

Output Directory: $operation_dir

Generated Files:
EOF

    # List generated files
    if [[ -d "$operation_dir/docs" ]]; then
        echo "" >> "$summary_file"
        echo "Documentation:" >> "$summary_file"
        find "$operation_dir/docs" -type f -exec ls -lh {} \; | awk '{print "  - " $9 " (" $5 ")"}' >> "$summary_file"
    fi

    if [[ -d "$operation_dir/logs" ]]; then
        echo "" >> "$summary_file"
        echo "Logs:" >> "$summary_file"
        find "$operation_dir/logs" -type f -exec ls -lh {} \; | awk '{print "  - " $9 " (" $5 ")"}' >> "$summary_file"
    fi

    echo "" >> "$summary_file"
    echo "Summary file: $summary_file" >> "$summary_file"

    log_success "Summary generated: $summary_file"
}

# Validate extraction script exists
validate_environment() {
    if [[ ! -f "$EXTRACTION_SCRIPT" ]]; then
        log_error "Extraction script not found: $EXTRACTION_SCRIPT"
        exit 1
    fi

    if [[ ! -x "$EXTRACTION_SCRIPT" ]]; then
        log_error "Extraction script is not executable: $EXTRACTION_SCRIPT"
        log_info "Making script executable..."
        chmod +x "$EXTRACTION_SCRIPT"
    fi

    log_success "Environment validation passed"
}

# Clean up any leftover files from failed runs
cleanup_leftover_files() {
    log_info "Cleaning up any leftover files from previous runs..."

    local cleaned=0

    if [[ -f "master-codebase.md" ]]; then
        rm -f "master-codebase.md"
        ((cleaned++))
    fi

    if [[ -f "master-rules.md" ]]; then
        rm -f "master-rules.md"
        ((cleaned++))
    fi

    if [[ $cleaned -gt 0 ]]; then
        log_success "Cleaned up $cleaned leftover files"
    else
        log_info "No leftover files to clean"
    fi
}

# Main execution
main() {
    local start_time
    start_time=$(date +%s)

    log_info "Starting Master Documentation Extraction Runner"
    log_info "Project root: $PROJECT_ROOT"
    log_info "Tools directory: $TOOLS_DIR"

    # Validate environment
    validate_environment

    # Create operation name and directories
    local operation_name
    operation_name=$(create_operation_name)
    log_info "Operation name: $operation_name"

    local operation_dir
    operation_dir="$OUTPUT_DIR/$operation_name"

    # Setup output directories (suppress log output to avoid interference)
    mkdir -p "$operation_dir" 2>/dev/null
    mkdir -p "$operation_dir/logs" 2>/dev/null
    mkdir -p "$operation_dir/docs" 2>/dev/null

    log_info "Setting up output directory: $operation_dir"

    # Clean up any leftover files
    cleanup_leftover_files

    # Run extraction
    if run_extraction "$operation_dir"; then
        # Organize output files
        organize_output_files "$operation_dir"

        # Generate summary
        local end_time
        end_time=$(date +%s)
        generate_summary "$operation_dir" "$operation_name" "$start_time" "$end_time"

        log_success "Master documentation extraction completed successfully!"
        echo ""
        echo "Output organized in: $operation_dir"
        echo ""
        echo "Contents:"
        find "$operation_dir" -type f | sort

        exit 0
    else
        log_error "Master documentation extraction failed!"
        exit 1
    fi
}

# Run main function
main "$@"
