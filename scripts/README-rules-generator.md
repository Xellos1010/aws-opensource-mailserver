# Rules Generator Tool

A comprehensive tool for archiving existing rules and generating new rules files from JSON input for the Freshsales Intake Guard application.

## Overview

This tool provides:
- **Archiving**: Automatically backs up existing rules before generation
- **Validation**: JSON schema validation for input files
- **Generation**: Creates MDC, MD, JSON, and YAML rule files
- **Flexibility**: Supports multiple file formats and frontmatter configurations

## Files

- `rules-schema.json` - JSON Schema for rule definitions
- `generate-rules-from-json.sh` - Main generation script
- `sample-rules-input.json` - Example input file
- `README-rules-generator.md` - This documentation

## Usage

### Basic Usage

```bash
# Generate rules from JSON file
./scripts/generate-rules-from-json.sh input-rules.json

# Generate to custom directory
./scripts/generate-rules-from-json.sh input-rules.json /path/to/custom/rules
```

### Input JSON Structure

The input JSON must follow the schema defined in `rules-schema.json`. Here's the basic structure:

```json
{
  "rules": [
    {
      "id": "rule-identifier",
      "title": "Rule Title",
      "description": "Brief description of the rule",
      "category": "typescript|react|security|etc",
      "priority": "critical|high|medium|low",
      "justification": "Why this rule is important",
      "content": [
        {
          "heading": "Section Heading",
          "level": 2,
          "content": [
            {
              "type": "paragraph",
              "text": "Regular text content with **bold** formatting"
            },
            {
              "type": "list",
              "items": [
                "First bullet point",
                "**Bold item** with formatting",
                "Regular item"
              ]
            },
            {
              "type": "code",
              "language": "typescript",
              "caption": "Code example caption",
              "code": "const example = 'hello world';"
            },
            {
              "type": "note",
              "text": "Important information to highlight"
            }
          ]
        }
      ],
      "examples": [
        {
          "title": "Example Title",
          "language": "typescript",
          "code": "console.log('example');",
          "description": "What this example demonstrates"
        }
      ],
      "relatedRules": ["other-rule-id"],
      "tags": ["tag1", "tag2"],
      "fileMetadata": {
        "filename": "rule-identifier.mdc",
        "frontmatter": {
          "alwaysApply": true,
          "globs": ["**/*.ts"],
          "description": "Short description"
        }
      },
      "status": "active",
      "reviewCycle": "quarterly"
    }
  ],
  "metadata": {
    "version": "1.0.0",
    "component": "freshsales-app"
  }
}
```

## Content Structure

Rules can include rich structured content with multiple sections, each containing different types of content blocks:

### Content Sections
- **heading**: Section title (e.g., "Authentication Requirements")
- **level**: Heading level (1-6, default: 2)
- **content**: Array of content blocks within the section

### Content Block Types

#### Paragraph
```json
{
  "type": "paragraph",
  "text": "Regular text content with **bold** and *italic* formatting"
}
```

#### List
```json
{
  "type": "list",
  "items": [
    "First bullet point",
    "**Bold item** with formatting",
    "Regular item"
  ]
}
```

#### Code Block
```json
{
  "type": "code",
  "language": "typescript",
  "caption": "Optional code block title",
  "code": "const example = 'hello world';",
  "references": [
    {
      "type": "citation",
      "index": 8
    }
  ]
}
```

#### Notes, Warnings, Tips
```json
{
  "type": "note",
  "text": "Important information to highlight"
}
```

#### Examples
```json
{
  "type": "example",
  "text": "Detailed example explanation",
  "caption": "Example title"
}
```

### Content References
References can be added to any content block:
```json
"references": [
  {
    "type": "citation",
    "index": 8
  },
  {
    "type": "link",
    "url": "https://example.com",
    "text": "Example Link"
  }
]
```

## Rule Categories

Supported categories:
- `architecture` - System architecture patterns
- `coding-standards` - Code style and conventions
- `security` - Security practices and requirements
- `performance` - Performance optimization rules
- `testing` - Testing methodologies and requirements
- `documentation` - Documentation standards
- `deployment` - Deployment and release processes
- `monitoring` - Logging and monitoring requirements
- `accessibility` - Accessibility compliance
- `development-workflow` - Development processes and tools
- `freshworks-integration` - Freshworks-specific integration rules
- `typescript` - TypeScript language requirements
- `react` - React framework requirements
- `node` - Node.js runtime requirements
- `database` - Database interaction patterns
- `api` - API design and usage patterns
- `ui-ux` - User interface and experience guidelines
- `error-handling` - Error handling and recovery
- `logging` - Logging and debugging practices
- `configuration` - Configuration management

## File Types

### MDC Files (Cursor Rules)
- Include YAML frontmatter for Cursor IDE integration
- Support `alwaysApply`, `globs`, and `description` frontmatter
- Automatically formatted with rule structure

