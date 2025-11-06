import * as cdk from "../../core";
import * as constructs from "constructs";
import * as cfn_parse from "../../core/lib/helpers-internal";
/**
 * Indicates that this resource can be referenced as a BrowserCustom.
 *
 * @stability experimental
 */
export interface IBrowserCustomRef extends constructs.IConstruct, cdk.IEnvironmentAware {
    /**
     * A reference to a BrowserCustom resource.
     */
    readonly browserCustomRef: BrowserCustomReference;
}
/**
 * AgentCore Browser tool provides a fast, secure, cloud-based browser runtime to enable AI agents to interact with websites at scale.
 *
 * For more information about using the custom browser, see [Interact with web applications using Amazon Bedrock AgentCore Browser](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/browser-tool.html) .
 *
 * See the *Properties* section below for descriptions of both the required and optional properties.
 *
 * @cloudformationResource AWS::BedrockAgentCore::BrowserCustom
 * @stability external
 * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-browsercustom.html
 */
export declare class CfnBrowserCustom extends cdk.CfnResource implements cdk.IInspectable, IBrowserCustomRef, cdk.ITaggableV2 {
    /**
     * The CloudFormation resource type name for this resource class.
     */
    static readonly CFN_RESOURCE_TYPE_NAME: string;
    /**
     * Build a CfnBrowserCustom from CloudFormation properties
     *
     * A factory method that creates a new instance of this class from an object
     * containing the CloudFormation properties of this resource.
     * Used in the @aws-cdk/cloudformation-include module.
     *
     * @internal
     */
    static _fromCloudFormation(scope: constructs.Construct, id: string, resourceAttributes: any, options: cfn_parse.FromCloudFormationOptions): CfnBrowserCustom;
    /**
     * Creates a new IBrowserCustomRef from a browserId
     */
    static fromBrowserId(scope: constructs.Construct, id: string, browserId: string): IBrowserCustomRef;
    /**
     * The ARN for the custom browser.
     *
     * @cloudformationAttribute BrowserArn
     */
    readonly attrBrowserArn: string;
    /**
     * The ID for the custom browser.
     *
     * @cloudformationAttribute BrowserId
     */
    readonly attrBrowserId: string;
    /**
     * The time at which the custom browser was created.
     *
     * @cloudformationAttribute CreatedAt
     */
    readonly attrCreatedAt: string;
    /**
     * The reason for failure if the browser creation or operation failed.
     *
     * @cloudformationAttribute FailureReason
     */
    readonly attrFailureReason: string;
    /**
     * The time at which the custom browser was last updated.
     *
     * @cloudformationAttribute LastUpdatedAt
     */
    readonly attrLastUpdatedAt: string;
    /**
     * The status of the custom browser.
     *
     * @cloudformationAttribute Status
     */
    readonly attrStatus: string;
    /**
     * Tag Manager which manages the tags for this resource
     */
    readonly cdkTagManager: cdk.TagManager;
    /**
     * The custom browser.
     */
    description?: string;
    /**
     * The Amazon Resource Name (ARN) of the execution role.
     */
    executionRoleArn?: string;
    /**
     * The name of the custom browser.
     */
    name: string;
    /**
     * The network configuration for a code interpreter.
     */
    networkConfiguration: CfnBrowserCustom.BrowserNetworkConfigurationProperty | cdk.IResolvable;
    /**
     * THe custom browser configuration.
     */
    recordingConfig?: cdk.IResolvable | CfnBrowserCustom.RecordingConfigProperty;
    /**
     * The tags for the custom browser.
     */
    tags?: Record<string, string>;
    /**
     * @param scope Scope in which this resource is defined
     * @param id Construct identifier for this resource (unique in its scope)
     * @param props Resource properties
     */
    constructor(scope: constructs.Construct, id: string, props: CfnBrowserCustomProps);
    get browserCustomRef(): BrowserCustomReference;
    protected get cfnProperties(): Record<string, any>;
    /**
     * Examines the CloudFormation resource and discloses attributes
     *
     * @param inspector tree inspector to collect and process attributes
     */
    inspect(inspector: cdk.TreeInspector): void;
    protected renderProperties(props: Record<string, any>): Record<string, any>;
}
export declare namespace CfnBrowserCustom {
    /**
     * The network configuration.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-browsercustom-browsernetworkconfiguration.html
     */
    interface BrowserNetworkConfigurationProperty {
        /**
         * The network mode.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-browsercustom-browsernetworkconfiguration.html#cfn-bedrockagentcore-browsercustom-browsernetworkconfiguration-networkmode
         */
        readonly networkMode: string;
        /**
         * Network mode configuration for VPC.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-browsercustom-browsernetworkconfiguration.html#cfn-bedrockagentcore-browsercustom-browsernetworkconfiguration-vpcconfig
         */
        readonly vpcConfig?: cdk.IResolvable | CfnBrowserCustom.VpcConfigProperty;
    }
    /**
     * Network mode configuration for VPC.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-browsercustom-vpcconfig.html
     */
    interface VpcConfigProperty {
        /**
         * Security groups for VPC.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-browsercustom-vpcconfig.html#cfn-bedrockagentcore-browsercustom-vpcconfig-securitygroups
         */
        readonly securityGroups: Array<string>;
        /**
         * Subnets for VPC.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-browsercustom-vpcconfig.html#cfn-bedrockagentcore-browsercustom-vpcconfig-subnets
         */
        readonly subnets: Array<string>;
    }
    /**
     * The recording configuration.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-browsercustom-recordingconfig.html
     */
    interface RecordingConfigProperty {
        /**
         * The recording configuration for a browser.
         *
         * This structure defines how browser sessions are recorded.
         *
         * @default - false
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-browsercustom-recordingconfig.html#cfn-bedrockagentcore-browsercustom-recordingconfig-enabled
         */
        readonly enabled?: boolean | cdk.IResolvable;
        /**
         * The S3 location.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-browsercustom-recordingconfig.html#cfn-bedrockagentcore-browsercustom-recordingconfig-s3location
         */
        readonly s3Location?: cdk.IResolvable | CfnBrowserCustom.S3LocationProperty;
    }
    /**
     * The S3 location.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-browsercustom-s3location.html
     */
    interface S3LocationProperty {
        /**
         * The S3 location bucket name.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-browsercustom-s3location.html#cfn-bedrockagentcore-browsercustom-s3location-bucket
         */
        readonly bucket: string;
        /**
         * The S3 location object prefix.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-browsercustom-s3location.html#cfn-bedrockagentcore-browsercustom-s3location-prefix
         */
        readonly prefix: string;
    }
}
/**
 * Properties for defining a `CfnBrowserCustom`
 *
 * @struct
 * @stability external
 * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-browsercustom.html
 */
export interface CfnBrowserCustomProps {
    /**
     * The custom browser.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-browsercustom.html#cfn-bedrockagentcore-browsercustom-description
     */
    readonly description?: string;
    /**
     * The Amazon Resource Name (ARN) of the execution role.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-browsercustom.html#cfn-bedrockagentcore-browsercustom-executionrolearn
     */
    readonly executionRoleArn?: string;
    /**
     * The name of the custom browser.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-browsercustom.html#cfn-bedrockagentcore-browsercustom-name
     */
    readonly name: string;
    /**
     * The network configuration for a code interpreter.
     *
     * This structure defines how the code interpreter connects to the network.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-browsercustom.html#cfn-bedrockagentcore-browsercustom-networkconfiguration
     */
    readonly networkConfiguration: CfnBrowserCustom.BrowserNetworkConfigurationProperty | cdk.IResolvable;
    /**
     * THe custom browser configuration.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-browsercustom.html#cfn-bedrockagentcore-browsercustom-recordingconfig
     */
    readonly recordingConfig?: cdk.IResolvable | CfnBrowserCustom.RecordingConfigProperty;
    /**
     * The tags for the custom browser.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-browsercustom.html#cfn-bedrockagentcore-browsercustom-tags
     */
    readonly tags?: Record<string, string>;
}
/**
 * A reference to a BrowserCustom resource.
 *
 * @struct
 * @stability external
 */
export interface BrowserCustomReference {
    /**
     * The BrowserId of the BrowserCustom resource.
     */
    readonly browserId: string;
}
/**
 * Indicates that this resource can be referenced as a CodeInterpreterCustom.
 *
 * @stability experimental
 */
export interface ICodeInterpreterCustomRef extends constructs.IConstruct, cdk.IEnvironmentAware {
    /**
     * A reference to a CodeInterpreterCustom resource.
     */
    readonly codeInterpreterCustomRef: CodeInterpreterCustomReference;
}
/**
 * The AgentCore Code Interpreter tool enables agents to securely execute code in isolated sandbox environments.
 *
 * It offers advanced configuration support and seamless integration with popular frameworks.
 *
 * For more information about using the custom code interpreter, see [Execute code and analyze data using Amazon Bedrock AgentCore Code Interpreter](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/code-interpreter-tool.html) .
 *
 * See the *Properties* section below for descriptions of both the required and optional properties.
 *
 * @cloudformationResource AWS::BedrockAgentCore::CodeInterpreterCustom
 * @stability external
 * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-codeinterpretercustom.html
 */
