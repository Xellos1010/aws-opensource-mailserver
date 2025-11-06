import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { getSerdePlugin } from "@smithy/middleware-serde";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { CreateDelegateMacVolumeOwnershipTaskRequestFilterSensitiveLog, } from "../models/models_1";
import { de_CreateDelegateMacVolumeOwnershipTaskCommand, se_CreateDelegateMacVolumeOwnershipTaskCommand, } from "../protocols/Aws_ec2";
export { $Command };
export class CreateDelegateMacVolumeOwnershipTaskCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [
        getSerdePlugin(config, this.serialize, this.deserialize),
        getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
    ];
})
    .s("AmazonEC2", "CreateDelegateMacVolumeOwnershipTask", {})
    .n("EC2Client", "CreateDelegateMacVolumeOwnershipTaskCommand")
    .f(CreateDelegateMacVolumeOwnershipTaskRequestFilterSensitiveLog, void 0)
    .ser(se_CreateDelegateMacVolumeOwnershipTaskCommand)
    .de(de_CreateDelegateMacVolumeOwnershipTaskCommand)
    .build() {
}
