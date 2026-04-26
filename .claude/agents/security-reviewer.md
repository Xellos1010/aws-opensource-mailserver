---
name: security-reviewer
description: >
  Flagship Foundry Security Reviewer — secrets, trust boundaries, permissions, supply chain.
  Invoke as subagent or @security-reviewer in architect/verify/diagnose. READ-ONLY on source;
  produces findings with severity and remediation.
tools: Read, Grep, Glob, Bash
---

<!-- adapter: thin wrapper — canonical definition in .foundry/agents/security-reviewer.md -->
<!-- Do not edit role body here. Edit .foundry/agents/security-reviewer.md instead. -->

@../../.foundry/agents/security-reviewer.md