export declare class CfnCodeInterpreterCustom extends cdk.CfnResource implements cdk.IInspectable, ICodeInterpreterCustomRef, cdk.ITaggableV2 {
    /**
     * The CloudFormation resource type name for this resource class.
     */
    static readonly CFN_RESOURCE_TYPE_NAME: string;
    /**
     * Build a CfnCodeInterpreterCustom from CloudFormation properties
     *
     * A factory method that creates a new instance of this class from an object
     * containing the CloudFormation properties of this resource.
     * Used in the @aws-cdk/cloudformation-include module.
     *
     * @internal
     */
    static _fromCloudFormation(scope: constructs.Construct, id: string, resourceAttributes: any, options: cfn_parse.FromCloudFormationOptions): CfnCodeInterpreterCustom;
    /**
     * Creates a new ICodeInterpreterCustomRef from a codeInterpreterId
     */
    static fromCodeInterpreterId(scope: constructs.Construct, id: string, codeInterpreterId: string): ICodeInterpreterCustomRef;
    /**
     * The code interpreter Amazon Resource Name (ARN).
     *
     * @cloudformationAttribute CodeInterpreterArn
     */
    readonly attrCodeInterpreterArn: string;
    /**
     * The ID of the code interpreter.
     *
     * @cloudformationAttribute CodeInterpreterId
     */
    readonly attrCodeInterpreterId: string;
    /**
     * The time at which the code interpreter was created.
     *
     * @cloudformationAttribute CreatedAt
     */
    readonly attrCreatedAt: string;
    /**
     * The reason for failure if the code interpreter creation or operation failed.
     *
     * @cloudformationAttribute FailureReason
     */
    readonly attrFailureReason: string;
    /**
     * The time at which the code interpreter was last updated.
     *
     * @cloudformationAttribute LastUpdatedAt
     */
    readonly attrLastUpdatedAt: string;
    /**
     * The status of the custom code interpreter.
     *
     * @cloudformationAttribute Status
     */
    readonly attrStatus: string;
    /**
     * Tag Manager which manages the tags for this resource
     */
    readonly cdkTagManager: cdk.TagManager;
    /**
     * The code interpreter description.
     */
    description?: string;
    /**
     * The Amazon Resource Name (ARN) of the execution role.
     */
    executionRoleArn?: string;
    /**
     * The name of the code interpreter.
     */
    name: string;
    /**
     * The network configuration for a code interpreter.
     */
    networkConfiguration: CfnCodeInterpreterCustom.CodeInterpreterNetworkConfigurationProperty | cdk.IResolvable;
    /**
     * The tags for the code interpreter.
     */
    tags?: Record<string, string>;
    /**
     * @param scope Scope in which this resource is defined
     * @param id Construct identifier for this resource (unique in its scope)
     * @param props Resource properties
     */
    constructor(scope: constructs.Construct, id: string, props: CfnCodeInterpreterCustomProps);
    get codeInterpreterCustomRef(): CodeInterpreterCustomReference;
    protected get cfnProperties(): Record<string, any>;
    /**
     * Examines the CloudFormation resource and discloses attributes
     *
     * @param inspector tree inspector to collect and process attributes
     */
    inspect(inspector: cdk.TreeInspector): void;
    protected renderProperties(props: Record<string, any>): Record<string, any>;
}
export declare namespace CfnCodeInterpreterCustom {
    /**
     * The network configuration.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-codeinterpretercustom-codeinterpreternetworkconfiguration.html
     */
    interface CodeInterpreterNetworkConfigurationProperty {
        /**
         * The network mode.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-codeinterpretercustom-codeinterpreternetworkconfiguration.html#cfn-bedrockagentcore-codeinterpretercustom-codeinterpreternetworkconfiguration-networkmode
         */
        readonly networkMode: string;
        /**
         * Network mode configuration for VPC.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-codeinterpretercustom-codeinterpreternetworkconfiguration.html#cfn-bedrockagentcore-codeinterpretercustom-codeinterpreternetworkconfiguration-vpcconfig
         */
        readonly vpcConfig?: cdk.IResolvable | CfnCodeInterpreterCustom.VpcConfigProperty;
    }
    /**
     * Network mode configuration for VPC.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-codeinterpretercustom-vpcconfig.html
     */
    interface VpcConfigProperty {
        /**
         * Security groups for VPC.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-codeinterpretercustom-vpcconfig.html#cfn-bedrockagentcore-codeinterpretercustom-vpcconfig-securitygroups
         */
        readonly securityGroups: Array<string>;
        /**
         * Subnets for VPC.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-codeinterpretercustom-vpcconfig.html#cfn-bedrockagentcore-codeinterpretercustom-vpcconfig-subnets
         */
        readonly subnets: Array<string>;
    }
}
/**
 * Properties for defining a `CfnCodeInterpreterCustom`
 *
 * @struct
 * @stability external
 * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-codeinterpretercustom.html
 */
export interface CfnCodeInterpreterCustomProps {
    /**
     * The code interpreter description.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-codeinterpretercustom.html#cfn-bedrockagentcore-codeinterpretercustom-description
     */
    readonly description?: string;
    /**
     * The Amazon Resource Name (ARN) of the execution role.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-codeinterpretercustom.html#cfn-bedrockagentcore-codeinterpretercustom-executionrolearn
     */
    readonly executionRoleArn?: string;
    /**
     * The name of the code interpreter.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-codeinterpretercustom.html#cfn-bedrockagentcore-codeinterpretercustom-name
     */
    readonly name: string;
    /**
     * The network configuration for a code interpreter.
     *
     * This structure defines how the code interpreter connects to the network.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-codeinterpretercustom.html#cfn-bedrockagentcore-codeinterpretercustom-networkconfiguration
     */
    readonly networkConfiguration: CfnCodeInterpreterCustom.CodeInterpreterNetworkConfigurationProperty | cdk.IResolvable;
    /**
     * The tags for the code interpreter.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-codeinterpretercustom.html#cfn-bedrockagentcore-codeinterpretercustom-tags
     */
    readonly tags?: Record<string, string>;
}
/**
 * A reference to a CodeInterpreterCustom resource.
 *
 * @struct
 * @stability external
 */
export interface CodeInterpreterCustomReference {
    /**
     * The CodeInterpreterId of the CodeInterpreterCustom resource.
     */
    readonly codeInterpreterId: string;
}
/**
 * Indicates that this resource can be referenced as a Gateway.
 *
 * @stability experimental
 */
export interface IGatewayRef extends constructs.IConstruct, cdk.IEnvironmentAware {
    /**
     * A reference to a Gateway resource.
     */
    readonly gatewayRef: GatewayReference;
}
/**
 * Amazon Bedrock AgentCore Gateway provides a unified connectivity layer between agents and the tools and resources they need to interact with.
 *
 * For more information about creating a gateway, see [Set up an Amazon Bedrock AgentCore gateway](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-building.html) .
 *
 * See the *Properties* section below for descriptions of both the required and optional properties.
 *
 * @cloudformationResource AWS::BedrockAgentCore::Gateway
 * @stability external
 * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gateway.html
 */
export declare class CfnGateway extends cdk.CfnResource implements cdk.IInspectable, IGatewayRef, cdk.ITaggableV2 {
    /**
     * The CloudFormation resource type name for this resource class.
     */
    static readonly CFN_RESOURCE_TYPE_NAME: string;
    /**
     * Build a CfnGateway from CloudFormation properties
     *
     * A factory method that creates a new instance of this class from an object
     * containing the CloudFormation properties of this resource.
     * Used in the @aws-cdk/cloudformation-include module.
     *
     * @internal
     */
    static _fromCloudFormation(scope: constructs.Construct, id: string, resourceAttributes: any, options: cfn_parse.FromCloudFormationOptions): CfnGateway;
    /**
     * The date and time at which the gateway was created.
     *
     * @cloudformationAttribute CreatedAt
     */
    readonly attrCreatedAt: string;
    /**
     * The ARN for the gateway.
     *
     * @cloudformationAttribute GatewayArn
     */
    readonly attrGatewayArn: string;
    /**
     * @cloudformationAttribute GatewayIdentifier
     */
    readonly attrGatewayIdentifier: string;
    /**
     * The gateway URL for the gateway.
     *
     * @cloudformationAttribute GatewayUrl
     */
    readonly attrGatewayUrl: string;
    /**
     * The status for the gateway.
     *
     * @cloudformationAttribute Status
     */
    readonly attrStatus: string;
    /**
     * The status reasons for the gateway.
     *
     * @cloudformationAttribute StatusReasons
     */
    readonly attrStatusReasons: Array<string>;
    /**
     * @cloudformationAttribute UpdatedAt
     */
    readonly attrUpdatedAt: string;
    /**
     * @cloudformationAttribute WorkloadIdentityDetails
     */
    readonly attrWorkloadIdentityDetails: cdk.IResolvable;
    authorizerConfiguration?: CfnGateway.AuthorizerConfigurationProperty | cdk.IResolvable;
    /**
     * The authorizer type for the gateway.
     */
    authorizerType: string;
    /**
     * Tag Manager which manages the tags for this resource
     */
    readonly cdkTagManager: cdk.TagManager;
    /**
     * The description for the gateway.
     */
    description?: string;
    /**
     * The exception level for the gateway.
     */
    exceptionLevel?: string;
    /**
     * The KMS key ARN for the gateway.
     */
    kmsKeyArn?: string;
    /**
     * The name for the gateway.
     */
    name: string;
    /**
     * The protocol configuration for the gateway target.
     */
    protocolConfiguration?: CfnGateway.GatewayProtocolConfigurationProperty | cdk.IResolvable;
    /**
     * The protocol type for the gateway target.
     */
    protocolType: string;
    roleArn: string;
    /**
     * The tags for the gateway.
     */
    tags?: Record<string, string>;
    /**
     * @param scope Scope in which this resource is defined
     * @param id Construct identifier for this resource (unique in its scope)
     * @param props Resource properties
     */
    constructor(scope: constructs.Construct, id: string, props: CfnGatewayProps);
    get gatewayRef(): GatewayReference;
    protected get cfnProperties(): Record<string, any>;
    /**
     * Examines the CloudFormation resource and discloses attributes
     *
     * @param inspector tree inspector to collect and process attributes
     */
    inspect(inspector: cdk.TreeInspector): void;
    protected renderProperties(props: Record<string, any>): Record<string, any>;
}
export declare namespace CfnGateway {
    /**
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gateway-authorizerconfiguration.html
     */
    interface AuthorizerConfigurationProperty {
        /**
         * The authorizer configuration for the gateway.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gateway-authorizerconfiguration.html#cfn-bedrockagentcore-gateway-authorizerconfiguration-customjwtauthorizer
         */
        readonly customJwtAuthorizer: CfnGateway.CustomJWTAuthorizerConfigurationProperty | cdk.IResolvable;
    }
    /**
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gateway-customjwtauthorizerconfiguration.html
     */
    interface CustomJWTAuthorizerConfigurationProperty {
        /**
         * The allowed audience authorized for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gateway-customjwtauthorizerconfiguration.html#cfn-bedrockagentcore-gateway-customjwtauthorizerconfiguration-allowedaudience
         */
        readonly allowedAudience?: Array<string>;
        /**
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gateway-customjwtauthorizerconfiguration.html#cfn-bedrockagentcore-gateway-customjwtauthorizerconfiguration-allowedclients
         */
        readonly allowedClients?: Array<string>;
        /**
         * The discovery URL for the authorizer configuration.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gateway-customjwtauthorizerconfiguration.html#cfn-bedrockagentcore-gateway-customjwtauthorizerconfiguration-discoveryurl
         */
        readonly discoveryUrl: string;
    }
    /**
     * The protocol configuration.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gateway-gatewayprotocolconfiguration.html
     */
    interface GatewayProtocolConfigurationProperty {
        /**
         * The gateway protocol configuration for MCP.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gateway-gatewayprotocolconfiguration.html#cfn-bedrockagentcore-gateway-gatewayprotocolconfiguration-mcp
         */
        readonly mcp: cdk.IResolvable | CfnGateway.MCPGatewayConfigurationProperty;
    }
    /**
     * The gateway configuration for MCP.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gateway-mcpgatewayconfiguration.html
     */
    interface MCPGatewayConfigurationProperty {
        /**
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gateway-mcpgatewayconfiguration.html#cfn-bedrockagentcore-gateway-mcpgatewayconfiguration-instructions
         */
        readonly instructions?: string;
        /**
         * The MCP gateway configuration search type.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gateway-mcpgatewayconfiguration.html#cfn-bedrockagentcore-gateway-mcpgatewayconfiguration-searchtype
         */
        readonly searchType?: string;
        /**
         * The supported versions for the MCP configuration for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gateway-mcpgatewayconfiguration.html#cfn-bedrockagentcore-gateway-mcpgatewayconfiguration-supportedversions
         */
        readonly supportedVersions?: Array<string>;
    }
    /**
     * The workload identity details for the gateway.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gateway-workloadidentitydetails.html
     */
    interface WorkloadIdentityDetailsProperty {
        /**
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gateway-workloadidentitydetails.html#cfn-bedrockagentcore-gateway-workloadidentitydetails-workloadidentityarn
         */
        readonly workloadIdentityArn: string;
    }
}
/**
 * Properties for defining a `CfnGateway`
 *
 * @struct
 * @stability external
 * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gateway.html
 */
