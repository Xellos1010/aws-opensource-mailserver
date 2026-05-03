# CDK mailserver example (`cdk-client-example`)

This directory is a **sanitized template** derived from the internal sample mailserver CDK layout. It is intended for documentation, onboarding, and open-source consumers.

- **Nx projects:** `cdk-client-example-core`, `cdk-client-example-instance`, `cdk-client-example-observability-maintenance`
- **Placeholder domain:** `example.com`, SSM prefixes `/example/core` and `/example/instance`
- **Synth / deploy gate:** set `FEATURE_CDK_EMC_NOTARY_EXAMPLE_STACKS_ENABLED=1` (used in `project.json` commands the same way as the original app’s feature flag)

Internal-only CDK trees are omitted from the public repository; use this example app as the reference implementation.
