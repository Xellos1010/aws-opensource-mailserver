# Work Order Quick Reference
Source: flagship-foundry-work/schemas/agent-work-order.schema.json

## Required Fields
| Field | Type | Description |
|-------|------|-------------|
| workOrderId | string | Unique identifier |
| lifecycleStage | enum | discover/define/visualize/architect/plan/implement/verify/release/operate/diagnose/improve |
| phaseId | string | kebab-case slug |
| systemId | string | Which system this targets |
| taskClass | enum | strategic_reasoning/constraint_interpretation/deterministic_transformation/structured_generation/verification/diagnostics/learning |
| agentRole | enum | systems_architect/builder/verifier/security_reviewer/performance_reviewer/etc. |
| agentPersona | enum | curious_architect/conservative_builder/skeptical_verifier/paranoid_security/performance_hunter/sync_editor/incident_commander |
| modelTier | enum | frontier_reasoner/balanced_reasoner/low_cost_executor/deterministic_rule_engine |
| sourceArtifacts | string[] | Input files/docs |
| allowedTools | string[] | Tools the agent may use |
| constraints | string[] | Rules and limits |
| expectedOutputs | string[] | What the agent produces |
| acceptanceCriteria | string[] | How to verify success |
| verificationPlan | string[] | Commands to run |
| approvalRequirements | string[] | What needs human sign-off |
| status | enum | pending/ready/in_progress/blocked/awaiting_approval/verified/failed/done |

## Context Budgets by Task Class
| Task Class | Max Artifacts | Max Files | Token Budget |
|-----------|--------------|-----------|--------------|
| strategic_reasoning | 8 | 20 | 32000 |
| constraint_interpretation | 6 | 15 | 24000 |
| deterministic_transformation | 4 | 10 | 16000 |
| structured_generation | 3 | 8 | 12000 |
| verification | 5 | 12 | 20000 |
| diagnostics | 6 | 15 | 24000 |
| learning | 4 | 10 | 16000 |

## Model Tier Routing
| Tier | Providers | Use For |
|------|-----------|---------|
| frontier_reasoner | Anthropic/OpenAI/Gemini cloud | strategic_reasoning, constraint_interpretation |
| balanced_reasoner | compatible-remote, OpenAI | verification, diagnostics, learning |
| low_cost_executor | Ollama local, compatible-remote | deterministic_transformation, structured_generation |
| deterministic_rule_engine | local function | schema validation, policy checks |