export interface CfnGatewayProps {
    /**
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gateway.html#cfn-bedrockagentcore-gateway-authorizerconfiguration
     */
    readonly authorizerConfiguration?: CfnGateway.AuthorizerConfigurationProperty | cdk.IResolvable;
    /**
     * The authorizer type for the gateway.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gateway.html#cfn-bedrockagentcore-gateway-authorizertype
     */
    readonly authorizerType: string;
    /**
     * The description for the gateway.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gateway.html#cfn-bedrockagentcore-gateway-description
     */
    readonly description?: string;
    /**
     * The exception level for the gateway.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gateway.html#cfn-bedrockagentcore-gateway-exceptionlevel
     */
    readonly exceptionLevel?: string;
    /**
     * The KMS key ARN for the gateway.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gateway.html#cfn-bedrockagentcore-gateway-kmskeyarn
     */
    readonly kmsKeyArn?: string;
    /**
     * The name for the gateway.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gateway.html#cfn-bedrockagentcore-gateway-name
     */
    readonly name: string;
    /**
     * The protocol configuration for the gateway target.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gateway.html#cfn-bedrockagentcore-gateway-protocolconfiguration
     */
    readonly protocolConfiguration?: CfnGateway.GatewayProtocolConfigurationProperty | cdk.IResolvable;
    /**
     * The protocol type for the gateway target.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gateway.html#cfn-bedrockagentcore-gateway-protocoltype
     */
    readonly protocolType: string;
    /**
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gateway.html#cfn-bedrockagentcore-gateway-rolearn
     */
    readonly roleArn: string;
    /**
     * The tags for the gateway.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gateway.html#cfn-bedrockagentcore-gateway-tags
     */
    readonly tags?: Record<string, string>;
}
/**
 * A reference to a Gateway resource.
 *
 * @struct
 * @stability external
 */
export interface GatewayReference {
    /**
     * The GatewayIdentifier of the Gateway resource.
     */
    readonly gatewayIdentifier: string;
    /**
     * The ARN of the Gateway resource.
     */
    readonly gatewayArn: string;
}
/**
 * Indicates that this resource can be referenced as a GatewayTarget.
 *
 * @stability experimental
 */
export interface IGatewayTargetRef extends constructs.IConstruct, cdk.IEnvironmentAware {
    /**
     * A reference to a GatewayTarget resource.
     */
    readonly gatewayTargetRef: GatewayTargetReference;
}
/**
 * After creating a gateway, you can add targets, which define the tools that your gateway will host.
 *
 * For more information about adding gateway targets, see [Add targets to an existing gateway](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-building-adding-targets.html) .
 *
 * See the *Properties* section below for descriptions of both the required and optional properties.
 *
 * @cloudformationResource AWS::BedrockAgentCore::GatewayTarget
 * @stability external
 * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gatewaytarget.html
 */
