# Local LLM Provider Configuration

## Overview

This workspace supports routing low-cost executor tasks to locally-hosted Ollama/OpenLlama models on an external network. High-reasoning tasks (strategic, architectural, constraint interpretation) always use frontier cloud models.

## Provider: Ollama on External Network

**Base URL**: `http://<REMOTE_HOST>:11434/v1`
**Protocol**: OpenAI-compatible REST
**Auth**: None required (or set `OLLAMA_API_KEY` if behind a proxy)

## Quick Setup

### Claude Code
Set environment variable before launching:
```bash
# Point low-cost tasks at local Ollama
export OLLAMA_BASE_URL=http://<REMOTE_HOST>:11434/v1
```

Or configure via `ANTHROPIC_BASE_URL` if using Ollama as the primary provider for a session.

### Cursor
Settings → Models → Add Custom Model:
- Name: `ollama/qwen2.5-coder:7b`
- Base URL: `http://<REMOTE_HOST>:11434/v1`
- API Key: `ollama`

### Codex
`~/.codex/config.toml`:
```toml
[provider]
name = "openai-compatible"
base_url = "http://<REMOTE_HOST>:11434/v1"
api_key = "ollama"
model = "qwen2.5-coder:7b"
```

## Routing Rules

| Task Class | Model Tier | Use Local? |
|-----------|-----------|-----------|
| strategic_reasoning | frontier_reasoner | NO — cloud only |
| constraint_interpretation | frontier_reasoner | NO — cloud only |
| verification | balanced_reasoner | Optional |
| diagnostics | balanced_reasoner | Optional |
| learning | balanced_reasoner | Optional |
| deterministic_transformation | low_cost_executor | YES — prefer local |
| structured_generation | low_cost_executor | YES — prefer local |

## Recommended Models

```bash
# Pull these on your Ollama host:
ollama pull qwen2.5-coder:7b     # Best for TypeScript/JS code generation
ollama pull llama3.2:3b          # Fast, good for config/schema generation
ollama pull llama3.1:8b          # Good for documentation tasks
```

## Invoke via /model-router Skill

Use the `/model-router` skill to determine the correct provider for any work order before delegating to `@builder`.

## Reference
- `foundry/flagship-foundry-work/configs/provider-manifests/local-ollama.json`
- `foundry/flagship-foundry-work/configs/model-routing/default.json`
- `foundry/flagship-foundry-work/docs/LOCAL_MODEL_GUIDE.md`
