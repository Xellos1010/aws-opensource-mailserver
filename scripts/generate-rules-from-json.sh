#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Generate rules from JSON input and archive previous rules
# Usage:
#   ./scripts/generate-rules-from-json.sh <JSON_FILE> [OUTPUT_DIR]
# Default:
#   OUTPUT_DIR -> .cursor/rules

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Input validation
if [ $# -lt 1 ]; then
  echo "Usage: $0 <JSON_FILE> [OUTPUT_DIR]"
  echo "Example: $0 rules-input.json"
  echo "Example: $0 rules-input.json custom-rules-dir"
  exit 1
fi

JSON_FILE="$1"
OUTPUT_DIR="${2:-$ROOT_DIR/.cursor/rules}"

# Validate JSON file exists
if [ ! -f "$JSON_FILE" ]; then
  echo "Error: JSON file '$JSON_FILE' not found" >&2
  exit 1
fi

# Validate JSON syntax
if ! jq empty "$JSON_FILE" 2>/dev/null; then
  echo "Error: Invalid JSON file '$JSON_FILE'" >&2
  exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Function to archive existing rules
archive_existing_rules() {
  local archive_dir="$ROOT_DIR/.cursor/rules-archive/$(date +%Y%m%d-%H%M%S)"
  local rules_dir="$ROOT_DIR/.cursor/rules"

  if [ -d "$rules_dir" ] && [ "$(ls -A "$rules_dir")" ]; then
    echo "Archiving existing rules to: $archive_dir"
    mkdir -p "$archive_dir"
    cp -r "$rules_dir"/* "$archive_dir/"
    echo "✓ Archived $(ls -1 "$archive_dir" | wc -l) rule files"
  else
    echo "No existing rules to archive"
  fi
}

# Function to validate rule ID format
validate_rule_id() {
  local rule_id="$1"
  if ! [[ "$rule_id" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
    echo "Error: Invalid rule ID format: '$rule_id'" >&2
    echo "Rule IDs must be lowercase alphanumeric with hyphens only" >&2
    return 1
  fi
}

# Function to generate content section
generate_content_section() {
  local rule="$1"
  local section_index="$2"

  # Extract section data
  local heading=$(echo "$rule" | jq -r ".content[$section_index].heading")
  local level=$(echo "$rule" | jq -r ".content[$section_index].level // 2")

  # Generate heading with appropriate level
  local heading_prefix=""
  for i in $(seq 1 "$level"); do
    heading_prefix="${heading_prefix}#"
  done

  echo "$heading_prefix $heading"
  echo

  # Process content blocks
  local blocks_count=$(echo "$rule" | jq ".content[$section_index].content | length")
  for j in $(seq 0 $((blocks_count - 1))); do
    local block_type=$(echo "$rule" | jq -r ".content[$section_index].content[$j].type")

    case "$block_type" in
      "paragraph")
        local text=$(echo "$rule" | jq -r ".content[$section_index].content[$j].text")
        echo "$text"
        echo
        ;;

      "list")
        local items=$(echo "$rule" | jq -c ".content[$section_index].content[$j].items[]")
        while IFS= read -r item; do
          # Remove quotes from JSON string
          item=$(echo "$item" | sed 's/^"//' | sed 's/"$//')
          echo "- $item"
        done <<< "$items"
        echo
        ;;

      "code")
        local code=$(echo "$rule" | jq -r ".content[$section_index].content[$j].code")
        local language=$(echo "$rule" | jq -r ".content[$section_index].content[$j].language")
        local caption=$(echo "$rule" | jq -r ".content[$section_index].content[$j].caption // empty")

        if [ -n "$caption" ]; then
          echo "**$caption**:"
          echo
        fi

        echo "\`\`\`$language"
        echo "$code"
        echo "\`\`\`"
        echo
        ;;

      "note"|"warning"|"tip")
        local text=$(echo "$rule" | jq -r ".content[$section_index].content[$j].text")
        local type_upper=$(echo "$block_type" | tr '[:lower:]' '[:upper:]')

        echo "**$type_upper**: $text"
        echo
        ;;

      "example")
        local text=$(echo "$rule" | jq -r ".content[$section_index].content[$j].text")
        local caption=$(echo "$rule" | jq -r ".content[$section_index].content[$j].caption // empty")

        if [ -n "$caption" ]; then
          echo "**Example: $caption**"
          echo
        fi

        echo "$text"
        echo
        ;;
    esac

    # Add content references if present
    local references_count=$(echo "$rule" | jq ".content[$section_index].content[$j].references | length")
    if [ "$references_count" -gt 0 ]; then
      for k in $(seq 0 $((references_count - 1))); do
        local ref_type=$(echo "$rule" | jq -r ".content[$section_index].content[$j].references[$k].type")
        local identifier=$(echo "$rule" | jq -r ".content[$section_index].content[$j].references[$k].identifier // empty")
        local index=$(echo "$rule" | jq -r ".content[$section_index].content[$j].references[$k].index // empty")

        case "$ref_type" in
          "citation")
            if [ -n "$index" ]; then
              echo ":contentReference[oaicite:$index]{index=$index}"
            fi
            ;;
          "link")
            local url=$(echo "$rule" | jq -r ".content[$section_index].content[$j].references[$k].url // empty")
            local text=$(echo "$rule" | jq -r ".content[$section_index].content[$j].references[$k].text // empty")
            if [ -n "$url" ] && [ -n "$text" ]; then
              echo "[$text]($url)"
            fi
            ;;
        esac
      done
      echo
    fi
  done
}

# Function to generate MDC file with frontmatter
generate_mdc_file() {
  local rule="$1"
  local output_file="$2"

  # Extract rule data
  local id=$(echo "$rule" | jq -r '.id')
  local title=$(echo "$rule" | jq -r '.title')
  local description=$(echo "$rule" | jq -r '.description')
  local justification=$(echo "$rule" | jq -r '.justification')
  local category=$(echo "$rule" | jq -r '.category')

  # Generate frontmatter
  cat > "$output_file" << EOF
---
description: $(echo "$rule" | jq -r '.fileMetadata.frontmatter.description // empty')
globs: $(echo "$rule" | jq -r '.fileMetadata.frontmatter.globs // [] | join(",")')
alwaysApply: $(echo "$rule" | jq -r '.fileMetadata.frontmatter.alwaysApply // true')
---

# $title

$description

**Justification**: $justification
EOF

  # Add structured content sections if present
  local content_sections_count=$(echo "$rule" | jq '.content | length')
  if [ "$content_sections_count" -gt 0 ]; then
    echo "" >> "$output_file"
    for i in $(seq 0 $((content_sections_count - 1))); do
      generate_content_section "$rule" "$i" >> "$output_file"
    done
  fi

  # Add examples if present
  local examples_count=$(echo "$rule" | jq '.examples | length')
  if [ "$examples_count" -gt 0 ]; then
    echo "" >> "$output_file"
    echo "**Examples**:" >> "$output_file"

    for i in $(seq 0 $((examples_count - 1))); do
      local example_title=$(echo "$rule" | jq -r ".examples[$i].title // empty")
      local example_lang=$(echo "$rule" | jq -r ".examples[$i].language // \"typescript\"")
      local example_code=$(echo "$rule" | jq -r ".examples[$i].code")
      local example_desc=$(echo "$rule" | jq -r ".examples[$i].description // empty")

      if [ -n "$example_title" ]; then
        echo "" >> "$output_file"
        echo "### $example_title" >> "$output_file"
      fi

      if [ -n "$example_desc" ]; then
        echo "" >> "$output_file"
        echo "$example_desc" >> "$output_file"
      fi

      echo "" >> "$output_file"
      echo "\`\`\`$example_lang" >> "$output_file"
      echo "$example_code" >> "$output_file"
      echo "\`\`\`" >> "$output_file"
    done
  fi

  # Add related rules if present
  local related_count=$(echo "$rule" | jq '.relatedRules | length')
  if [ "$related_count" -gt 0 ]; then
    echo "" >> "$output_file"
    echo "**Related Rules**:" >> "$output_file"
    for i in $(seq 0 $((related_count - 1))); do
      local related_id=$(echo "$rule" | jq -r ".relatedRules[$i]")
      echo "- [$related_id.mdc](mdc:.cursor/rules/$related_id.mdc)" >> "$output_file"
    done
  fi

  # Add tags if present
  local tags_count=$(echo "$rule" | jq '.tags | length')
  if [ "$tags_count" -gt 0 ]; then
    echo "" >> "$output_file"
    echo "**Tags**: $(echo "$rule" | jq -r '.tags | join(", ")')" >> "$output_file"
  fi
}

# Function to generate regular markdown file
generate_md_file() {
  local rule="$1"
  local output_file="$2"

  # Extract rule data
  local id=$(echo "$rule" | jq -r '.id')
  local title=$(echo "$rule" | jq -r '.title')
  local description=$(echo "$rule" | jq -r '.description')
  local justification=$(echo "$rule" | jq -r '.justification')
  local category=$(echo "$rule" | jq -r '.category')

  cat > "$output_file" << EOF
# $title

**Category**: $category
**Status**: $(echo "$rule" | jq -r '.status // "active"')

## Description

$description

## Justification

$justification
EOF

  # Add examples if present
  local examples_count=$(echo "$rule" | jq '.examples | length')
  if [ "$examples_count" -gt 0 ]; then
    echo "" >> "$output_file"
    echo "## Examples" >> "$output_file"

    for i in $(seq 0 $((examples_count - 1))); do
      local example_title=$(echo "$rule" | jq -r ".examples[$i].title // empty")
      local example_lang=$(echo "$rule" | jq -r ".examples[$i].language // \"typescript\"")
      local example_code=$(echo "$rule" | jq -r ".examples[$i].code")
      local example_desc=$(echo "$rule" | jq -r ".examples[$i].description // empty")

      if [ -n "$example_title" ]; then
        echo "" >> "$output_file"
        echo "### $example_title" >> "$output_file"
      fi

      if [ -n "$example_desc" ]; then
        echo "" >> "$output_file"
        echo "$example_desc" >> "$output_file"
      fi

      echo "" >> "$output_file"
      echo "\`\`\`$example_lang" >> "$output_file"
      echo "$example_code" >> "$output_file"
      echo "\`\`\`" >> "$output_file"
    done
  fi

  # Add related rules if present
  local related_count=$(echo "$rule" | jq '.relatedRules | length')
  if [ "$related_count" -gt 0 ]; then
    echo "" >> "$output_file"
    echo "## Related Rules" >> "$output_file"
    for i in $(seq 0 $((related_count - 1))); do
      local related_id=$(echo "$rule" | jq -r ".relatedRules[$i]")
      echo "- [$related_id]($related_id.md)" >> "$output_file"
    done
  fi

  # Add tags if present
  local tags_count=$(echo "$rule" | jq '.tags | length')
  if [ "$tags_count" -gt 0 ]; then
    echo "" >> "$output_file"
    echo "## Tags" >> "$output_file"
    echo "$(echo "$rule" | jq -r '.tags | join(", ")')" >> "$output_file"
  fi
}

# Function to generate other file types (JSON, YAML, etc.)
generate_other_file() {
  local rule="$1"
  local output_file="$2"
  local file_type="$3"

  case "$file_type" in
    "json")
      # For JSON files, store the rule as structured JSON
      echo "$rule" | jq '.' > "$output_file"
      ;;
    "yaml"|"yml")
      # Convert JSON to YAML
      echo "$rule" | jq '.' | python3 -c "
import sys, yaml, json
data = json.load(sys.stdin)
print(yaml.dump(data, default_flow_style=False))
" > "$output_file"
      ;;
    *)
      echo "Error: Unsupported file type: $file_type" >&2
      return 1
      ;;
  esac
}

# Main processing
echo "=== Rules Generation Tool ==="
echo "JSON Input: $JSON_FILE"
echo "Output Directory: $OUTPUT_DIR"
echo

# Archive existing rules
archive_existing_rules

# Validate JSON against schema (if schema file exists)
SCHEMA_FILE="$SCRIPT_DIR/rules-schema.json"
if [ -f "$SCHEMA_FILE" ]; then
  echo "Validating JSON against schema..."
  if ! command -v ajv >/dev/null 2>&1; then
    echo "Warning: ajv not installed. Skipping schema validation."
    echo "Install with: npm install -g ajv-cli"
  else
    if ajv validate -s "$SCHEMA_FILE" -d "$JSON_FILE"; then
      echo "✓ JSON validation passed"
    else
      echo "✗ JSON validation failed"
      exit 1
    fi
  fi
fi

# Process rules
echo "Processing rules..."

# Extract rules array
RULES=$(jq -c '.rules[]' "$JSON_FILE")
GENERATED_COUNT=0

while IFS= read -r rule; do
  # Extract rule ID
  RULE_ID=$(echo "$rule" | jq -r '.id')

  # Validate rule ID format
  if ! validate_rule_id "$RULE_ID"; then
    continue
  fi

  # Determine output filename
  OUTPUT_FILENAME=$(echo "$rule" | jq -r '.fileMetadata.filename // empty')
  if [ -z "$OUTPUT_FILENAME" ]; then
    # Auto-generate filename from ID
    OUTPUT_FILENAME="${RULE_ID}.mdc"
  fi

  OUTPUT_FILE="$OUTPUT_DIR/$OUTPUT_FILENAME"

  echo "Generating: $OUTPUT_FILENAME"

  # Determine file type and generate accordingly
  if [[ "$OUTPUT_FILENAME" == *.mdc ]]; then
    generate_mdc_file "$rule" "$OUTPUT_FILE"
  elif [[ "$OUTPUT_FILENAME" == *.md ]]; then
    generate_md_file "$rule" "$OUTPUT_FILE"
  elif [[ "$OUTPUT_FILENAME" == *.json ]]; then
    generate_other_file "$rule" "$OUTPUT_FILE" "json"
  elif [[ "$OUTPUT_FILENAME" == *.yaml ]] || [[ "$OUTPUT_FILENAME" == *.yml ]]; then
    generate_other_file "$rule" "$OUTPUT_FILE" "yaml"
  else
    echo "Warning: Unknown file extension for $OUTPUT_FILENAME, treating as markdown"
    generate_md_file "$rule" "$OUTPUT_FILE"
  fi

  GENERATED_COUNT=$((GENERATED_COUNT + 1))

done <<< "$RULES"

echo
echo "=== Generation Complete ==="
echo "✓ Generated $GENERATED_COUNT rule files in: $OUTPUT_DIR"
echo "✓ Previous rules archived in: $ROOT_DIR/.cursor/rules-archive/"
echo
echo "Next steps:"
echo "1. Review generated files in $OUTPUT_DIR"
echo "2. Test rules in your development environment"
echo "3. Commit changes when ready"
