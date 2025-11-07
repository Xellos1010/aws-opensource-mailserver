#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Generate master rules files for each project component
# Usage:
#   ./scripts/generate_master_rules.sh [OUTPUT_DIR]
# Default:
#   OUTPUT_DIR -> <repo-root>/extracted-rules

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${1:-$ROOT_DIR/extracted-rules}"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Function to extract rules from a directory
extract_rules() {
  local component_name="$1"
  local source_dir="$2"
  local output_file="$OUTPUT_DIR/${component_name}-rules.txt"
  
  echo "Extracting rules for: $component_name"
  echo "Source: $source_dir"
  echo "Output: $output_file"
  
  if [ ! -d "$source_dir" ]; then
    echo "Source directory not found: $source_dir" >&2
    return 1
  fi

  # Backup existing output if present
  if [ -f "$output_file" ]; then
    BACKUP="$output_file.bak.$(date +%s)"
    echo "Backing up existing $output_file -> $BACKUP"
    cp "$output_file" "$BACKUP"
  fi

  # Truncate/create output file
  : > "$output_file"
  
  # Add header
  cat >> "$output_file" << HEADER_EOF
# $component_name Rules and Standards
# Generated on: $(date)
# Source: $source_dir
# 
# This file contains all rules, standards, and guidelines from the $component_name component.
#
# =============================================================================

HEADER_EOF

  # Define rule file patterns for each component type
  case "$component_name" in
    "main-directory")
      RULE_PATTERNS=(
        ".cursor/rules/*.mdc"
        ".cursor/rules/*.md"
        "README.md"
        "CONTRIBUTING.md"
        "STANDARDS.md"
        "RULES.md"
        "DEVELOPMENT.md"
        "DEPLOYMENT_GUIDE.md"
      )
      ;;
    "freshsales-app")
      RULE_PATTERNS=(
        "README.md"
        "CONTRIBUTING.md"
        "STANDARDS.md"
        "RULES.md"
        "manifest.json"
      )
      ;;
    "shared-package")
      RULE_PATTERNS=(
        "README.md"
        "CONTRIBUTING.md"
        "STANDARDS.md"
        "RULES.md"
      )
      ;;
    "types-package")
      RULE_PATTERNS=(
        "README.md"
        "CONTRIBUTING.md"
        "STANDARDS.md"
        "RULES.md"
      )
      ;;
    "tools")
      RULE_PATTERNS=(
        "README.md"
        "CONTRIBUTING.md"
        "STANDARDS.md"
        "RULES.md"
        "README-rules-generator.md"
      )
      ;;
    "development")
      RULE_PATTERNS=(
        "*.md"
        "README.md"
        "CONTRIBUTING.md"
        "STANDARDS.md"
        "RULES.md"
      )
      ;;
    *)
      RULE_PATTERNS=(
        "README.md"
        "CONTRIBUTING.md"
        "STANDARDS.md"
        "RULES.md"
      )
      ;;
  esac

  # Function to process individual rule files
  process_file() {
    local file="$1"

    # Skip certain files
    if [[ "$file" == *"node_modules"* ]] || \
       [[ "$file" == *"dist"* ]] || \
       [[ "$file" == *"build"* ]] || \
       [[ "$file" == *"cdk.out"* ]] || \
       [[ "$file" == *".next"* ]] || \
       [[ "$file" == *".turbo"* ]] || \
       [[ "$file" == *"coverage"* ]] || \
       [[ "$file" == *"tmp"* ]] || \
       [[ "$file" == *"temp"* ]] || \
       [[ "$file" == *"yarn.lock"* ]] || \
       [[ "$file" == *"package-lock.json"* ]] || \
       [[ "$file" == *"pnpm-lock.yaml"* ]] || \
       [[ "$file" == *".DS_Store"* ]] || \
       [[ "$file" == *"Thumbs.db"* ]]; then
      return
    fi

    # Get relative path from source directory
    rel_path="${file#$source_dir/}"

    echo "==== RULE FILE: $rel_path ====" >> "$output_file"
    cat "$file" >> "$output_file"
    echo -e "\n\n" >> "$output_file"
  }

  # Find and process rule files
  for pattern in "${RULE_PATTERNS[@]}"; do
    # Handle .cursor/rules patterns specially
    if [[ "$pattern" == .cursor/rules/* ]]; then
      find "$source_dir/.cursor/rules" -name "${pattern#.cursor/rules/}" -type f | sort | while IFS= read -r file; do
        process_file "$file"
      done
    else
      find "$source_dir" -maxdepth 3 -name "$pattern" -type f | sort | while IFS= read -r file; do
        process_file "$file"
      done
    fi
  done

  echo "✓ Wrote $component_name rules to: $output_file"
  echo
}

# Extract rules for each component
extract_rules "main-directory" "$ROOT_DIR"
extract_rules "tools" "$ROOT_DIR/tools"

# Create a combined master rules
MASTER_OUTPUT="$OUTPUT_DIR/master-rules.txt"
echo "Creating combined master rules: $MASTER_OUTPUT"

# Backup existing master output if present
if [ -f "$MASTER_OUTPUT" ]; then
  BACKUP="$MASTER_OUTPUT.bak.$(date +%s)"
  echo "Backing up existing $MASTER_OUTPUT -> $BACKUP"
  cp "$MASTER_OUTPUT" "$BACKUP"
fi

# Create master file
: > "$MASTER_OUTPUT"

cat >> "$MASTER_OUTPUT" << 'MASTER_HEADER'
# Master Rules and Standards - Web Automation Workspace
# Generated on: $(date)
#
# This file contains all rules, standards, and guidelines from all project components:
# - Main Directory (Global rules and standards)
# - Tools (Development tools standards)
#
# =============================================================================

MASTER_HEADER

# Combine all component files
for component_file in "$OUTPUT_DIR"/*-rules.txt; do
  if [ -f "$component_file" ] && [ "$(basename "$component_file")" != "master-rules.txt" ]; then
    echo "Adding $(basename "$component_file") to master..."
    cat "$component_file" >> "$MASTER_OUTPUT"
    echo -e "\n\n" >> "$MASTER_OUTPUT"
  fi
done

# Add footer
cat >> "$MASTER_OUTPUT" << 'FOOTER_EOF'

# =============================================================================
# End of Master Rules and Standards
# Generated on: $(date)
# 
# This file is auto-generated. Do not edit manually.
# To regenerate, run: ./scripts/generate_master_rules.sh
FOOTER_EOF

echo "✓ Wrote master rules to: $MASTER_OUTPUT"
echo
echo "All rules files generated in: $OUTPUT_DIR"
