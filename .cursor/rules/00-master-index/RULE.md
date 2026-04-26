---
description: Master index of development rules (reference when editing rules)
globs: .cursor/rules/**
alwaysApply: false
---
# 🎯 Master Development Rules Index - 2025 Standards

Comprehensive, fool-proof development methodology for AI-assisted web automation project development. Each rule has a single, clear responsibility.

**Last Updated:** September 2025
**Version:** 2.1.1

## 📚 Rule Categories & Organization

### 1️⃣ FOUNDATION LAYER
Core standards that all other rules build upon.

#### Code Quality & Standards
- **[ts-standards-and-strictness](../01-code-standards/ts-standards-and-strictness.mdc)** - TypeScript strictness and compiler settings
- **[eslint-configuration](../01-code-standards/eslint-configuration.mdc)** - ESLint rules and augmentations
- **[error-handling-and-reliability](../01-code-standards/error-handling-and-reliability.mdc)** - Error handling and resilience
- **[node-platform-standards](../01-code-standards/node-platform-standards.mdc)** - Node.js platform conventions
- **[separation-of-concerns](../01-code-standards/separation-of-concerns.mdc)** - SoC discipline
- **[simplicity](../01-code-standards/simplicity.mdc)** - Keep solutions minimal
- **[single-responsibility](../01-code-standards/single-responsibility.mdc)** - SRP enforcement

#### Rules Maintenance
- **[surgical-edits-rule](../surgical-edits-rule/RULE.md)** - Safe edits for rules

#### Architecture & Structure  
- **[architecture-and-nx-boundaries](../02-architecture/architecture-and-nx-boundaries.mdc)** - Monorepo layout and dependency rules

### 2️⃣ DEVELOPMENT WORKFLOW LAYER
Day-to-day development processes and procedures.

#### Workflow & SDLC
- **[dev-workflow-and-git](../03-workflow/dev-workflow-and-git.mdc)** - Day-to-day workflow and git hygiene
- **[ship-it-workflow](../03-workflow/ship-it-workflow.mdc)** - Feature and bug fix workflows
- **[sdlc-setup](../03-workflow/sdlc-setup.mdc)** - SDLC setup and guardrails
- **[documentation-standards](../03-workflow/documentation-standards.mdc)** - Documentation requirements and standards

### 3️⃣ QUALITY ASSURANCE LAYER
Testing, validation, and quality control.

#### Testing Strategies
- **[comprehensive-testing-strategy](../04-testing/comprehensive-testing-strategy.mdc)** - Testing pyramid and prevention patterns
- **[bridge-communication-testing](../04-testing/bridge-communication-testing.mdc)** - Testing browser-to-platform bridges
- **[runtime-verification](../04-testing/runtime-verification.mdc)** - Runtime checks and startup verification

#### Code Review & Validation
- **[code-review](../05-review/code-review.mdc)** - Review criteria and validation checks

### 4️⃣ PLATFORM-SPECIFIC LAYER
Third-party platform integrations and web automation.

#### API Integrations
- **[api-standards](../07-apis/api-standards.mdc)** - API structure and integration practices

### 5️⃣ INFRASTRUCTURE LAYER
Deployment, monitoring, and operations.

#### CI/CD & Deployment
- **[ci-cd-and-releases](../08-infrastructure/ci-cd-and-releases.mdc)** - CI/CD standards
- **[configuration-standards](../08-infrastructure/configuration-standards.mdc)** - Environment/config conventions
- **[deployment-workflow](../08-infrastructure/deployment-workflow.mdc)** - Release workflow
- **[ui-feature-flags](../08-infrastructure/ui-feature-flags.mdc)** - Feature flag management


### 6️⃣ OBSERVABILITY LAYER ⚡ NEW
Comprehensive monitoring, logging, and alerting.

#### Logging & Tracing
- **[structured-logging](../10-observability/structured-logging.mdc)** - JSON logging standards
- **[distributed-tracing](../10-observability/distributed-tracing.mdc)** - OpenTelemetry setup

#### Metrics & Monitoring
- **[metrics-collection](../10-observability/metrics-collection.mdc)** - Application metrics

#### Alerting & Incident Response
- **[alert-definitions](../10-observability/alert-definitions.mdc)** - Alert thresholds
- **[incident-management](../10-observability/incident-management.mdc)** - Incident response

### 7️⃣ SECURITY LAYER
Security, compliance, and data protection.

#### Security Standards
- **[security-and-secrets-policy](../11-security/security-and-secrets-policy.mdc)** - Credential handling and security baseline
- **[authentication-patterns](../11-security/authentication-patterns.mdc)** - Auth strategies
- **[authorization-rbac](../11-security/authorization-rbac.mdc)** - Access control
- **[data-encryption](../11-security/data-encryption.mdc)** - Encryption at rest/transit

#### Compliance & Privacy
- **[hipaa-compliance](../11-security/hipaa-compliance.mdc)** - Healthcare data
- **[gdpr-compliance](../11-security/gdpr-compliance.mdc)** - EU data protection
- **[audit-logging](../11-security/audit-logging.mdc)** - Compliance tracking
- **[data-retention](../11-security/data-retention.mdc)** - Data lifecycle

### 8️⃣ PERFORMANCE LAYER
Optimization and efficiency.

#### Application Performance
- **[performance-and-bundling](../12-performance/performance-and-bundling.mdc)** - Performance and bundling guidance

### 9️⃣ WEB AUTOMATION LAYER
Web automation specific standards and patterns.

#### Browser Automation
- **[service-worker-dom-mocking](../15-web-automation/service-worker-dom-mocking.mdc)** - DOM mocking in service worker tests
- **[browser-injection-standards](../16-web-automation/browser-injection-standards.mdc)** - Browser script injection and content security
- **[flow-standards](../16-web-automation/flow-standards.mdc)** - Automation flow definitions and structure
- **[web-automation-development](../16-web-automation/web-automation-development.mdc)** - Development standards for web automation

#### Chrome Extensions
- **[summerysky-extension-standards](../15-chome-extension/summerysky-extension-standards.mdc)** - SummerySky MV3, HIPAA, reusable modules
- **[chrome-extension-app-structure](../15-chome-extension/chrome-extension-app-structure.mdc)** - Extension layout and boundaries
- **[code-style-and-structure](../15-chome-extension/code-style-and-structure.mdc)** - Extension code conventions
- **[flows-spec-and-execution](../15-chome-extension/flows-spec-and-execution.mdc)** - Flow specs and execution
- **[logging-and-observability](../15-chome-extension/logging-and-observability.mdc)** - Logging expectations
- **[messaging-contracts](../15-chome-extension/messaging-contracts.mdc)** - Message contracts
- **[mv3-lifecycle-and-state](../15-chome-extension/mv3-lifecycle-and-state.mdc)** - MV3 lifecycle/state handling
- **[playwright-and-e2e](../15-chome-extension/playwright-and-e2e.mdc)** - Playwright guidance
- **[prompts-and-workflows](../15-chome-extension/prompts-and-workflows.mdc)** - Prompt and workflow guidance
- **[repo-conventions](../15-chome-extension/repo-conventions.mdc)** - Repo conventions
- **[security-and-permissions](../15-chome-extension/security-and-permissions.mdc)** - Extension security/perms
- **[selectors-and-waits](../15-chome-extension/selectors-and-waits.mdc)** - Selector standards
- **[sidepanel-application-model](../15-chome-extension/sidepanel-application-model.mdc)** - Sidepanel architecture
- **[build-and-serve](../15-chome-extension/build-and-serve.mdc)** - Build/serve workflow

### 🔟 USER EXPERIENCE LAYER
Frontend and user interface standards.

#### Accessibility
- **[accessibility-standards](../13-ux/accessibility-standards.mdc)** - Accessibility guidance
- **[react-standards](../13-ux/react-standards.mdc)** - React UI standards

### 1️⃣1️⃣ AUTOMATION LAYER
Build tools and automation.

#### Build & Bundle
- **[nx-rules](../nx-rules/RULE.md)** - Nx automation guidance
- **[nx-configuration](../nx-configuration/RULE.md)** - Nx defaults and cache settings
- **[nx-sdlc](../nx-sdlc/RULE.md)** - Tagging and boundary standards

## 📋 Master Checklists

### 🚀 New Project Setup Checklist
```markdown
## Foundation
- [ ] Initialize Nx workspace with pnpm
- [ ] Configure TypeScript strict mode
- [ ] Set up ESLint and Prettier
- [ ] Configure pre-commit hooks

## Architecture
- [ ] Define module boundaries
- [ ] Create library structure
- [ ] Set up path aliases
- [ ] Document ADRs

## Quality
- [ ] Set up Vitest/Jest
- [ ] Configure coverage thresholds
- [ ] Add E2E test framework
- [ ] Create PR templates

## Infrastructure
- [ ] Set up CI/CD pipeline
- [ ] Configure environments (dev/staging/prod)
- [ ] Set up feature flags
- [ ] Configure monitoring

## Observability
- [ ] Set up structured logging
- [ ] Configure OpenTelemetry
- [ ] Set up metrics collection
- [ ] Create dashboards
- [ ] Define alerts

## Security
- [ ] Configure secrets management
- [ ] Set up authentication
- [ ] Enable audit logging
- [ ] Configure SAST/DAST scanning

## Documentation
- [ ] Create README
- [ ] Document API contracts
- [ ] Create runbooks
- [ ] Set up architecture diagrams
```

### 🎯 Feature Development Checklist
```markdown
## Planning
- [ ] Write user story
- [ ] Define acceptance criteria
- [ ] Identify dependencies
- [ ] Create feature flag
- [ ] Plan observability

## Development
- [ ] Create feature branch
- [ ] Write failing tests first
- [ ] Implement incrementally
- [ ] Add logging and metrics
- [ ] Update documentation

## Quality
- [ ] Run affected tests
- [ ] Check coverage
- [ ] Perform security scan
- [ ] Review performance impact
- [ ] Validate accessibility

## Deployment
- [ ] Deploy to preview
- [ ] Test in staging
- [ ] Progressive rollout
- [ ] Monitor metrics
- [ ] Update changelog
```

### 🐛 Bug Fix Checklist
```markdown
## Triage
- [ ] Assess severity
- [ ] Identify root cause
- [ ] Document impact
- [ ] Create failing test

## Fix
- [ ] Implement minimal fix
- [ ] Add regression tests
- [ ] Update documentation
- [ ] Add monitoring

## Validation
- [ ] Test in staging
- [ ] Verify metrics
- [ ] Deploy to production
- [ ] Monitor for 30 minutes
- [ ] Create postmortem (if P0/P1)
```

### 📊 Observability Setup Checklist
```markdown
## Logging
- [ ] Structured JSON format
- [ ] Correlation IDs
- [ ] Log levels configured
- [ ] PII redaction
- [ ] Log aggregation setup

## Metrics
- [ ] RED metrics (Rate, Errors, Duration)
- [ ] USE metrics (Utilization, Saturation, Errors)
- [ ] Business KPIs defined
- [ ] Custom metrics implemented
- [ ] Dashboards created

## Tracing
- [ ] OpenTelemetry SDK initialized
- [ ] Span creation for key operations
- [ ] Context propagation
- [ ] Sampling strategy defined
- [ ] Trace visualization setup

## Alerting
- [ ] SLIs defined
- [ ] SLOs established
- [ ] Alert rules created
- [ ] Escalation policies set
- [ ] Runbooks linked
```

## 🔄 Rule Consolidation Map

### Consolidated Rules (Following SRP)
1. **ESLint Configuration** = eslint-augment + no-eval + no-template-literals + no-unicode
2. **Testing Strategy** = jest-standards + testing-strategy + tests
3. **Module Imports** = es-module-path-resolution + proper-es-module-imports + prefer-concatenation
4. **Observability** = logging-and-observability + monitoring-and-alerting + NEW observability rules
5. **Deployment** = deployment-workflow + ci-cd-and-releases
6. **Workflow** = dev-workflow-and-git + ship-it-workflow + sdlc-setup

## 🎓 Learning Path

### For New Developers
1. Start with Foundation Layer
2. Learn Development Workflow
3. Master Testing Strategies
4. Understand Platform Specifics

### For Senior Developers
1. Review Architecture patterns
2. Focus on Observability
3. Master Performance optimization
4. Lead Security initiatives

## 📈 Success Metrics

Track these KPIs to measure effectiveness:

### Development Velocity
- Lead time: < 3 days
- Deployment frequency: Multiple/day
- PR review time: < 4 hours
- Build time: < 10 minutes

### Quality Metrics
- Test coverage: > 80%
- Code review coverage: 100%
- Defect escape rate: < 5%
- Technical debt ratio: < 10%

### Operational Excellence
- MTTR: < 30 minutes
- MTBF: > 7 days
- Availability: > 99.9%
- Alert noise ratio: < 20%

### Observability Metrics
- Log coverage: 100% of services
- Trace coverage: 100% of critical paths
- Dashboard adoption: > 90%
- Alert response time: < 5 minutes

## 🚨 Red Flags

Watch for these anti-patterns:
- Skipping tests to meet deadlines
- Deploying without feature flags
- Ignoring observability setup
- Manual deployments
- Secrets in code
- Missing documentation
- Untracked technical debt

## 📝 Notes

This master index follows the Single Responsibility Principle where each rule has ONE clear purpose. Rules are organized in layers from foundation to specific implementations. Each rule includes checklists for fool-proof AI-assisted development.

**Version History:**
- 2.1.0 - Web automation focus, removed irrelevant enterprise rules, added Playwright standards
- 2.0.0 - Complete reorganization with SRP
- 1.0.0 - Initial rules collection
