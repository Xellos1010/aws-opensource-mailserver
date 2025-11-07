#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Generate master configuration files for each project component
# Usage:
#   ./scripts/generate_master_config.sh [OUTPUT_DIR]
# Default:
#   OUTPUT_DIR -> <repo-root>/extracted-configs

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${1:-$ROOT_DIR/extracted-configs}"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Function to extract configs from a directory
extract_configs() {
  local component_name="$1"
  local source_dir="$2"
  local output_file="$OUTPUT_DIR/${component_name}-configs.txt"
  
  echo "Extracting configs for: $component_name"
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
# $component_name Configuration Files
# Generated on: $(date)
# Source: $source_dir
# 
# This file contains all configuration files from the $component_name component.
#
# =============================================================================

HEADER_EOF

  # Define config file patterns for each component type
  case "$component_name" in
    "main-directory")
      CONFIG_PATTERNS=(
        "package.json"
        "tsconfig.json"
        "nx.json"
        "jest.config.mjs"
        "eslint.config.js"
        ".gitignore"
        "README.md"
        "DEVELOPMENT.md"
        "DEPLOYMENT_GUIDE.md"
        "*.env*"
        "tsconfig.base.json"
      )
      ;;
    "freshsales-app")
      CONFIG_PATTERNS=(
        "package.json"
        "tsconfig.json"
        "manifest.json"
        "webpack.config.js"
        "project.json"
        "README.md"
        "config/iparams.json"
        "config/requests.json"
      )
      ;;
    "shared-package")
      CONFIG_PATTERNS=(
        "package.json"
        "tsconfig.json"
        "README.md"
      )
      ;;
    "types-package")
      CONFIG_PATTERNS=(
        "package.json"
        "tsconfig.json"
        "README.md"
      )
      ;;
    "tools")
      CONFIG_PATTERNS=(
        "package.json"
        "tsconfig.json"
        "README.md"
      )
      ;;
    "development")
      CONFIG_PATTERNS=(
        "*.md"
        "*.txt"
        "*.json"
        "*.yml"
        "*.yaml"
      )
      ;;
    *)
      CONFIG_PATTERNS=(
        "package.json"
        "tsconfig.json"
        "README.md"
      )
      ;;
  esac

  # Find and process config files
  for pattern in "${CONFIG_PATTERNS[@]}"; do
    find "$source_dir" -maxdepth 3 -name "$pattern" -type f | sort | while IFS= read -r file; do
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
         [[ "$file" == *".DS_Store"* ]] || \
         [[ "$file" == *"Thumbs.db"* ]]; then
        continue
      fi
      
      # Get relative path from source directory
      rel_path="${file#$source_dir/}"
      
      echo "==== FILE: $rel_path ====" >> "$output_file"
      cat "$file" >> "$output_file"
      echo -e "\n\n" >> "$output_file"
    done
  done

  echo "✓ Wrote $component_name configs to: $output_file"
  echo
}

# Extract configs for each component
extract_configs "main-directory" "$ROOT_DIR"
extract_configs "tools" "$ROOT_DIR/tools"

# Create a combined master config
MASTER_OUTPUT="$OUTPUT_DIR/master-configs.txt"
echo "Creating combined master configs: $MASTER_OUTPUT"

# Backup existing master output if present
if [ -f "$MASTER_OUTPUT" ]; then
  BACKUP="$MASTER_OUTPUT.bak.$(date +%s)"
  echo "Backing up existing $MASTER_OUTPUT -> $BACKUP"
  cp "$MASTER_OUTPUT" "$BACKUP"
fi

# Create master file
: > "$MASTER_OUTPUT"

cat >> "$MASTER_OUTPUT" << 'MASTER_HEADER'
# Master Configuration - Web Automation Workspace
# Generated on: $(date)
#
# This file contains all configuration files from all project components:
# - Main Directory (Root configs)
# - Tools (Development tools configs)
#
# =============================================================================

MASTER_HEADER

# Combine all component files
for component_file in "$OUTPUT_DIR"/*-configs.txt; do
  if [ -f "$component_file" ] && [ "$(basename "$component_file")" != "master-configs.txt" ]; then
    echo "Adding $(basename "$component_file") to master..."
    cat "$component_file" >> "$MASTER_OUTPUT"
    echo -e "\n\n" >> "$MASTER_OUTPUT"
  fi
done

echo "✓ Wrote master configs to: $MASTER_OUTPUT"
echo
echo "All config files generated in: $OUTPUT_DIR"
