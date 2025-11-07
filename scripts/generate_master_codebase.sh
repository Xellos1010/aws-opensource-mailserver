#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Generate master codebase files for this Nx workspace
# Dynamically extracts all code from subdirectories under:
# - apps/ (each app gets its own file)
# - libs/ (each lib gets its own file)
# - tools/ (each tool subdirectory gets its own file)
# - scripts/ (single file for all scripts)
#
# Usage:
#   ./scripts/generate_master_codebase.sh [OUTPUT_DIR]
# Default:
#   OUTPUT_DIR -> <repo-root>/extracted-codebase

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${1:-$ROOT_DIR/extracted-codebase}"

# Create output directory
mkdir -p "$OUTPUT_DIR"
# Clean previous run outputs to avoid stale inclusions
rm -f "$OUTPUT_DIR"/*-codebase.txt "$OUTPUT_DIR"/master-codebase.txt 2>/dev/null || true

# Function to extract codebase from a directory
extract_codebase() {
  local component_name="$1"
  local source_dir="$2"
  local output_file="$OUTPUT_DIR/${component_name}-codebase.txt"
  
  echo "Extracting codebase for: $component_name"
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
# $component_name Codebase
# Generated on: $(date)
# Source: $source_dir
# 
# This file contains all source code files from the $component_name component.
# Excludes: node_modules, .git, dist, build, cdk.out, yarn.lock, package-lock.json
#
# =============================================================================

HEADER_EOF

  # Walk files (excluding common VCS and dependency dirs), detect mime type and include only text-like files.
  find "$source_dir" \
    \( -type d \( -name node_modules -o -name .git -o -name dist -o -name build -o -name cdk.out -o -name .next -o -name .turbo -o -name coverage -o -name tmp -o -name temp -o -name state -o -name recordings \) -prune \) -o \
    \( -type f \
      -not -name 'yarn.lock' \
      -not -name 'package-lock.json' \
      -not -name 'pnpm-lock.yaml' \
      -not -name 'npm-shrinkwrap.json' \
      -not -name 'bun.lockb' \
      -not -name '.DS_Store' \
      -not -name 'Thumbs.db' \
      -print \) | sort | while IFS= read -r file; do
    # Determine mime type; fall back to application/octet-stream on error
    mimetype=$(file -b --mime-type "$file" 2>/dev/null || echo "application/octet-stream")

    # Additional exclusions for files not useful for AI analysis
    if [[ "$file" == *"BUILD_ID"* ]] || \
       [[ "$file" == *"app-build-manifest"* ]] || \
       [[ "$file" == *"build-manifest"* ]] || \
       [[ "$file" == *"app-path-routes-manifest"* ]] || \
       [[ "$file" == *"rscinfo"* ]] || \
       [[ "$file" == *"webpack"* ]] || \
       [[ "$file" == *"eslint"* ]] && [[ "$file" == *"cache"* ]]; then
      echo "==== FILE: $file (skipped, build artifact) ====" >> "$output_file"
      echo >> "$output_file"
      continue
    fi

    case "$mimetype" in
      text/*|application/json|application/javascript|application/xml|application/x-yaml|application/typescript)
        echo "==== FILE: $file ====" >> "$output_file"
        cat "$file" >> "$output_file"
        echo -e "\n\n" >> "$output_file"
        ;;
      *)
        echo "==== FILE: $file (skipped, mime=$mimetype) ====" >> "$output_file"
        echo >> "$output_file"
        ;;
    esac
  done

  echo "✓ Wrote $component_name codebase to: $output_file"
  echo
}

# Extract codebase for each component dynamically

# Helper to convert a relative path like "apps/kareo" to a component name like "apps-kareo"
to_component_name() {
  local rel_path="$1"
  echo "$rel_path" | sed 's#/#-#g'
}

# Helper to extract all subdirectories from a parent directory
extract_subdirectory_components() {
  local parent_dir="$1"
  local parent_name="$2"

  if [ ! -d "$parent_dir" ]; then
    return
  fi

  echo "Scanning for subdirectories under $parent_name..."

  # Find all immediate subdirectories (not nested deeper)
  while IFS= read -r subdir; do
    if [ -d "$subdir" ]; then
      rel_dir="${subdir#$ROOT_DIR/}"
      component_name=$(to_component_name "$rel_dir")
      extract_codebase "$component_name" "$subdir"
    fi
  done < <(find "$parent_dir" -mindepth 1 -maxdepth 1 -type d -not -name "node_modules" -not -name ".git" -not -name "dist" | sort)
}

# Apps - extract each app as separate component
if [ -d "$ROOT_DIR/apps" ]; then
  echo "Scanning for app directories under apps..."
  extract_subdirectory_components "$ROOT_DIR/apps" "apps"
fi

# Libs - extract each lib as separate component
if [ -d "$ROOT_DIR/libs" ]; then
  echo "Scanning for lib directories under libs..."
  extract_subdirectory_components "$ROOT_DIR/libs" "libs"
fi

# Tools - extract each tool subdirectory as separate component
if [ -d "$ROOT_DIR/tools" ]; then
  echo "Scanning for tool directories under tools..."
  extract_subdirectory_components "$ROOT_DIR/tools" "tools"
fi

# Scripts - extract as single component (no subdirectories to worry about)
if [ -d "$ROOT_DIR/scripts" ]; then
  extract_codebase "scripts" "$ROOT_DIR/scripts"
fi

# Extract specific root directory files
extract_root_files() {
  local output_file="$OUTPUT_DIR/root-files-codebase.txt"

  echo "Extracting root directory files..."
  echo "Output: $output_file"

  # Backup existing output if present
  if [ -f "$output_file" ]; then
    BACKUP="$output_file.bak.$(date +%s)"
    echo "Backing up existing $output_file -> $BACKUP"
    cp "$output_file" "$BACKUP"
  fi

  # Truncate/create output file
  : > "$output_file"

  # Add header
  cat >> "$output_file" << ROOT_HEADER_EOF
# Root Directory Files
# Generated on: $(date)
# Source: $ROOT_DIR
#
# This file contains specific configuration files from the root directory.
#
# =============================================================================

ROOT_HEADER_EOF

  # List of specific files to include from root
  ROOT_FILES=(
    ".eslintrc.cjs"
    ".gitignore"
    ".nvmrc"
    "eslint.config.js"
    "jest.config.mjs"
    "nx.json"
    "package.json"
    "tsconfig.base.json"
  )

  for file in "${ROOT_FILES[@]}"; do
    if [ -f "$ROOT_DIR/$file" ]; then
      echo "==== FILE: $file ====" >> "$output_file"
      cat "$ROOT_DIR/$file" >> "$output_file"
      echo -e "\n\n" >> "$output_file"
    else
      echo "File not found: $ROOT_DIR/$file" >&2
    fi
  done

  echo "✓ Wrote root files to: $output_file"
  echo
}

extract_root_files

# Create a combined master codebase
MASTER_OUTPUT="$OUTPUT_DIR/master-codebase.txt"
echo "Creating combined master codebase: $MASTER_OUTPUT"

# Backup existing master output if present
if [ -f "$MASTER_OUTPUT" ]; then
  BACKUP="$MASTER_OUTPUT.bak.$(date +%s)"
  echo "Backing up existing $MASTER_OUTPUT -> $BACKUP"
  cp "$MASTER_OUTPUT" "$BACKUP"
fi

# Create master file
: > "$MASTER_OUTPUT"

cat >> "$MASTER_OUTPUT" << MASTER_HEADER_EOF
# Master Codebase - Web Automation Workspace Monorepo
# Generated on: $(date)
#
# This file contains source code from all workspace components:
# - Apps: Each subdirectory under apps/ (bravado, documentation-scraper, kareo, opencall, optimispt)
# - Libs: Each subdirectory under libs/ (common, cursor-flow, platform)
# - Tools: Each subdirectory under tools/ (cursor, flows)
# - Scripts: All files under scripts/
# - Root Files: Configuration files from root directory
#
# Excluded: node_modules, build artifacts, lock files, logs, caches, etc.
#
# =============================================================================

MASTER_HEADER_EOF

# Combine all generated component files (avoid stale files)
for component_file in "$OUTPUT_DIR"/*-codebase.txt; do
  if [ -f "$component_file" ] && [ "$(basename "$component_file")" != "master-codebase.txt" ]; then
    echo "Adding $(basename "$component_file") to master..."
    cat "$component_file" >> "$MASTER_OUTPUT"
    echo -e "\n\n" >> "$MASTER_OUTPUT"
  fi
done

echo "✓ Wrote master codebase to: $MASTER_OUTPUT"
echo
echo "All codebase files generated in: $OUTPUT_DIR" 