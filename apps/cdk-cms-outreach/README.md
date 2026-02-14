# cdk-cms-outreach

Dedicated infrastructure stack for CMS Outreach support services:

- ECS Fargate services for `cms-api` and `cms-worker`
- RDS PostgreSQL
- S3 bucket for call artifacts with lifecycle retention
- SQS queue + DLQ for async jobs
- CloudWatch alarms for queue depth and API CPU
- Private ALB for API routing from edge/proxy layer

## Commands

```bash
pnpm nx run cdk-cms-outreach:synth
pnpm nx run cdk-cms-outreach:diff
pnpm nx run cdk-cms-outreach:deploy
pnpm nx run cdk-cms-outreach:destroy
```

Set `DOMAIN` to override domain context:

```bash
DOMAIN=emcnotary.com pnpm nx run cdk-cms-outreach:synth
```