### Markdown Files (MD)
- Standard markdown format
- Include metadata sections
- No frontmatter support

### JSON/YAML Files
- Store rule data as structured data
- Useful for programmatic access
- Include full rule metadata

## Rule ID Format

Rule IDs must follow these rules:
- Lowercase alphanumeric characters only
- Use hyphens as separators
- No spaces or special characters
- Examples: `api-validation`, `typescript-strict`, `error-boundary-usage`

## Examples

### Generating Freshworks API Rules

```bash
# Create input JSON for Freshworks API validation rules
cat > freshworks-rules.json << 'EOF'
{
  "rules": [
    {
      "id": "freshworks-api-auth",
      "title": "Freshworks API Authentication",
      "description": "All Freshworks API calls must include proper authentication",
      "category": "freshworks-integration",
      "priority": "critical",
      "justification": "Ensures secure access to Freshworks CRM data",
      "examples": [
        {
          "language": "typescript",
          "code": "const headers = { 'Authorization': `Token token=${apiKey}` };"
        }
      ],
      "fileMetadata": {
        "filename": "freshworks-api-auth.mdc",
        "frontmatter": {
          "alwaysApply": true,
          "globs": ["**/freshworks/**/*.ts"]
        }
      }
    }
  ]
}
EOF

# Generate the rules
./scripts/generate-rules-from-json.sh freshworks-rules.json
```

### Generating TypeScript Rules

```bash
# Create TypeScript strict mode rules
cat > typescript-rules.json << 'EOF'
{
  "rules": [
    {
      "id": "typescript-strict",
      "title": "TypeScript Strict Mode",
      "description": "Enable all strict TypeScript compiler options",
      "category": "typescript",
      "priority": "high",
      "justification": "Prevents runtime errors through compile-time checks",
      "fileMetadata": {
        "filename": "typescript-strict.mdc",
        "frontmatter": {
          "alwaysApply": true,
          "globs": ["**/*.ts", "**/*.tsx"]
        }
      }
    }
  ]
}
EOF

./scripts/generate-rules-from-json.sh typescript-rules.json
```

## Validation

The tool validates:
- JSON syntax
- Schema compliance (if `ajv-cli` is installed)
- Rule ID format (lowercase alphanumeric with hyphens)
- Required fields

Install schema validator:
```bash
npm install -g ajv-cli
```

## Archiving

Before generating new rules, the tool automatically:
- Creates timestamped archive directory in `.cursor/rules-archive/`
- Copies all existing rule files to archive
- Reports number of archived files

## Output Structure

Generated files are placed in the output directory with appropriate naming:

```
.cursor/rules/
├── freshworks-api-validation.mdc
├── typescript-strict-mode.mdc
├── error-boundary-usage.mdc
└── ...
```

## Integration with AI

This tool is designed to work with AI language models for rule generation:

1. **Schema First**: Use `rules-schema.json` to define expected structure
2. **Structured Input**: AI generates JSON following the schema
3. **Validation**: Tool validates AI-generated content
4. **Flexible Output**: Multiple file formats for different use cases

### Example AI Prompt

```
Generate rules for Freshworks CRM integration following this JSON schema:

[Include rules-schema.json content]

Create rules for:
1. API authentication and authorization
2. Data validation for CRM entities
3. Error handling for API failures
4. Rate limiting and retry logic

Output as valid JSON matching the schema structure.
```

## Troubleshooting

### Common Issues

**Invalid JSON**
```
Error: Invalid JSON file 'input.json'
```
- Check JSON syntax with `jq empty input.json`
- Validate against schema with `ajv validate -s rules-schema.json -d input.json`

**Invalid Rule ID**
```
Error: Invalid rule ID format: 'Invalid-Rule_ID'
```
- Use only lowercase letters, numbers, and hyphens
- Examples: `api-validation`, `typescript-config`, `error-handling`

**Missing Required Fields**
```
Error: missing required field 'title'
```
- Ensure all required fields from schema are present
- Check `rules-schema.json` for required fields list

### Dependencies

Required tools:
- `jq` - JSON processing
- `bash` - Shell environment

Optional tools:
- `ajv-cli` - JSON schema validation
- `python3` - YAML conversion (for YAML output)

Install dependencies:
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# Schema validation
npm install -g ajv-cli
```

## Best Practices

1. **Use Descriptive IDs**: Rule IDs should be descriptive but concise
2. **Include Examples**: Always provide code examples for implementation rules
3. **Link Related Rules**: Use `relatedRules` to create rule relationships
4. **Categorize Properly**: Choose appropriate categories for better organization
5. **Test Generated Rules**: Review generated files before committing
6. **Version Control**: Archive previous rules before major changes

## Schema Reference

See `rules-schema.json` for complete field definitions and validation rules.