export declare class CfnGatewayTarget extends cdk.CfnResource implements cdk.IInspectable, IGatewayTargetRef {
    /**
     * The CloudFormation resource type name for this resource class.
     */
    static readonly CFN_RESOURCE_TYPE_NAME: string;
    /**
     * Build a CfnGatewayTarget from CloudFormation properties
     *
     * A factory method that creates a new instance of this class from an object
     * containing the CloudFormation properties of this resource.
     * Used in the @aws-cdk/cloudformation-include module.
     *
     * @internal
     */
    static _fromCloudFormation(scope: constructs.Construct, id: string, resourceAttributes: any, options: cfn_parse.FromCloudFormationOptions): CfnGatewayTarget;
    /**
     * The date and time at which the gateway target was created.
     *
     * @cloudformationAttribute CreatedAt
     */
    readonly attrCreatedAt: string;
    /**
     * @cloudformationAttribute GatewayArn
     */
    readonly attrGatewayArn: string;
    /**
     * The status for the gateway target.
     *
     * @cloudformationAttribute Status
     */
    readonly attrStatus: string;
    /**
     * The status reasons for the gateway target.
     *
     * @cloudformationAttribute StatusReasons
     */
    readonly attrStatusReasons: Array<string>;
    /**
     * The target ID for the gateway target.
     *
     * @cloudformationAttribute TargetId
     */
    readonly attrTargetId: string;
    /**
     * The time at which the resource was updated.
     *
     * @cloudformationAttribute UpdatedAt
     */
    readonly attrUpdatedAt: string;
    /**
     * The OAuth credential provider configuration.
     */
    credentialProviderConfigurations: Array<CfnGatewayTarget.CredentialProviderConfigurationProperty | cdk.IResolvable> | cdk.IResolvable;
    /**
     * The description for the gateway target.
     */
    description?: string;
    /**
     * The gateway ID for the gateway target.
     */
    gatewayIdentifier?: string;
    /**
     * The name for the gateway target.
     */
    name: string;
    /**
     * The target configuration for the Smithy model target.
     */
    targetConfiguration: cdk.IResolvable | CfnGatewayTarget.TargetConfigurationProperty;
    /**
     * @param scope Scope in which this resource is defined
     * @param id Construct identifier for this resource (unique in its scope)
     * @param props Resource properties
     */
    constructor(scope: constructs.Construct, id: string, props: CfnGatewayTargetProps);
    get gatewayTargetRef(): GatewayTargetReference;
    protected get cfnProperties(): Record<string, any>;
    /**
     * Examines the CloudFormation resource and discloses attributes
     *
     * @param inspector tree inspector to collect and process attributes
     */
    inspect(inspector: cdk.TreeInspector): void;
    protected renderProperties(props: Record<string, any>): Record<string, any>;
}
export declare namespace CfnGatewayTarget {
    /**
     * The credential provider configuration for the gateway target.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-credentialproviderconfiguration.html
     */
    interface CredentialProviderConfigurationProperty {
        /**
         * The credential provider for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-credentialproviderconfiguration.html#cfn-bedrockagentcore-gatewaytarget-credentialproviderconfiguration-credentialprovider
         */
        readonly credentialProvider?: CfnGatewayTarget.CredentialProviderProperty | cdk.IResolvable;
        /**
         * The credential provider type for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-credentialproviderconfiguration.html#cfn-bedrockagentcore-gatewaytarget-credentialproviderconfiguration-credentialprovidertype
         */
        readonly credentialProviderType: string;
    }
    /**
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-credentialprovider.html
     */
    interface CredentialProviderProperty {
        /**
         * The API key credential provider.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-credentialprovider.html#cfn-bedrockagentcore-gatewaytarget-credentialprovider-apikeycredentialprovider
         */
        readonly apiKeyCredentialProvider?: CfnGatewayTarget.ApiKeyCredentialProviderProperty | cdk.IResolvable;
        /**
         * The OAuth credential provider for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-credentialprovider.html#cfn-bedrockagentcore-gatewaytarget-credentialprovider-oauthcredentialprovider
         */
        readonly oauthCredentialProvider?: cdk.IResolvable | CfnGatewayTarget.OAuthCredentialProviderProperty;
    }
    /**
     * The OAuth credential provider for the gateway target.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-oauthcredentialprovider.html
     */
    interface OAuthCredentialProviderProperty {
        /**
         * The OAuth credential provider.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-oauthcredentialprovider.html#cfn-bedrockagentcore-gatewaytarget-oauthcredentialprovider-customparameters
         */
        readonly customParameters?: cdk.IResolvable | Record<string, string>;
        /**
         * The provider ARN for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-oauthcredentialprovider.html#cfn-bedrockagentcore-gatewaytarget-oauthcredentialprovider-providerarn
         */
        readonly providerArn: string;
        /**
         * The OAuth credential provider scopes.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-oauthcredentialprovider.html#cfn-bedrockagentcore-gatewaytarget-oauthcredentialprovider-scopes
         */
        readonly scopes: Array<string>;
    }
    /**
     * The API key credential provider for the gateway target.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-apikeycredentialprovider.html
     */
    interface ApiKeyCredentialProviderProperty {
        /**
         * The credential location for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-apikeycredentialprovider.html#cfn-bedrockagentcore-gatewaytarget-apikeycredentialprovider-credentiallocation
         */
        readonly credentialLocation?: string;
        /**
         * The credential parameter name for the provider for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-apikeycredentialprovider.html#cfn-bedrockagentcore-gatewaytarget-apikeycredentialprovider-credentialparametername
         */
        readonly credentialParameterName?: string;
        /**
         * The API key credential provider for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-apikeycredentialprovider.html#cfn-bedrockagentcore-gatewaytarget-apikeycredentialprovider-credentialprefix
         */
        readonly credentialPrefix?: string;
        /**
         * The provider ARN for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-apikeycredentialprovider.html#cfn-bedrockagentcore-gatewaytarget-apikeycredentialprovider-providerarn
         */
        readonly providerArn: string;
    }
    /**
     * The target configuration.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-targetconfiguration.html
     */
    interface TargetConfigurationProperty {
        /**
         * The target configuration definition for MCP.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-targetconfiguration.html#cfn-bedrockagentcore-gatewaytarget-targetconfiguration-mcp
         */
        readonly mcp: cdk.IResolvable | CfnGatewayTarget.McpTargetConfigurationProperty;
    }
    /**
     * The MCP target configuration for the gateway target.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-mcptargetconfiguration.html
     */
    interface McpTargetConfigurationProperty {
        /**
         * The Lambda MCP configuration for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-mcptargetconfiguration.html#cfn-bedrockagentcore-gatewaytarget-mcptargetconfiguration-lambda
         */
        readonly lambda?: cdk.IResolvable | CfnGatewayTarget.McpLambdaTargetConfigurationProperty;
        /**
         * The OpenApi schema for the gateway target MCP configuration.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-mcptargetconfiguration.html#cfn-bedrockagentcore-gatewaytarget-mcptargetconfiguration-openapischema
         */
        readonly openApiSchema?: CfnGatewayTarget.ApiSchemaConfigurationProperty | cdk.IResolvable;
        /**
         * The target configuration for the Smithy model target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-mcptargetconfiguration.html#cfn-bedrockagentcore-gatewaytarget-mcptargetconfiguration-smithymodel
         */
        readonly smithyModel?: CfnGatewayTarget.ApiSchemaConfigurationProperty | cdk.IResolvable;
    }
    /**
     * The API schema configuration for the gateway target.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-apischemaconfiguration.html
     */
    interface ApiSchemaConfigurationProperty {
        /**
         * The inline payload for the gateway.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-apischemaconfiguration.html#cfn-bedrockagentcore-gatewaytarget-apischemaconfiguration-inlinepayload
         */
        readonly inlinePayload?: string;
        /**
         * The API schema configuration.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-apischemaconfiguration.html#cfn-bedrockagentcore-gatewaytarget-apischemaconfiguration-s3
         */
        readonly s3?: cdk.IResolvable | CfnGatewayTarget.S3ConfigurationProperty;
    }
    /**
     * The S3 configuration for the gateway target.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-s3configuration.html
     */
    interface S3ConfigurationProperty {
        /**
         * The S3 configuration bucket owner account ID for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-s3configuration.html#cfn-bedrockagentcore-gatewaytarget-s3configuration-bucketowneraccountid
         */
        readonly bucketOwnerAccountId?: string;
        /**
         * The configuration URI for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-s3configuration.html#cfn-bedrockagentcore-gatewaytarget-s3configuration-uri
         */
        readonly uri?: string;
    }
    /**
     * The Lambda target configuration.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-mcplambdatargetconfiguration.html
     */
    interface McpLambdaTargetConfigurationProperty {
        /**
         * The ARN of the Lambda target configuration.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-mcplambdatargetconfiguration.html#cfn-bedrockagentcore-gatewaytarget-mcplambdatargetconfiguration-lambdaarn
         */
        readonly lambdaArn: string;
        /**
         * The tool schema configuration for the gateway target MCP configuration for Lambda.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-mcplambdatargetconfiguration.html#cfn-bedrockagentcore-gatewaytarget-mcplambdatargetconfiguration-toolschema
         */
        readonly toolSchema: cdk.IResolvable | CfnGatewayTarget.ToolSchemaProperty;
    }
    /**
     * The tool schema for the gateway target.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-toolschema.html
     */
    interface ToolSchemaProperty {
        /**
         * The inline payload for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-toolschema.html#cfn-bedrockagentcore-gatewaytarget-toolschema-inlinepayload
         */
        readonly inlinePayload?: Array<cdk.IResolvable | CfnGatewayTarget.ToolDefinitionProperty> | cdk.IResolvable;
        /**
         * The S3 tool schema for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-toolschema.html#cfn-bedrockagentcore-gatewaytarget-toolschema-s3
         */
        readonly s3?: cdk.IResolvable | CfnGatewayTarget.S3ConfigurationProperty;
    }
    /**
     * The tool definition for the gateway.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-tooldefinition.html
     */
    interface ToolDefinitionProperty {
        /**
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-tooldefinition.html#cfn-bedrockagentcore-gatewaytarget-tooldefinition-description
         */
        readonly description: string;
        /**
         * The input schema for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-tooldefinition.html#cfn-bedrockagentcore-gatewaytarget-tooldefinition-inputschema
         */
        readonly inputSchema: cdk.IResolvable | CfnGatewayTarget.SchemaDefinitionProperty;
        /**
         * The tool name.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-tooldefinition.html#cfn-bedrockagentcore-gatewaytarget-tooldefinition-name
         */
        readonly name: string;
        /**
         * The tool definition output schema for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-tooldefinition.html#cfn-bedrockagentcore-gatewaytarget-tooldefinition-outputschema
         */
        readonly outputSchema?: cdk.IResolvable | CfnGatewayTarget.SchemaDefinitionProperty;
    }
    /**
     * The schema definition for the gateway target.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-schemadefinition.html
     */
    interface SchemaDefinitionProperty {
        /**
         * The workload identity details for the gateway.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-schemadefinition.html#cfn-bedrockagentcore-gatewaytarget-schemadefinition-description
         */
        readonly description?: string;
        /**
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-schemadefinition.html#cfn-bedrockagentcore-gatewaytarget-schemadefinition-items
         */
        readonly items?: cdk.IResolvable | CfnGatewayTarget.SchemaDefinitionProperty;
        /**
         * The schema definition properties for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-schemadefinition.html#cfn-bedrockagentcore-gatewaytarget-schemadefinition-properties
         */
        readonly properties?: cdk.IResolvable | Record<string, cdk.IResolvable | CfnGatewayTarget.SchemaDefinitionProperty>;
        /**
         * The schema definition.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-schemadefinition.html#cfn-bedrockagentcore-gatewaytarget-schemadefinition-required
         */
        readonly required?: Array<string>;
        /**
         * The scheme definition type for the gateway target.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-gatewaytarget-schemadefinition.html#cfn-bedrockagentcore-gatewaytarget-schemadefinition-type
         */
        readonly type: string;
    }
}
/**
 * Properties for defining a `CfnGatewayTarget`
 *
 * @struct
 * @stability external
 * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gatewaytarget.html
 */
export interface CfnGatewayTargetProps {
    /**
     * The OAuth credential provider configuration.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gatewaytarget.html#cfn-bedrockagentcore-gatewaytarget-credentialproviderconfigurations
     */
    readonly credentialProviderConfigurations: Array<CfnGatewayTarget.CredentialProviderConfigurationProperty | cdk.IResolvable> | cdk.IResolvable;
    /**
     * The description for the gateway target.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gatewaytarget.html#cfn-bedrockagentcore-gatewaytarget-description
     */
    readonly description?: string;
    /**
     * The gateway ID for the gateway target.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gatewaytarget.html#cfn-bedrockagentcore-gatewaytarget-gatewayidentifier
     */
    readonly gatewayIdentifier?: string;
    /**
     * The name for the gateway target.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gatewaytarget.html#cfn-bedrockagentcore-gatewaytarget-name
     */
    readonly name: string;
    /**
     * The target configuration for the Smithy model target.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-gatewaytarget.html#cfn-bedrockagentcore-gatewaytarget-targetconfiguration
     */
    readonly targetConfiguration: cdk.IResolvable | CfnGatewayTarget.TargetConfigurationProperty;
}
/**
 * A reference to a GatewayTarget resource.
 *
 * @struct
 * @stability external
 */
export interface GatewayTargetReference {
    /**
     * The GatewayIdentifier of the GatewayTarget resource.
     */
    readonly gatewayIdentifier: string;
    /**
     * The TargetId of the GatewayTarget resource.
     */
    readonly targetId: string;
}
/**
 * Indicates that this resource can be referenced as a Memory.
 *
 * @stability experimental
 */
