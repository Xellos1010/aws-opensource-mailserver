#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Generate master archive files for Archive directory
# Extracts all files from Archive/ directory including:
# - CloudFormation templates (*.yaml, *.yml)
# - Shell scripts (*.sh)
# - Python scripts (*.py)
# - Configuration files (*.json, *.md)
# - Policy files (*.guard)
#
# Usage:
#   ./scripts/generate_master_archive.sh [OUTPUT_DIR]
# Default:
#   OUTPUT_DIR -> <repo-root>/extracted-archive

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${1:-$ROOT_DIR/extracted-archive}"

# Create output directory
mkdir -p "$OUTPUT_DIR"
# Clean previous run outputs to avoid stale inclusions
rm -f "$OUTPUT_DIR"/*-archive.txt "$OUTPUT_DIR"/master-archive.txt 2>/dev/null || true

# Function to extract archive content from a directory
extract_archive() {
  local component_name="$1"
  local source_dir="$2"
  local output_file="$OUTPUT_DIR/${component_name}-archive.txt"
  
  echo "Extracting archive for: $component_name"
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
# $component_name Archive Content
# Generated on: $(date)
# Source: $source_dir
# 
# This file contains all archive files from the $component_name directory.
# Includes: *.yaml, *.yml, *.sh, *.py, *.json, *.md, *.guard, *.txt
# Excludes: node_modules, .git, dist, build, keys/, backups/, *.pem, *.key
#
# =============================================================================

HEADER_EOF

  # Walk files (excluding common VCS, dependency dirs, and sensitive files)
  find "$source_dir" \
    \( -type d \( -name node_modules -o -name .git -o -name dist -o -name build -o -name cdk.out -o -name .next -o -name .turbo -o -name coverage -o -name tmp -o -name temp -o -name state -o -name recordings -o -name keys -o -name backups \) -prune \) -o \
    \( -type f \
      -not -name '*.pem' \
      -not -name '*.key' \
      -not -name '*.p12' \
      -not -name '*.pfx' \
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

  echo "✓ Wrote $component_name archive to: $output_file"
  echo
}

# Helper to convert a relative path like "Archive/administration" to a component name like "Archive-administration"
to_component_name() {
  local rel_path="$1"
  echo "$rel_path" | sed 's#/#-#g' | sed 's#^Archive-##'
}

# Helper to extract all subdirectories from Archive directory
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
      extract_archive "$component_name" "$subdir"
    fi
  done < <(find "$parent_dir" -mindepth 1 -maxdepth 1 -type d -not -name "node_modules" -not -name ".git" -not -name "dist" -not -name "keys" -not -name "backups" | sort)
}

# Extract Archive root files
extract_archive_root_files() {
  local output_file="$OUTPUT_DIR/Archive-root-archive.txt"

  echo "Extracting Archive root directory files..."
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
# Archive Root Directory Files
# Generated on: $(date)
# Source: $ROOT_DIR/Archive
#
# This file contains files from the Archive root directory.
#
# =============================================================================

ROOT_HEADER_EOF

  # Find root-level files in Archive
  find "$ROOT_DIR/Archive" -maxdepth 1 -type f \
    -not -name '*.pem' \
    -not -name '*.key' \
    -not -name '.DS_Store' \
    -not -name 'Thumbs.db' | sort | while IFS= read -r file; do
    mimetype=$(file -b --mime-type "$file" 2>/dev/null || echo "application/octet-stream")
    
    case "$mimetype" in
      text/*|application/json|application/javascript|application/xml|application/x-yaml|application/typescript)
        rel_path="${file#$ROOT_DIR/Archive/}"
        echo "==== FILE: $rel_path ====" >> "$output_file"
        cat "$file" >> "$output_file"
        echo -e "\n\n" >> "$output_file"
        ;;
      *)
        rel_path="${file#$ROOT_DIR/Archive/}"
        echo "==== FILE: $rel_path (skipped, mime=$mimetype) ====" >> "$output_file"
        echo >> "$output_file"
        ;;
    esac
  done

  echo "✓ Wrote Archive root files to: $output_file"
  echo
}

# Archive - extract root files first
if [ -d "$ROOT_DIR/Archive" ]; then
  echo "Processing Archive directory..."
  extract_archive_root_files
  
  # Then extract each subdirectory as separate component
  echo "Scanning for subdirectories under Archive..."
  extract_subdirectory_components "$ROOT_DIR/Archive" "Archive"
else
  echo "Archive directory not found: $ROOT_DIR/Archive" >&2
fi

# Create a combined master archive
MASTER_OUTPUT="$OUTPUT_DIR/master-archive.txt"
echo "Creating combined master archive: $MASTER_OUTPUT"

# Backup existing master output if present
if [ -f "$MASTER_OUTPUT" ]; then
  BACKUP="$MASTER_OUTPUT.bak.$(date +%s)"
  echo "Backing up existing $MASTER_OUTPUT -> $BACKUP"
  cp "$MASTER_OUTPUT" "$BACKUP"
fi

# Create master file
: > "$MASTER_OUTPUT"

cat >> "$MASTER_OUTPUT" << MASTER_HEADER_EOF
# Master Archive - AWS Open Source Mail Server Archive
# Generated on: $(date)
#
# This file contains archive content from the Archive/ directory:
# - Root files: Files directly in Archive/
# - Subdirectories: Each subdirectory under Archive/ (administration, askdaokapra, emcnotary, hepefoundation, telassistmd, etc.)
#
# Excluded: keys/, backups/, *.pem, *.key, and other sensitive files
#
# =============================================================================

MASTER_HEADER_EOF

# Combine all generated component files (avoid stale files)
for component_file in "$OUTPUT_DIR"/*-archive.txt; do
  if [ -f "$component_file" ] && [ "$(basename "$component_file")" != "master-archive.txt" ]; then
    echo "Adding $(basename "$component_file") to master..."
    cat "$component_file" >> "$MASTER_OUTPUT"
    echo -e "\n\n" >> "$MASTER_OUTPUT"
  fi
done

echo "✓ Wrote master archive to: $MASTER_OUTPUT"
echo
echo "All archive files generated in: $OUTPUT_DIR"




