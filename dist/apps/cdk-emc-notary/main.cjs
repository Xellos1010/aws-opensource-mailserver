#!/usr/bin/env node

// apps/cdk-emc-notary/src/main.ts
var import_aws_cdk_lib = require("aws-cdk-lib");
var EmcNotaryBaseStack = class extends import_aws_cdk_lib.Stack {
  constructor(app2, id, p) {
    super(app2, id, p);
    new import_aws_cdk_lib.CfnOutput(this, "Bootstrap", { value: "{placeholder: true}" });
  }
};
var app = new import_aws_cdk_lib.App();
new EmcNotaryBaseStack(app, "EmcNotaryBaseStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1"
  },
  description: "EMC Notary Base Stack - Domain/DNS/SES/CDK scaffold"
});
app.synth();
//# sourceMappingURL=main.cjs.map