export interface IMemoryRef extends constructs.IConstruct, cdk.IEnvironmentAware {
    /**
     * A reference to a Memory resource.
     */
    readonly memoryRef: MemoryReference;
}
/**
 * Memory allows AI agents to maintain both immediate and long-term knowledge, enabling context-aware and personalized interactions.
 *
 * For more information about using Memory in Amazon Bedrock AgentCore, see [Host agent or tools with Amazon Bedrock AgentCore Memory](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-getting-started.html) .
 *
 * See the *Properties* section below for descriptions of both the required and optional properties.
 *
 * @cloudformationResource AWS::BedrockAgentCore::Memory
 * @stability external
 * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-memory.html
 */
export declare class CfnMemory extends cdk.CfnResource implements cdk.IInspectable, IMemoryRef, cdk.ITaggableV2 {
    /**
     * The CloudFormation resource type name for this resource class.
     */
    static readonly CFN_RESOURCE_TYPE_NAME: string;
    /**
     * Build a CfnMemory from CloudFormation properties
     *
     * A factory method that creates a new instance of this class from an object
     * containing the CloudFormation properties of this resource.
     * Used in the @aws-cdk/cloudformation-include module.
     *
     * @internal
     */
    static _fromCloudFormation(scope: constructs.Construct, id: string, resourceAttributes: any, options: cfn_parse.FromCloudFormationOptions): CfnMemory;
    /**
     * The timestamp when the memory record was created.
     *
     * @cloudformationAttribute CreatedAt
     */
    readonly attrCreatedAt: string;
    /**
     * @cloudformationAttribute FailureReason
     */
    readonly attrFailureReason: string;
    /**
     * ARN of the Memory resource
     *
     * @cloudformationAttribute MemoryArn
     */
    readonly attrMemoryArn: string;
    /**
     * The memory ID.
     *
     * @cloudformationAttribute MemoryId
     */
    readonly attrMemoryId: string;
    /**
     * The memory status.
     *
     * @cloudformationAttribute Status
     */
    readonly attrStatus: string;
    /**
     * @cloudformationAttribute UpdatedAt
     */
    readonly attrUpdatedAt: string;
    /**
     * Tag Manager which manages the tags for this resource
     */
    readonly cdkTagManager: cdk.TagManager;
    /**
     * Description of the Memory resource.
     */
    description?: string;
    /**
     * The memory encryption key Amazon Resource Name (ARN).
     */
    encryptionKeyArn?: string;
    /**
     * The event expiry configuration.
     */
    eventExpiryDuration: number;
    /**
     * The memory role ARN.
     */
    memoryExecutionRoleArn?: string;
    /**
     * The memory strategies.
     */
    memoryStrategies?: Array<cdk.IResolvable | CfnMemory.MemoryStrategyProperty> | cdk.IResolvable;
    /**
     * The memory name.
     */
    name: string;
    /**
     * The tags for the resources.
     */
    tags?: Record<string, string>;
    /**
     * @param scope Scope in which this resource is defined
     * @param id Construct identifier for this resource (unique in its scope)
     * @param props Resource properties
     */
    constructor(scope: constructs.Construct, id: string, props: CfnMemoryProps);
    get memoryRef(): MemoryReference;
    protected get cfnProperties(): Record<string, any>;
    /**
     * Examines the CloudFormation resource and discloses attributes
     *
     * @param inspector tree inspector to collect and process attributes
     */
    inspect(inspector: cdk.TreeInspector): void;
    protected renderProperties(props: Record<string, any>): Record<string, any>;
}
export declare namespace CfnMemory {
    /**
     * The memory strategy.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-memorystrategy.html
     */
    interface MemoryStrategyProperty {
        /**
         * The memory strategy.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-memorystrategy.html#cfn-bedrockagentcore-memory-memorystrategy-custommemorystrategy
         */
        readonly customMemoryStrategy?: CfnMemory.CustomMemoryStrategyProperty | cdk.IResolvable;
        /**
         * The memory strategy.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-memorystrategy.html#cfn-bedrockagentcore-memory-memorystrategy-semanticmemorystrategy
         */
        readonly semanticMemoryStrategy?: cdk.IResolvable | CfnMemory.SemanticMemoryStrategyProperty;
        /**
         * The memory strategy summary.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-memorystrategy.html#cfn-bedrockagentcore-memory-memorystrategy-summarymemorystrategy
         */
        readonly summaryMemoryStrategy?: cdk.IResolvable | CfnMemory.SummaryMemoryStrategyProperty;
        /**
         * The memory strategy.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-memorystrategy.html#cfn-bedrockagentcore-memory-memorystrategy-userpreferencememorystrategy
         */
        readonly userPreferenceMemoryStrategy?: cdk.IResolvable | CfnMemory.UserPreferenceMemoryStrategyProperty;
    }
    /**
     * The memory strategy.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticmemorystrategy.html
     */
    interface SemanticMemoryStrategyProperty {
        /**
         * Creation timestamp of the memory strategy.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticmemorystrategy.html#cfn-bedrockagentcore-memory-semanticmemorystrategy-createdat
         */
        readonly createdAt?: string;
        /**
         * The memory strategy description.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticmemorystrategy.html#cfn-bedrockagentcore-memory-semanticmemorystrategy-description
         */
        readonly description?: string;
        /**
         * The memory strategy name.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticmemorystrategy.html#cfn-bedrockagentcore-memory-semanticmemorystrategy-name
         */
        readonly name: string;
        /**
         * The memory strategy namespaces.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticmemorystrategy.html#cfn-bedrockagentcore-memory-semanticmemorystrategy-namespaces
         */
        readonly namespaces?: Array<string>;
        /**
         * Status of the memory strategy.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticmemorystrategy.html#cfn-bedrockagentcore-memory-semanticmemorystrategy-status
         */
        readonly status?: string;
        /**
         * The memory strategy ID.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticmemorystrategy.html#cfn-bedrockagentcore-memory-semanticmemorystrategy-strategyid
         */
        readonly strategyId?: string;
        /**
         * The memory strategy type.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticmemorystrategy.html#cfn-bedrockagentcore-memory-semanticmemorystrategy-type
         */
        readonly type?: string;
        /**
         * Last update timestamp of the memory strategy.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticmemorystrategy.html#cfn-bedrockagentcore-memory-semanticmemorystrategy-updatedat
         */
        readonly updatedAt?: string;
    }
    /**
     * The memory strategy.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-summarymemorystrategy.html
     */
    interface SummaryMemoryStrategyProperty {
        /**
         * Creation timestamp of the memory strategy.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-summarymemorystrategy.html#cfn-bedrockagentcore-memory-summarymemorystrategy-createdat
         */
        readonly createdAt?: string;
        /**
         * The memory strategy description.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-summarymemorystrategy.html#cfn-bedrockagentcore-memory-summarymemorystrategy-description
         */
        readonly description?: string;
        /**
         * The memory strategy name.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-summarymemorystrategy.html#cfn-bedrockagentcore-memory-summarymemorystrategy-name
         */
        readonly name: string;
        /**
         * The summary memory strategy.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-summarymemorystrategy.html#cfn-bedrockagentcore-memory-summarymemorystrategy-namespaces
         */
        readonly namespaces?: Array<string>;
        /**
         * The memory strategy status.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-summarymemorystrategy.html#cfn-bedrockagentcore-memory-summarymemorystrategy-status
         */
        readonly status?: string;
        /**
         * The memory strategy ID.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-summarymemorystrategy.html#cfn-bedrockagentcore-memory-summarymemorystrategy-strategyid
         */
        readonly strategyId?: string;
        /**
         * The memory strategy type.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-summarymemorystrategy.html#cfn-bedrockagentcore-memory-summarymemorystrategy-type
         */
        readonly type?: string;
        /**
         * The memory strategy update date and time.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-summarymemorystrategy.html#cfn-bedrockagentcore-memory-summarymemorystrategy-updatedat
         */
        readonly updatedAt?: string;
    }
    /**
     * The memory strategy.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferencememorystrategy.html
     */
    interface UserPreferenceMemoryStrategyProperty {
        /**
         * Creation timestamp of the memory strategy.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferencememorystrategy.html#cfn-bedrockagentcore-memory-userpreferencememorystrategy-createdat
         */
        readonly createdAt?: string;
        /**
         * The memory strategy description.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferencememorystrategy.html#cfn-bedrockagentcore-memory-userpreferencememorystrategy-description
         */
        readonly description?: string;
        /**
         * The memory strategy name.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferencememorystrategy.html#cfn-bedrockagentcore-memory-userpreferencememorystrategy-name
         */
        readonly name: string;
        /**
         * The memory namespaces.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferencememorystrategy.html#cfn-bedrockagentcore-memory-userpreferencememorystrategy-namespaces
         */
        readonly namespaces?: Array<string>;
        /**
         * The memory strategy status.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferencememorystrategy.html#cfn-bedrockagentcore-memory-userpreferencememorystrategy-status
         */
        readonly status?: string;
        /**
         * The memory strategy ID.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferencememorystrategy.html#cfn-bedrockagentcore-memory-userpreferencememorystrategy-strategyid
         */
        readonly strategyId?: string;
        /**
         * The memory strategy type.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferencememorystrategy.html#cfn-bedrockagentcore-memory-userpreferencememorystrategy-type
         */
        readonly type?: string;
        /**
         * The memory strategy update date and time.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferencememorystrategy.html#cfn-bedrockagentcore-memory-userpreferencememorystrategy-updatedat
         */
        readonly updatedAt?: string;
    }
    /**
     * The memory strategy.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-custommemorystrategy.html
     */
    interface CustomMemoryStrategyProperty {
        /**
         * The memory strategy configuration.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-custommemorystrategy.html#cfn-bedrockagentcore-memory-custommemorystrategy-configuration
         */
        readonly configuration?: CfnMemory.CustomConfigurationInputProperty | cdk.IResolvable;
        /**
         * Creation timestamp of the memory strategy.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-custommemorystrategy.html#cfn-bedrockagentcore-memory-custommemorystrategy-createdat
         */
        readonly createdAt?: string;
        /**
         * The memory strategy description.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-custommemorystrategy.html#cfn-bedrockagentcore-memory-custommemorystrategy-description
         */
        readonly description?: string;
        /**
         * The memory strategy name.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-custommemorystrategy.html#cfn-bedrockagentcore-memory-custommemorystrategy-name
         */
        readonly name: string;
        /**
         * The memory strategy namespaces.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-custommemorystrategy.html#cfn-bedrockagentcore-memory-custommemorystrategy-namespaces
         */
        readonly namespaces?: Array<string>;
        /**
         * The memory strategy status.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-custommemorystrategy.html#cfn-bedrockagentcore-memory-custommemorystrategy-status
         */
        readonly status?: string;
        /**
         * The memory strategy ID.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-custommemorystrategy.html#cfn-bedrockagentcore-memory-custommemorystrategy-strategyid
         */
        readonly strategyId?: string;
        /**
         * The memory strategy type.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-custommemorystrategy.html#cfn-bedrockagentcore-memory-custommemorystrategy-type
         */
        readonly type?: string;
        /**
         * The memory strategy update date and time.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-custommemorystrategy.html#cfn-bedrockagentcore-memory-custommemorystrategy-updatedat
         */
        readonly updatedAt?: string;
    }
    /**
     * The memory configuration input.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-customconfigurationinput.html
     */
    interface CustomConfigurationInputProperty {
        /**
         * The custom configuration input.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-customconfigurationinput.html#cfn-bedrockagentcore-memory-customconfigurationinput-selfmanagedconfiguration
         */
        readonly selfManagedConfiguration?: cdk.IResolvable | CfnMemory.SelfManagedConfigurationProperty;
        /**
         * The memory override configuration.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-customconfigurationinput.html#cfn-bedrockagentcore-memory-customconfigurationinput-semanticoverride
         */
        readonly semanticOverride?: cdk.IResolvable | CfnMemory.SemanticOverrideProperty;
        /**
         * The memory configuration override.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-customconfigurationinput.html#cfn-bedrockagentcore-memory-customconfigurationinput-summaryoverride
         */
        readonly summaryOverride?: cdk.IResolvable | CfnMemory.SummaryOverrideProperty;
        /**
         * The memory user preference override.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-customconfigurationinput.html#cfn-bedrockagentcore-memory-customconfigurationinput-userpreferenceoverride
         */
        readonly userPreferenceOverride?: cdk.IResolvable | CfnMemory.UserPreferenceOverrideProperty;
    }
    /**
     * The memory override.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticoverride.html
     */
    interface SemanticOverrideProperty {
        /**
         * The memory override consolidation.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticoverride.html#cfn-bedrockagentcore-memory-semanticoverride-consolidation
         */
        readonly consolidation?: cdk.IResolvable | CfnMemory.SemanticOverrideConsolidationConfigurationInputProperty;
        /**
         * The memory override extraction.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticoverride.html#cfn-bedrockagentcore-memory-semanticoverride-extraction
         */
        readonly extraction?: cdk.IResolvable | CfnMemory.SemanticOverrideExtractionConfigurationInputProperty;
    }
    /**
     * The memory override configuration.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticoverrideextractionconfigurationinput.html
     */
    interface SemanticOverrideExtractionConfigurationInputProperty {
        /**
         * The extraction configuration.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticoverrideextractionconfigurationinput.html#cfn-bedrockagentcore-memory-semanticoverrideextractionconfigurationinput-appendtoprompt
         */
        readonly appendToPrompt: string;
        /**
         * The memory override configuration model ID.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticoverrideextractionconfigurationinput.html#cfn-bedrockagentcore-memory-semanticoverrideextractionconfigurationinput-modelid
         */
        readonly modelId: string;
    }
    /**
     * The memory override configuration.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticoverrideconsolidationconfigurationinput.html
     */
    interface SemanticOverrideConsolidationConfigurationInputProperty {
        /**
         * The override configuration.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticoverrideconsolidationconfigurationinput.html#cfn-bedrockagentcore-memory-semanticoverrideconsolidationconfigurationinput-appendtoprompt
         */
        readonly appendToPrompt: string;
        /**
         * The memory override model ID.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-semanticoverrideconsolidationconfigurationinput.html#cfn-bedrockagentcore-memory-semanticoverrideconsolidationconfigurationinput-modelid
         */
        readonly modelId: string;
    }
    /**
     * The memory summary override.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-summaryoverride.html
     */
    interface SummaryOverrideProperty {
        /**
         * The memory override consolidation.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-summaryoverride.html#cfn-bedrockagentcore-memory-summaryoverride-consolidation
         */
        readonly consolidation?: cdk.IResolvable | CfnMemory.SummaryOverrideConsolidationConfigurationInputProperty;
    }
    /**
     * The consolidation configuration.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-summaryoverrideconsolidationconfigurationinput.html
     */
    interface SummaryOverrideConsolidationConfigurationInputProperty {
        /**
         * The memory override configuration.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-summaryoverrideconsolidationconfigurationinput.html#cfn-bedrockagentcore-memory-summaryoverrideconsolidationconfigurationinput-appendtoprompt
         */
        readonly appendToPrompt: string;
        /**
         * The memory override configuration model ID.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-summaryoverrideconsolidationconfigurationinput.html#cfn-bedrockagentcore-memory-summaryoverrideconsolidationconfigurationinput-modelid
         */
        readonly modelId: string;
    }
    /**
     * The memory user preference override.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferenceoverride.html
     */
    interface UserPreferenceOverrideProperty {
        /**
         * The memory override consolidation information.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferenceoverride.html#cfn-bedrockagentcore-memory-userpreferenceoverride-consolidation
         */
        readonly consolidation?: cdk.IResolvable | CfnMemory.UserPreferenceOverrideConsolidationConfigurationInputProperty;
        /**
         * The memory user preferences for extraction.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferenceoverride.html#cfn-bedrockagentcore-memory-userpreferenceoverride-extraction
         */
        readonly extraction?: cdk.IResolvable | CfnMemory.UserPreferenceOverrideExtractionConfigurationInputProperty;
    }
    /**
     * The memory override configuration.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferenceoverrideextractionconfigurationinput.html
     */
    interface UserPreferenceOverrideExtractionConfigurationInputProperty {
        /**
         * The extraction configuration.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferenceoverrideextractionconfigurationinput.html#cfn-bedrockagentcore-memory-userpreferenceoverrideextractionconfigurationinput-appendtoprompt
         */
        readonly appendToPrompt: string;
        /**
         * The memory override for the model ID.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferenceoverrideextractionconfigurationinput.html#cfn-bedrockagentcore-memory-userpreferenceoverrideextractionconfigurationinput-modelid
         */
        readonly modelId: string;
    }
    /**
     * The configuration input.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferenceoverrideconsolidationconfigurationinput.html
     */
    interface UserPreferenceOverrideConsolidationConfigurationInputProperty {
        /**
         * The memory configuration.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferenceoverrideconsolidationconfigurationinput.html#cfn-bedrockagentcore-memory-userpreferenceoverrideconsolidationconfigurationinput-appendtoprompt
         */
        readonly appendToPrompt: string;
        /**
         * The memory override configuration model ID.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-userpreferenceoverrideconsolidationconfigurationinput.html#cfn-bedrockagentcore-memory-userpreferenceoverrideconsolidationconfigurationinput-modelid
         */
        readonly modelId: string;
    }
    /**
     * The self managed configuration.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-selfmanagedconfiguration.html
     */
    interface SelfManagedConfigurationProperty {
        /**
         * The memory configuration for self managed.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-selfmanagedconfiguration.html#cfn-bedrockagentcore-memory-selfmanagedconfiguration-historicalcontextwindowsize
         */
        readonly historicalContextWindowSize?: number;
        /**
         * The self managed configuration.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-selfmanagedconfiguration.html#cfn-bedrockagentcore-memory-selfmanagedconfiguration-invocationconfiguration
         */
        readonly invocationConfiguration?: CfnMemory.InvocationConfigurationInputProperty | cdk.IResolvable;
        /**
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-selfmanagedconfiguration.html#cfn-bedrockagentcore-memory-selfmanagedconfiguration-triggerconditions
         */
        readonly triggerConditions?: Array<cdk.IResolvable | CfnMemory.TriggerConditionInputProperty> | cdk.IResolvable;
    }
    /**
     * The memory trigger condition input.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-triggerconditioninput.html
     */
    interface TriggerConditionInputProperty {
        /**
         * The memory trigger condition input for the message based trigger.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-triggerconditioninput.html#cfn-bedrockagentcore-memory-triggerconditioninput-messagebasedtrigger
         */
        readonly messageBasedTrigger?: cdk.IResolvable | CfnMemory.MessageBasedTriggerInputProperty;
        /**
         * The memory trigger condition input.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-triggerconditioninput.html#cfn-bedrockagentcore-memory-triggerconditioninput-timebasedtrigger
         */
        readonly timeBasedTrigger?: cdk.IResolvable | CfnMemory.TimeBasedTriggerInputProperty;
        /**
         * The trigger condition information for a token based trigger.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-triggerconditioninput.html#cfn-bedrockagentcore-memory-triggerconditioninput-tokenbasedtrigger
         */
        readonly tokenBasedTrigger?: cdk.IResolvable | CfnMemory.TokenBasedTriggerInputProperty;
    }
    /**
     * The message based trigger input.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-messagebasedtriggerinput.html
     */
    interface MessageBasedTriggerInputProperty {
        /**
         * The memory trigger condition input for the message based trigger message count.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-messagebasedtriggerinput.html#cfn-bedrockagentcore-memory-messagebasedtriggerinput-messagecount
         */
        readonly messageCount?: number;
    }
    /**
     * The token based trigger input.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-tokenbasedtriggerinput.html
     */
    interface TokenBasedTriggerInputProperty {
        /**
         * The token based trigger token count.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-tokenbasedtriggerinput.html#cfn-bedrockagentcore-memory-tokenbasedtriggerinput-tokencount
         */
        readonly tokenCount?: number;
    }
    /**
     * The memory trigger condition input for the time based trigger.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-timebasedtriggerinput.html
     */
    interface TimeBasedTriggerInputProperty {
        /**
         * The memory trigger condition input for the session timeout.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-timebasedtriggerinput.html#cfn-bedrockagentcore-memory-timebasedtriggerinput-idlesessiontimeout
         */
        readonly idleSessionTimeout?: number;
    }
    /**
     * The memory invocation configuration input.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-invocationconfigurationinput.html
     */
    interface InvocationConfigurationInputProperty {
        /**
         * The message invocation configuration information for the bucket name.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-invocationconfigurationinput.html#cfn-bedrockagentcore-memory-invocationconfigurationinput-payloaddeliverybucketname
         */
        readonly payloadDeliveryBucketName?: string;
        /**
         * The memory trigger condition topic Amazon Resource Name (ARN).
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-memory-invocationconfigurationinput.html#cfn-bedrockagentcore-memory-invocationconfigurationinput-topicarn
         */
        readonly topicArn?: string;
    }
}
/**
 * Properties for defining a `CfnMemory`
 *
 * @struct
 * @stability external
 * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-memory.html
 */
