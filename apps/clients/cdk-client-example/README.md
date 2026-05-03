# CDK mailserver example (`cdk-client-example`)

This directory is the **public reference CDK layout** for Mail-in-a-Box on AWS. Use it for documentation, learning, and as a copy-paste starting point for your own deployment folder under `apps/clients/`.

- **Nx projects:** `cdk-client-example-core`, `cdk-client-example-instance`, `cdk-client-example-observability-maintenance`
- **Placeholder domain:** `example.com`, SSM prefixes `/example/core` and `/example/instance`
- **Synth / deploy gate:** set `FEATURE_CDK_EMC_NOTARY_EXAMPLE_STACKS_ENABLED=1` in the environment when running Nx `synth` / `deploy` / `destroy` targets (see each `project.json`). This prevents accidental AWS changes from a fresh clone.

Additional private deployment trees are normally gitignored at `apps/clients/**`; see [docs/public/creating-a-mail-deployment-client.md](../../docs/public/creating-a-mail-deployment-client.md) to add your own tracked or private client.
