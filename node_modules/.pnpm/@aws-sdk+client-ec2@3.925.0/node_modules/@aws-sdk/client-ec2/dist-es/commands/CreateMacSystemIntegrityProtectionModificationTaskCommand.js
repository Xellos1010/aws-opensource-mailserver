import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { getSerdePlugin } from "@smithy/middleware-serde";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { CreateMacSystemIntegrityProtectionModificationTaskRequestFilterSensitiveLog, } from "../models/models_2";
import { de_CreateMacSystemIntegrityProtectionModificationTaskCommand, se_CreateMacSystemIntegrityProtectionModificationTaskCommand, } from "../protocols/Aws_ec2";
export { $Command };
export class CreateMacSystemIntegrityProtectionModificationTaskCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [
        getSerdePlugin(config, this.serialize, this.deserialize),
        getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
    ];
})
    .s("AmazonEC2", "CreateMacSystemIntegrityProtectionModificationTask", {})
    .n("EC2Client", "CreateMacSystemIntegrityProtectionModificationTaskCommand")
    .f(CreateMacSystemIntegrityProtectionModificationTaskRequestFilterSensitiveLog, void 0)
    .ser(se_CreateMacSystemIntegrityProtectionModificationTaskCommand)
    .de(de_CreateMacSystemIntegrityProtectionModificationTaskCommand)
    .build() {
}
