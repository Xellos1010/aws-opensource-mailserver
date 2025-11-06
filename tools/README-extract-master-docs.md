# Master Documentation Extractor

This tool extracts all codebase files and Cursor rules into organized master documentation files with automated output organization.

## Scripts Available

- `run-master-extraction.sh` - **Main runner script** (recommended)
- `extract-master-docs-simple.sh` - Core extraction logic

## Files Generated

- `master-codebase.md` - Complete codebase with all scripts, configurations, and documentation
- `master-rules.md` - All Cursor workspace rules organized by category

## Features

- **Automated Organization**: Output files are organized into timestamped folders under `output/`
- **Cleanup**: Automatically removes previous master documents before generation
- **Comprehensive**: Extracts all relevant file types (.yaml, .sh, .py, .guard, .md, .mdc)
- **Organized**: Files are organized by folders and categories with proper markdown formatting
- **Security**: PEM file paths are included but contents are excluded for security
- **Validation**: Validates generated files and provides feedback
- **Logging**: All operations are logged with timestamps and summaries

## Usage

### Recommended: Use the Master Runner

```bash
# Run the complete extraction with organized output
./tools/run-master-extraction.sh
```

This will:
1. Create a timestamped output folder (e.g., `output/master-docs-extraction-20241106-134500/`)
2. Run the extraction
3. Organize all files into proper subdirectories
4. Generate a summary report

### Manual: Use Individual Scripts

```bash
# Make scripts executable (first time only)
chmod +x tools/extract-master-docs-simple.sh

# Run core extraction only (files generated in project root)
./tools/extract-master-docs-simple.sh
```

## What Gets Extracted

### Codebase Files
- **Folders**: administration, askdaokapra, emcnotary, hepefoundation, policies, telassistmd
- **Individual Files**: .pre-commit-config.yaml, mfa-user.sh, mailserver-infrastructure-mvp.yaml, README.md
- **File Types**: .yaml, .sh, .py, .guard, .md files

### Rules Files
- **Location**: .cursor/rules/ (including all subdirectories)
- **File Type**: .mdc files
- **Organization**: Grouped by category (01-code-standards, 02-architecture, etc.)

## Security Features

- **PEM File Handling**: Only file paths are included in the documentation, not the actual cryptographic key contents
- **Path Extraction**: Automatically detects and lists all .pem file references found in the codebase

## Output Format

Both generated files use clean markdown formatting:

```markdown
# Document Title

Description of the document contents.

## Table of Contents

- [Section 1](#section-1)
- [Section 2](#section-2)

## Section 1

### file-name.ext

```file-path
file contents here
```

## PEM File References

- ~/.ssh/some-key.pem
- ~/.ssh/another-key.pem
```

## Dependencies

- Bash shell
- Standard Unix utilities (find, grep, sort, etc.)
- No external dependencies required

## Troubleshooting

### Common Issues

1. **Permission Denied**: Make sure the script is executable
   ```bash
   chmod +x extract-master-docs-simple.sh
   ```

2. **Files Not Found**: Ensure you're running from the project root directory

3. **Large Files**: The generated markdown files can be quite large (300KB+ each)

### Validation

The script includes built-in validation:
- Checks if files were created successfully
- Reports file sizes
- Provides colored output for easy reading

## Maintenance

- Run the script whenever you want to regenerate the master documentation
- The script automatically handles cleanup of previous versions
- No manual intervention required for updates

## Integration

This script can be integrated into CI/CD pipelines or documentation workflows:

```yaml
# Example GitHub Actions step
- name: Generate Master Documentation
  run: ./extract-master-docs-simple.sh
```

## Output Directory Structure

When using `run-master-extraction.sh`, files are organized as follows:

```
project/
├── tools/
│   ├── run-master-extraction.sh         # Main runner script
│   ├── extract-master-docs-simple.sh    # Core extraction logic
│   └── README-extract-master-docs.md    # Documentation
└── output/
    └── master-docs-extraction-20241106-134500/  # Timestamped operation folder
        ├── docs/                              # Generated documentation
        │   ├── master-codebase.md
        │   └── master-rules.md
        ├── logs/                              # Operation logs
        │   └── extraction.log
        └── summary.txt                        # Operation summary
```

## Integration

The master runner can be integrated into CI/CD pipelines or documentation workflows:

```yaml
# Example GitHub Actions step
- name: Generate Master Documentation
  run: ./tools/run-master-extraction.sh

- name: Upload Documentation
  uses: actions/upload-artifact@v3
  with:
    name: master-documentation
    path: output/
```
