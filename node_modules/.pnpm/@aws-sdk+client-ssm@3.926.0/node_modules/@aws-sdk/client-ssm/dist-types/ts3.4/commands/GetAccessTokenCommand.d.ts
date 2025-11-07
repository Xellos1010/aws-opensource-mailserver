import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  GetAccessTokenRequest,
  GetAccessTokenResponse,
} from "../models/models_1";
import {
  ServiceInputTypes,
  ServiceOutputTypes,
  SSMClientResolvedConfig,
} from "../SSMClient";
export { __MetadataBearer };
export { $Command };
export interface GetAccessTokenCommandInput extends GetAccessTokenRequest {}
export interface GetAccessTokenCommandOutput
  extends GetAccessTokenResponse,
    __MetadataBearer {}
declare const GetAccessTokenCommand_base: {
  new (
    input: GetAccessTokenCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetAccessTokenCommandInput,
    GetAccessTokenCommandOutput,
    SSMClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetAccessTokenCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetAccessTokenCommandInput,
    GetAccessTokenCommandOutput,
    SSMClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetAccessTokenCommand extends GetAccessTokenCommand_base {
  protected static __types: {
    api: {
      input: GetAccessTokenRequest;
      output: GetAccessTokenResponse;
    };
    sdk: {
      input: GetAccessTokenCommandInput;
      output: GetAccessTokenCommandOutput;
    };
  };
}