export interface CfnMemoryProps {
    /**
     * Description of the Memory resource.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-memory.html#cfn-bedrockagentcore-memory-description
     */
    readonly description?: string;
    /**
     * The memory encryption key Amazon Resource Name (ARN).
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-memory.html#cfn-bedrockagentcore-memory-encryptionkeyarn
     */
    readonly encryptionKeyArn?: string;
    /**
     * The event expiry configuration.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-memory.html#cfn-bedrockagentcore-memory-eventexpiryduration
     */
    readonly eventExpiryDuration: number;
    /**
     * The memory role ARN.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-memory.html#cfn-bedrockagentcore-memory-memoryexecutionrolearn
     */
    readonly memoryExecutionRoleArn?: string;
    /**
     * The memory strategies.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-memory.html#cfn-bedrockagentcore-memory-memorystrategies
     */
    readonly memoryStrategies?: Array<cdk.IResolvable | CfnMemory.MemoryStrategyProperty> | cdk.IResolvable;
    /**
     * The memory name.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-memory.html#cfn-bedrockagentcore-memory-name
     */
    readonly name: string;
    /**
     * The tags for the resources.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-memory.html#cfn-bedrockagentcore-memory-tags
     */
    readonly tags?: Record<string, string>;
}
/**
 * A reference to a Memory resource.
 *
 * @struct
 * @stability external
 */
