import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  StartAccessRequestRequest,
  StartAccessRequestResponse,
} from "../models/models_2";
import {
  ServiceInputTypes,
  ServiceOutputTypes,
  SSMClientResolvedConfig,
} from "../SSMClient";
export { __MetadataBearer };
export { $Command };
export interface StartAccessRequestCommandInput
  extends StartAccessRequestRequest {}
export interface StartAccessRequestCommandOutput
  extends StartAccessRequestResponse,
    __MetadataBearer {}
declare const StartAccessRequestCommand_base: {
  new (
    input: StartAccessRequestCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    StartAccessRequestCommandInput,
    StartAccessRequestCommandOutput,
    SSMClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: StartAccessRequestCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    StartAccessRequestCommandInput,
    StartAccessRequestCommandOutput,
    SSMClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class StartAccessRequestCommand extends StartAccessRequestCommand_base {
  protected static __types: {
    api: {
      input: StartAccessRequestRequest;
      output: StartAccessRequestResponse;
    };
    sdk: {
      input: StartAccessRequestCommandInput;
      output: StartAccessRequestCommandOutput;
    };
  };
}