export interface MemoryReference {
    /**
     * The MemoryArn of the Memory resource.
     */
    readonly memoryArn: string;
}
/**
 * Indicates that this resource can be referenced as a Runtime.
 *
 * @stability experimental
 */
export interface IRuntimeRef extends constructs.IConstruct, cdk.IEnvironmentAware {
    /**
     * A reference to a Runtime resource.
     */
    readonly runtimeRef: RuntimeReference;
}
/**
 * Contains information about an agent runtime. An agent runtime is the execution environment for a Amazon Bedrock Agent.
 *
 * AgentCore Runtime is a secure, serverless runtime purpose-built for deploying and scaling dynamic AI agents and tools using any open-source framework including LangGraph, CrewAI, and Strands Agents, any protocol, and any model.
 *
 * For more information about using agent runtime in Amazon Bedrock AgentCore, see [Host agent or tools with Amazon Bedrock AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agents-tools-runtime.html) .
 *
 * See the *Properties* section below for descriptions of both the required and optional properties.
 *
 * @cloudformationResource AWS::BedrockAgentCore::Runtime
 * @stability external
 * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtime.html
 */
export declare class CfnRuntime extends cdk.CfnResource implements cdk.IInspectable, IRuntimeRef, cdk.ITaggableV2 {
    /**
     * The CloudFormation resource type name for this resource class.
     */
    static readonly CFN_RESOURCE_TYPE_NAME: string;
    /**
     * Build a CfnRuntime from CloudFormation properties
     *
     * A factory method that creates a new instance of this class from an object
     * containing the CloudFormation properties of this resource.
     * Used in the @aws-cdk/cloudformation-include module.
     *
     * @internal
     */
    static _fromCloudFormation(scope: constructs.Construct, id: string, resourceAttributes: any, options: cfn_parse.FromCloudFormationOptions): CfnRuntime;
    /**
     * The agent runtime ARN.
     *
     * @cloudformationAttribute AgentRuntimeArn
     */
    readonly attrAgentRuntimeArn: string;
    /**
     * The ID for the agent runtime.
     *
     * @cloudformationAttribute AgentRuntimeId
     */
    readonly attrAgentRuntimeId: string;
    /**
     * The version for the agent runtime.
     *
     * @cloudformationAttribute AgentRuntimeVersion
     */
    readonly attrAgentRuntimeVersion: string;
    /**
     * The time at which the runtime was created.
     *
     * @cloudformationAttribute CreatedAt
     */
    readonly attrCreatedAt: string;
    /**
     * The time at which the runtime was last updated.
     *
     * @cloudformationAttribute LastUpdatedAt
     */
    readonly attrLastUpdatedAt: string;
    /**
     * The status for the agent runtime.
     *
     * @cloudformationAttribute Status
     */
    readonly attrStatus: string;
    /**
     * Configuration for workload identity
     *
     * @cloudformationAttribute WorkloadIdentityDetails
     */
    readonly attrWorkloadIdentityDetails: cdk.IResolvable;
    /**
     * The artifact of the agent.
     */
    agentRuntimeArtifact: CfnRuntime.AgentRuntimeArtifactProperty | cdk.IResolvable;
    /**
     * The name of the AgentCore Runtime endpoint.
     */
    agentRuntimeName: string;
    /**
     * Represents inbound authorization configuration options used to authenticate incoming requests.
     */
    authorizerConfiguration?: CfnRuntime.AuthorizerConfigurationProperty | cdk.IResolvable;
    /**
     * Tag Manager which manages the tags for this resource
     */
    readonly cdkTagManager: cdk.TagManager;
    /**
     * The agent runtime description.
     */
    description?: string;
    /**
     * The environment variables for the agent.
     */
    environmentVariables?: cdk.IResolvable | Record<string, string>;
    /**
     * The network configuration.
     */
    networkConfiguration: cdk.IResolvable | CfnRuntime.NetworkConfigurationProperty;
    /**
     * The protocol configuration for an agent runtime.
     */
    protocolConfiguration?: string;
    /**
     * The Amazon Resource Name (ARN) for for the role.
     */
    roleArn: string;
    /**
     * The tags for the agent.
     */
    tags?: Record<string, string>;
    /**
     * @param scope Scope in which this resource is defined
     * @param id Construct identifier for this resource (unique in its scope)
     * @param props Resource properties
     */
    constructor(scope: constructs.Construct, id: string, props: CfnRuntimeProps);
    get runtimeRef(): RuntimeReference;
    protected get cfnProperties(): Record<string, any>;
    /**
     * Examines the CloudFormation resource and discloses attributes
     *
     * @param inspector tree inspector to collect and process attributes
     */
    inspect(inspector: cdk.TreeInspector): void;
    protected renderProperties(props: Record<string, any>): Record<string, any>;
}
export declare namespace CfnRuntime {
    /**
     * The artifact of the agent.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-agentruntimeartifact.html
     */
    interface AgentRuntimeArtifactProperty {
        /**
         * Representation of a container configuration.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-agentruntimeartifact.html#cfn-bedrockagentcore-runtime-agentruntimeartifact-containerconfiguration
         */
        readonly containerConfiguration?: CfnRuntime.ContainerConfigurationProperty | cdk.IResolvable;
    }
    /**
     * The container configuration.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-containerconfiguration.html
     */
    interface ContainerConfigurationProperty {
        /**
         * The container Uri.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-containerconfiguration.html#cfn-bedrockagentcore-runtime-containerconfiguration-containeruri
         */
        readonly containerUri: string;
    }
    /**
     * The network configuration for the agent.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-networkconfiguration.html
     */
    interface NetworkConfigurationProperty {
        /**
         * The network mode.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-networkconfiguration.html#cfn-bedrockagentcore-runtime-networkconfiguration-networkmode
         */
        readonly networkMode: string;
        /**
         * Network mode configuration for VPC.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-networkconfiguration.html#cfn-bedrockagentcore-runtime-networkconfiguration-networkmodeconfig
         */
        readonly networkModeConfig?: cdk.IResolvable | CfnRuntime.VpcConfigProperty;
    }
    /**
     * Network mode configuration for VPC.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-vpcconfig.html
     */
    interface VpcConfigProperty {
        /**
         * Security groups for VPC.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-vpcconfig.html#cfn-bedrockagentcore-runtime-vpcconfig-securitygroups
         */
        readonly securityGroups: Array<string>;
        /**
         * Subnets for VPC.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-vpcconfig.html#cfn-bedrockagentcore-runtime-vpcconfig-subnets
         */
        readonly subnets: Array<string>;
    }
    /**
     * The authorizer configuration.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-authorizerconfiguration.html
     */
    interface AuthorizerConfigurationProperty {
        /**
         * Represents inbound authorization configuration options used to authenticate incoming requests.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-authorizerconfiguration.html#cfn-bedrockagentcore-runtime-authorizerconfiguration-customjwtauthorizer
         */
        readonly customJwtAuthorizer?: CfnRuntime.CustomJWTAuthorizerConfigurationProperty | cdk.IResolvable;
    }
    /**
     * Configuration for custom JWT authorizer.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-customjwtauthorizerconfiguration.html
     */
    interface CustomJWTAuthorizerConfigurationProperty {
        /**
         * Represents inbound authorization configuration options used to authenticate incoming requests.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-customjwtauthorizerconfiguration.html#cfn-bedrockagentcore-runtime-customjwtauthorizerconfiguration-allowedaudience
         */
        readonly allowedAudience?: Array<string>;
        /**
         * Represents individual client IDs that are validated in the incoming JWT token validation process.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-customjwtauthorizerconfiguration.html#cfn-bedrockagentcore-runtime-customjwtauthorizerconfiguration-allowedclients
         */
        readonly allowedClients?: Array<string>;
        /**
         * The configuration authorization.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-customjwtauthorizerconfiguration.html#cfn-bedrockagentcore-runtime-customjwtauthorizerconfiguration-discoveryurl
         */
        readonly discoveryUrl: string;
    }
    /**
     * The workload identity details for the agent.
     *
     * @struct
     * @stability external
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-workloadidentitydetails.html
     */
    interface WorkloadIdentityDetailsProperty {
        /**
         * The Amazon Resource Name (ARN) for the workload identity.
         *
         * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-bedrockagentcore-runtime-workloadidentitydetails.html#cfn-bedrockagentcore-runtime-workloadidentitydetails-workloadidentityarn
         */
        readonly workloadIdentityArn: string;
    }
}
/**
 * Properties for defining a `CfnRuntime`
 *
 * @struct
 * @stability external
 * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtime.html
 */
export interface CfnRuntimeProps {
    /**
     * The artifact of the agent.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtime.html#cfn-bedrockagentcore-runtime-agentruntimeartifact
     */
    readonly agentRuntimeArtifact: CfnRuntime.AgentRuntimeArtifactProperty | cdk.IResolvable;
    /**
     * The name of the AgentCore Runtime endpoint.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtime.html#cfn-bedrockagentcore-runtime-agentruntimename
     */
    readonly agentRuntimeName: string;
    /**
     * Represents inbound authorization configuration options used to authenticate incoming requests.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtime.html#cfn-bedrockagentcore-runtime-authorizerconfiguration
     */
    readonly authorizerConfiguration?: CfnRuntime.AuthorizerConfigurationProperty | cdk.IResolvable;
    /**
     * The agent runtime description.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtime.html#cfn-bedrockagentcore-runtime-description
     */
    readonly description?: string;
    /**
     * The environment variables for the agent.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtime.html#cfn-bedrockagentcore-runtime-environmentvariables
     */
    readonly environmentVariables?: cdk.IResolvable | Record<string, string>;
    /**
     * The network configuration.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtime.html#cfn-bedrockagentcore-runtime-networkconfiguration
     */
    readonly networkConfiguration: cdk.IResolvable | CfnRuntime.NetworkConfigurationProperty;
    /**
     * The protocol configuration for an agent runtime.
     *
     * This structure defines how the agent runtime communicates with clients.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtime.html#cfn-bedrockagentcore-runtime-protocolconfiguration
     */
    readonly protocolConfiguration?: string;
    /**
     * The Amazon Resource Name (ARN) for for the role.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtime.html#cfn-bedrockagentcore-runtime-rolearn
     */
    readonly roleArn: string;
    /**
     * The tags for the agent.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtime.html#cfn-bedrockagentcore-runtime-tags
     */
    readonly tags?: Record<string, string>;
}
/**
 * A reference to a Runtime resource.
 *
 * @struct
 * @stability external
 */
export interface RuntimeReference {
    /**
     * The AgentRuntimeId of the Runtime resource.
     */
    readonly agentRuntimeId: string;
}
/**
 * Indicates that this resource can be referenced as a RuntimeEndpoint.
 *
 * @stability experimental
 */
export interface IRuntimeEndpointRef extends constructs.IConstruct, cdk.IEnvironmentAware {
    /**
     * A reference to a RuntimeEndpoint resource.
     */
    readonly runtimeEndpointRef: RuntimeEndpointReference;
}
/**
 * AgentCore Runtime is a secure, serverless runtime purpose-built for deploying and scaling dynamic AI agents and tools using any open-source framework including LangGraph, CrewAI, and Strands Agents, any protocol, and any model.
 *
 * For more information about using agent runtime endpoints in Amazon Bedrock AgentCore, see [AgentCore Runtime versioning and endpoints](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agent-runtime-versioning.html) .
 *
 * See the *Properties* section below for descriptions of both the required and optional properties.
 *
 * @cloudformationResource AWS::BedrockAgentCore::RuntimeEndpoint
 * @stability external
 * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtimeendpoint.html
 */
export declare class CfnRuntimeEndpoint extends cdk.CfnResource implements cdk.IInspectable, IRuntimeEndpointRef, cdk.ITaggableV2 {
    /**
     * The CloudFormation resource type name for this resource class.
     */
    static readonly CFN_RESOURCE_TYPE_NAME: string;
    /**
     * Build a CfnRuntimeEndpoint from CloudFormation properties
     *
     * A factory method that creates a new instance of this class from an object
     * containing the CloudFormation properties of this resource.
     * Used in the @aws-cdk/cloudformation-include module.
     *
     * @internal
     */
    static _fromCloudFormation(scope: constructs.Construct, id: string, resourceAttributes: any, options: cfn_parse.FromCloudFormationOptions): CfnRuntimeEndpoint;
    /**
     * The Amazon Resource Name (ARN) of the runtime agent.
     *
     * @cloudformationAttribute AgentRuntimeArn
     */
    readonly attrAgentRuntimeArn: string;
    /**
     * The endpoint Amazon Resource Name (ARN).
     *
     * @cloudformationAttribute AgentRuntimeEndpointArn
     */
    readonly attrAgentRuntimeEndpointArn: string;
    /**
     * The time at which the endpoint was created.
     *
     * @cloudformationAttribute CreatedAt
     */
    readonly attrCreatedAt: string;
    /**
     * The reason for failure if the memory is in a failed state.
     *
     * @cloudformationAttribute FailureReason
     */
    readonly attrFailureReason: string;
    /**
     * The ID of the runtime endpoint.
     *
     * @cloudformationAttribute Id
     */
    readonly attrId: string;
    /**
     * The time at which the endpoint was last updated.
     *
     * @cloudformationAttribute LastUpdatedAt
     */
    readonly attrLastUpdatedAt: string;
    /**
     * The live version for the runtime endpoint.
     *
     * @cloudformationAttribute LiveVersion
     */
    readonly attrLiveVersion: string;
    /**
     * The status of the runtime endpoint.
     *
     * @cloudformationAttribute Status
     */
    readonly attrStatus: string;
    /**
     * The target version.
     *
     * @cloudformationAttribute TargetVersion
     */
    readonly attrTargetVersion: string;
    /**
     * The agent runtime ID.
     */
    agentRuntimeId: string;
    /**
     * The version of the agent.
     */
    agentRuntimeVersion?: string;
    /**
     * Tag Manager which manages the tags for this resource
     */
    readonly cdkTagManager: cdk.TagManager;
    /**
     * Contains information about an agent runtime endpoint.
     */
    description?: string;
    /**
     * The name of the AgentCore Runtime endpoint.
     */
    name: string;
    /**
     * The tags for the AgentCore Runtime endpoint.
     */
    tags?: Record<string, string>;
    /**
     * @param scope Scope in which this resource is defined
     * @param id Construct identifier for this resource (unique in its scope)
     * @param props Resource properties
     */
    constructor(scope: constructs.Construct, id: string, props: CfnRuntimeEndpointProps);
    get runtimeEndpointRef(): RuntimeEndpointReference;
    protected get cfnProperties(): Record<string, any>;
    /**
     * Examines the CloudFormation resource and discloses attributes
     *
     * @param inspector tree inspector to collect and process attributes
     */
    inspect(inspector: cdk.TreeInspector): void;
    protected renderProperties(props: Record<string, any>): Record<string, any>;
}
/**
 * Properties for defining a `CfnRuntimeEndpoint`
 *
 * @struct
 * @stability external
 * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtimeendpoint.html
 */
export interface CfnRuntimeEndpointProps {
    /**
     * The agent runtime ID.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtimeendpoint.html#cfn-bedrockagentcore-runtimeendpoint-agentruntimeid
     */
    readonly agentRuntimeId: string;
    /**
     * The version of the agent.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtimeendpoint.html#cfn-bedrockagentcore-runtimeendpoint-agentruntimeversion
     */
    readonly agentRuntimeVersion?: string;
    /**
     * Contains information about an agent runtime endpoint.
     *
     * An agent runtime is the execution environment for a Amazon Bedrock Agent.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtimeendpoint.html#cfn-bedrockagentcore-runtimeendpoint-description
     */
    readonly description?: string;
    /**
     * The name of the AgentCore Runtime endpoint.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtimeendpoint.html#cfn-bedrockagentcore-runtimeendpoint-name
     */
    readonly name: string;
    /**
     * The tags for the AgentCore Runtime endpoint.
     *
     * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtimeendpoint.html#cfn-bedrockagentcore-runtimeendpoint-tags
     */
    readonly tags?: Record<string, string>;
}
/**
 * A reference to a RuntimeEndpoint resource.
 *
 * @struct
 * @stability external
 */
export interface RuntimeEndpointReference {
    /**
     * The AgentRuntimeEndpointArn of the RuntimeEndpoint resource.
     */
    readonly agentRuntimeEndpointArn: string;
}
