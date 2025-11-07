"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CdkToolkit = exports.AssetBuildTime = void 0;
exports.displayFlagsMessage = displayFlagsMessage;
const path = require("path");
const util_1 = require("util");
const cloud_assembly_schema_1 = require("@aws-cdk/cloud-assembly-schema");
const cxapi = require("@aws-cdk/cx-api");
const toolkit_lib_1 = require("@aws-cdk/toolkit-lib");
const chalk = require("chalk");
const chokidar = require("chokidar");
const fs = require("fs-extra");
const uuid = require("uuid");
const io_host_1 = require("./io-host");
const user_configuration_1 = require("./user-configuration");
const api_private_1 = require("../../lib/api-private");
const api_1 = require("../api");
const bootstrap_1 = require("../api/bootstrap");
const cloud_assembly_1 = require("../api/cloud-assembly");
const refactor_1 = require("../api/refactor");
const deploy_1 = require("../commands/deploy");
const list_stacks_1 = require("../commands/list-stacks");
const migrate_1 = require("../commands/migrate");
const cxapp_1 = require("../cxapp");
const obsolete_flags_1 = require("../obsolete-flags");
const util_2 = require("../util");
const collect_telemetry_1 = require("./telemetry/collect-telemetry");
const error_1 = require("./telemetry/error");
const messages_1 = require("./telemetry/messages");
// Must use a require() otherwise esbuild complains about calling a namespace
// eslint-disable-next-line @typescript-eslint/no-require-imports,@typescript-eslint/consistent-type-imports
const pLimit = require('p-limit');
/**
 * When to build assets
 */
var AssetBuildTime;
(function (AssetBuildTime) {
    /**
     * Build all assets before deploying the first stack
     *
     * This is intended for expensive Docker image builds; so that if the Docker image build
     * fails, no stacks are unnecessarily deployed (with the attendant wait time).
     */
    AssetBuildTime["ALL_BEFORE_DEPLOY"] = "all-before-deploy";
    /**
     * Build assets just-in-time, before publishing
     */
    AssetBuildTime["JUST_IN_TIME"] = "just-in-time";
})(AssetBuildTime || (exports.AssetBuildTime = AssetBuildTime = {}));
/**
 * Custom implementation of the public Toolkit to integrate with the legacy CdkToolkit
 *
 * This overwrites how an sdkProvider is acquired
 * in favor of the one provided directly to CdkToolkit.
 */
class InternalToolkit extends toolkit_lib_1.Toolkit {
    constructor(sdkProvider, options) {
        super(options);
        this._sdkProvider = sdkProvider;
    }
    /**
     * Access to the AWS SDK
     * @internal
     */
    async sdkProvider(_action) {
        return this._sdkProvider;
    }
}
/**
 * Toolkit logic
 *
 * The toolkit runs the `cloudExecutable` to obtain a cloud assembly and
 * deploys applies them to `cloudFormation`.
 */
class CdkToolkit {
    constructor(props) {
        this.props = props;
        this.ioHost = props.ioHost ?? io_host_1.CliIoHost.instance();
        this.toolkitStackName = props.toolkitStackName ?? api_1.DEFAULT_TOOLKIT_STACK_NAME;
        this.toolkit = new InternalToolkit(props.sdkProvider, {
            assemblyFailureAt: this.validateMetadataFailAt(),
            color: true,
            emojis: true,
            ioHost: this.ioHost,
            toolkitStackName: this.toolkitStackName,
            unstableFeatures: ['refactor', 'flags'],
        });
    }
    async metadata(stackName, json) {
        const stacks = await this.selectSingleStackByName(stackName);
        await printSerializedObject(this.ioHost.asIoHelper(), stacks.firstStack.manifest.metadata ?? {}, json);
    }
    async acknowledge(noticeId) {
        const acks = new Set(this.props.configuration.context.get('acknowledged-issue-numbers') ?? []);
        acks.add(Number(noticeId));
        this.props.configuration.context.set('acknowledged-issue-numbers', Array.from(acks));
        await this.props.configuration.saveContext();
    }
    async cliTelemetryStatus(versionReporting = true) {
        // recreate the version-reporting property in args rather than bring the entire args object over
        const args = { ['version-reporting']: versionReporting };
        const canCollect = (0, collect_telemetry_1.canCollectTelemetry)(args, this.props.configuration.context);
        if (canCollect) {
            await this.ioHost.asIoHelper().defaults.info('CLI Telemetry is enabled. See https://github.com/aws/aws-cdk-cli/tree/main/packages/aws-cdk#cdk-cli-telemetry for ways to disable.');
        }
        else {
            await this.ioHost.asIoHelper().defaults.info('CLI Telemetry is disabled. See https://github.com/aws/aws-cdk-cli/tree/main/packages/aws-cdk#cdk-cli-telemetry for ways to enable.');
        }
    }
    async cliTelemetry(enable) {
        this.props.configuration.context.set('cli-telemetry', enable);
        await this.props.configuration.saveContext();
        await this.ioHost.asIoHelper().defaults.info(`Telemetry ${enable ? 'enabled' : 'disabled'}`);
    }
    async diff(options) {
        const stacks = await this.selectStacksForDiff(options.stackNames, options.exclusively);
        const strict = !!options.strict;
        const contextLines = options.contextLines || 3;
        const quiet = options.quiet || false;
        let diffs = 0;
        const parameterMap = buildParameterMap(options.parameters);
        if (options.templatePath !== undefined) {
            // Compare single stack against fixed template
            if (stacks.stackCount !== 1) {
                throw new toolkit_lib_1.ToolkitError('Can only select one stack when comparing to fixed template. Use --exclusively to avoid selecting multiple stacks.');
            }
            if (!(await fs.pathExists(options.templatePath))) {
                throw new toolkit_lib_1.ToolkitError(`There is no file at ${options.templatePath}`);
            }
            if (options.importExistingResources) {
                throw new toolkit_lib_1.ToolkitError('Can only use --import-existing-resources flag when comparing against deployed stacks.');
            }
            const template = (0, util_2.deserializeStructure)(await fs.readFile(options.templatePath, { encoding: 'UTF-8' }));
            const formatter = new api_1.DiffFormatter({
                templateInfo: {
                    oldTemplate: template,
                    newTemplate: stacks.firstStack,
                },
            });
            if (options.securityOnly) {
                const securityDiff = formatter.formatSecurityDiff();
                // Warn, count, and display the diff only if the reported changes are broadening permissions
                if (securityDiff.permissionChangeType === toolkit_lib_1.PermissionChangeType.BROADENING) {
                    await this.ioHost.asIoHelper().defaults.warn('This deployment will make potentially sensitive changes according to your current security approval level.\nPlease confirm you intend to make the following modifications:\n');
                    await this.ioHost.asIoHelper().defaults.info(securityDiff.formattedDiff);
                    diffs += 1;
                }
            }
            else {
                const diff = formatter.formatStackDiff({
                    strict,
                    contextLines,
                    quiet,
                });
                diffs = diff.numStacksWithChanges;
                await this.ioHost.asIoHelper().defaults.info(diff.formattedDiff);
            }
        }
        else {
            const allMappings = options.includeMoves
                ? await (0, refactor_1.mappingsByEnvironment)(stacks.stackArtifacts, this.props.sdkProvider, true)
                : [];
            // Compare N stacks against deployed templates
            for (const stack of stacks.stackArtifacts) {
                const templateWithNestedStacks = await this.props.deployments.readCurrentTemplateWithNestedStacks(stack, options.compareAgainstProcessedTemplate);
                const currentTemplate = templateWithNestedStacks.deployedRootTemplate;
                const nestedStacks = templateWithNestedStacks.nestedStacks;
                const migrator = new api_1.ResourceMigrator({
                    deployments: this.props.deployments,
                    ioHelper: (0, api_private_1.asIoHelper)(this.ioHost, 'diff'),
                });
                const resourcesToImport = await migrator.tryGetResources(await this.props.deployments.resolveEnvironment(stack));
                if (resourcesToImport) {
                    (0, api_1.removeNonImportResources)(stack);
                }
                let changeSet = undefined;
                if (options.changeSet) {
                    let stackExists = false;
                    try {
                        stackExists = await this.props.deployments.stackExists({
                            stack,
                            deployName: stack.stackName,
                            tryLookupRole: true,
                        });
                    }
                    catch (e) {
                        await this.ioHost.asIoHelper().defaults.debug((0, util_2.formatErrorMessage)(e));
                        if (!quiet) {
                            await this.ioHost.asIoHelper().defaults.info(`Checking if the stack ${stack.stackName} exists before creating the changeset has failed, will base the diff on template differences (run again with -v to see the reason)\n`);
                        }
                        stackExists = false;
                    }
                    if (stackExists) {
                        changeSet = await api_private_1.cfnApi.createDiffChangeSet((0, api_private_1.asIoHelper)(this.ioHost, 'diff'), {
                            stack,
                            uuid: uuid.v4(),
                            deployments: this.props.deployments,
                            willExecute: false,
                            sdkProvider: this.props.sdkProvider,
                            parameters: Object.assign({}, parameterMap['*'], parameterMap[stack.stackName]),
                            resourcesToImport,
                            importExistingResources: options.importExistingResources,
                        });
                    }
                    else {
                        await this.ioHost.asIoHelper().defaults.debug(`the stack '${stack.stackName}' has not been deployed to CloudFormation or describeStacks call failed, skipping changeset creation.`);
                    }
                }
                const mappings = allMappings.find(m => m.environment.region === stack.environment.region && m.environment.account === stack.environment.account)?.mappings ?? {};
                const formatter = new api_1.DiffFormatter({
                    templateInfo: {
                        oldTemplate: currentTemplate,
                        newTemplate: stack,
                        changeSet,
                        isImport: !!resourcesToImport,
                        nestedStacks,
                        mappings,
                    },
                });
                if (options.securityOnly) {
                    const securityDiff = formatter.formatSecurityDiff();
                    // Warn, count, and display the diff only if the reported changes are broadening permissions
                    if (securityDiff.permissionChangeType === toolkit_lib_1.PermissionChangeType.BROADENING) {
                        await this.ioHost.asIoHelper().defaults.warn('This deployment will make potentially sensitive changes according to your current security approval level.\nPlease confirm you intend to make the following modifications:\n');
                        await this.ioHost.asIoHelper().defaults.info(securityDiff.formattedDiff);
                        diffs += 1;
                    }
                }
                else {
                    const diff = formatter.formatStackDiff({
                        strict,
                        contextLines,
                        quiet,
                    });
                    await this.ioHost.asIoHelper().defaults.info(diff.formattedDiff);
                    diffs += diff.numStacksWithChanges;
                }
            }
        }
        await this.ioHost.asIoHelper().defaults.info((0, util_1.format)('\n✨  Number of stacks with differences: %s\n', diffs));
        return diffs && options.fail ? 1 : 0;
    }
    async deploy(options) {
        if (options.watch) {
            return this.watch(options);
        }
        // set progress from options, this includes user and app config
        if (options.progress) {
            this.ioHost.stackProgress = options.progress;
        }
        const startSynthTime = new Date().getTime();
        const stackCollection = await this.selectStacksForDeploy(options.selector, options.exclusively, options.cacheCloudAssembly, options.ignoreNoStacks);
        const elapsedSynthTime = new Date().getTime() - startSynthTime;
        await this.ioHost.asIoHelper().defaults.info(`\n✨  Synthesis time: ${(0, util_2.formatTime)(elapsedSynthTime)}s\n`);
        if (stackCollection.stackCount === 0) {
            await this.ioHost.asIoHelper().defaults.error('This app contains no stacks');
            return;
        }
        const migrator = new api_1.ResourceMigrator({
            deployments: this.props.deployments,
            ioHelper: (0, api_private_1.asIoHelper)(this.ioHost, 'deploy'),
        });
        await migrator.tryMigrateResources(stackCollection, {
            toolkitStackName: this.toolkitStackName,
            ...options,
        });
        const requireApproval = options.requireApproval ?? cloud_assembly_schema_1.RequireApproval.BROADENING;
        const parameterMap = buildParameterMap(options.parameters);
        if (options.deploymentMethod?.method === 'hotswap') {
            await this.ioHost.asIoHelper().defaults.warn('⚠️ The --hotswap and --hotswap-fallback flags deliberately introduce CloudFormation drift to speed up deployments');
            await this.ioHost.asIoHelper().defaults.warn('⚠️ They should only be used for development - never use them for your production Stacks!\n');
        }
        const stacks = stackCollection.stackArtifacts;
        const stackOutputs = {};
        const outputsFile = options.outputsFile;
        const buildAsset = async (assetNode) => {
            await this.props.deployments.buildSingleAsset(assetNode.assetManifestArtifact, assetNode.assetManifest, assetNode.asset, {
                stack: assetNode.parentStack,
                roleArn: options.roleArn,
                stackName: assetNode.parentStack.stackName,
            });
        };
        const publishAsset = async (assetNode) => {
            await this.props.deployments.publishSingleAsset(assetNode.assetManifest, assetNode.asset, {
                stack: assetNode.parentStack,
                roleArn: options.roleArn,
                stackName: assetNode.parentStack.stackName,
                forcePublish: options.force,
            });
        };
        const deployStack = async (stackNode) => {
            const stack = stackNode.stack;
            if (stackCollection.stackCount !== 1) {
                await this.ioHost.asIoHelper().defaults.info(chalk.bold(stack.displayName));
            }
            if (!stack.environment) {
                // eslint-disable-next-line @stylistic/max-len
                throw new toolkit_lib_1.ToolkitError(`Stack ${stack.displayName} does not define an environment, and AWS credentials could not be obtained from standard locations or no region was configured.`);
            }
            if (Object.keys(stack.template.Resources || {}).length === 0) {
                // The generated stack has no resources
                if (!(await this.props.deployments.stackExists({ stack }))) {
                    await this.ioHost.asIoHelper().defaults.warn('%s: stack has no resources, skipping deployment.', chalk.bold(stack.displayName));
                }
                else {
                    await this.ioHost.asIoHelper().defaults.warn('%s: stack has no resources, deleting existing stack.', chalk.bold(stack.displayName));
                    await this.destroy({
                        selector: { patterns: [stack.hierarchicalId] },
                        exclusively: true,
                        force: true,
                        roleArn: options.roleArn,
                        fromDeploy: true,
                    });
                }
                return;
            }
            if (requireApproval !== cloud_assembly_schema_1.RequireApproval.NEVER) {
                const currentTemplate = await this.props.deployments.readCurrentTemplate(stack);
                const formatter = new api_1.DiffFormatter({
                    templateInfo: {
                        oldTemplate: currentTemplate,
                        newTemplate: stack,
                    },
                });
                const securityDiff = formatter.formatSecurityDiff();
                if (requiresApproval(requireApproval, securityDiff.permissionChangeType)) {
                    const motivation = '"--require-approval" is enabled and stack includes security-sensitive updates';
                    await this.ioHost.asIoHelper().defaults.info(securityDiff.formattedDiff);
                    await askUserConfirmation(this.ioHost, api_private_1.IO.CDK_TOOLKIT_I5060.req(`${motivation}: 'Do you wish to deploy these changes'`, {
                        motivation,
                        concurrency,
                        permissionChangeType: securityDiff.permissionChangeType,
                        templateDiffs: formatter.diffs,
                    }));
                }
            }
            // Following are the same semantics we apply with respect to Notification ARNs (dictated by the SDK)
            //
            //  - undefined  =>  cdk ignores it, as if it wasn't supported (allows external management).
            //  - []:        =>  cdk manages it, and the user wants to wipe it out.
            //  - ['arn-1']  =>  cdk manages it, and the user wants to set it to ['arn-1'].
            const notificationArns = (!!options.notificationArns || !!stack.notificationArns)
                ? (options.notificationArns ?? []).concat(stack.notificationArns ?? [])
                : undefined;
            for (const notificationArn of notificationArns ?? []) {
                if (!(0, util_2.validateSnsTopicArn)(notificationArn)) {
                    throw new toolkit_lib_1.ToolkitError(`Notification arn ${notificationArn} is not a valid arn for an SNS topic`);
                }
            }
            const stackIndex = stacks.indexOf(stack) + 1;
            await this.ioHost.asIoHelper().defaults.info(`${chalk.bold(stack.displayName)}: deploying... [${stackIndex}/${stackCollection.stackCount}]`);
            const startDeployTime = new Date().getTime();
            let tags = options.tags;
            if (!tags || tags.length === 0) {
                tags = (0, api_private_1.tagsForStack)(stack);
            }
            // There is already a startDeployTime constant, but that does not work with telemetry.
            // We should integrate the two in the future
            const deploySpan = await this.ioHost.asIoHelper().span(messages_1.CLI_PRIVATE_SPAN.DEPLOY).begin({});
            let error;
            let elapsedDeployTime = 0;
            try {
                let deployResult;
                let rollback = options.rollback;
                let iteration = 0;
                while (!deployResult) {
                    if (++iteration > 2) {
                        throw new toolkit_lib_1.ToolkitError('This loop should have stabilized in 2 iterations, but didn\'t. If you are seeing this error, please report it at https://github.com/aws/aws-cdk/issues/new/choose');
                    }
                    const r = await this.props.deployments.deployStack({
                        stack,
                        deployName: stack.stackName,
                        roleArn: options.roleArn,
                        toolkitStackName: options.toolkitStackName,
                        reuseAssets: options.reuseAssets,
                        notificationArns,
                        tags,
                        execute: options.execute,
                        changeSetName: options.changeSetName,
                        deploymentMethod: options.deploymentMethod,
                        forceDeployment: options.force,
                        parameters: Object.assign({}, parameterMap['*'], parameterMap[stack.stackName]),
                        usePreviousParameters: options.usePreviousParameters,
                        rollback,
                        extraUserAgent: options.extraUserAgent,
                        assetParallelism: options.assetParallelism,
                        ignoreNoStacks: options.ignoreNoStacks,
                    });
                    switch (r.type) {
                        case 'did-deploy-stack':
                            deployResult = r;
                            break;
                        case 'failpaused-need-rollback-first': {
                            const motivation = r.reason === 'replacement'
                                ? `Stack is in a paused fail state (${r.status}) and change includes a replacement which cannot be deployed with "--no-rollback"`
                                : `Stack is in a paused fail state (${r.status}) and command line arguments do not include "--no-rollback"`;
                            if (options.force) {
                                await this.ioHost.asIoHelper().defaults.warn(`${motivation}. Rolling back first (--force).`);
                            }
                            else {
                                await askUserConfirmation(this.ioHost, api_private_1.IO.CDK_TOOLKIT_I5050.req(`${motivation}. Roll back first and then proceed with deployment`, {
                                    motivation,
                                    concurrency,
                                }));
                            }
                            // Perform a rollback
                            await this.rollback({
                                selector: { patterns: [stack.hierarchicalId] },
                                toolkitStackName: options.toolkitStackName,
                                force: options.force,
                            });
                            // Go around through the 'while' loop again but switch rollback to true.
                            rollback = true;
                            break;
                        }
                        case 'replacement-requires-rollback': {
                            const motivation = 'Change includes a replacement which cannot be deployed with "--no-rollback"';
                            if (options.force) {
                                await this.ioHost.asIoHelper().defaults.warn(`${motivation}. Proceeding with regular deployment (--force).`);
                            }
                            else {
                                await askUserConfirmation(this.ioHost, api_private_1.IO.CDK_TOOLKIT_I5050.req(`${motivation}. Perform a regular deployment`, {
                                    concurrency,
                                    motivation,
                                }));
                            }
                            // Go around through the 'while' loop again but switch rollback to true.
                            rollback = true;
                            break;
                        }
                        default:
                            throw new toolkit_lib_1.ToolkitError(`Unexpected result type from deployStack: ${JSON.stringify(r)}. If you are seeing this error, please report it at https://github.com/aws/aws-cdk/issues/new/choose`);
                    }
                }
                const message = deployResult.noOp
                    ? ' ✅  %s (no changes)'
                    : ' ✅  %s';
                await this.ioHost.asIoHelper().defaults.info(chalk.green('\n' + message), stack.displayName);
                elapsedDeployTime = new Date().getTime() - startDeployTime;
                await this.ioHost.asIoHelper().defaults.info(`\n✨  Deployment time: ${(0, util_2.formatTime)(elapsedDeployTime)}s\n`);
                if (Object.keys(deployResult.outputs).length > 0) {
                    await this.ioHost.asIoHelper().defaults.info('Outputs:');
                    stackOutputs[stack.stackName] = deployResult.outputs;
                }
                for (const name of Object.keys(deployResult.outputs).sort()) {
                    const value = deployResult.outputs[name];
                    await this.ioHost.asIoHelper().defaults.info(`${chalk.cyan(stack.id)}.${chalk.cyan(name)} = ${chalk.underline(chalk.cyan(value))}`);
                }
                await this.ioHost.asIoHelper().defaults.info('Stack ARN:');
                await this.ioHost.asIoHelper().defaults.result(deployResult.stackArn);
            }
            catch (e) {
                // It has to be exactly this string because an integration test tests for
                // "bold(stackname) failed: ResourceNotReady: <error>"
                const wrappedError = new toolkit_lib_1.ToolkitError([`❌  ${chalk.bold(stack.stackName)} failed:`, ...(e.name ? [`${e.name}:`] : []), (0, util_2.formatErrorMessage)(e)].join(' '));
                error = {
                    name: (0, error_1.cdkCliErrorName)(wrappedError.name),
                };
                throw wrappedError;
            }
            finally {
                await deploySpan.end({ error });
                if (options.cloudWatchLogMonitor) {
                    const foundLogGroupsResult = await (0, api_1.findCloudWatchLogGroups)(this.props.sdkProvider, (0, api_private_1.asIoHelper)(this.ioHost, 'deploy'), stack);
                    options.cloudWatchLogMonitor.addLogGroups(foundLogGroupsResult.env, foundLogGroupsResult.sdk, foundLogGroupsResult.logGroupNames);
                }
                // If an outputs file has been specified, create the file path and write stack outputs to it once.
                // Outputs are written after all stacks have been deployed. If a stack deployment fails,
                // all of the outputs from successfully deployed stacks before the failure will still be written.
                if (outputsFile) {
                    fs.ensureFileSync(outputsFile);
                    await fs.writeJson(outputsFile, stackOutputs, {
                        spaces: 2,
                        encoding: 'utf8',
                    });
                }
            }
            await this.ioHost.asIoHelper().defaults.info(`\n✨  Total time: ${(0, util_2.formatTime)(elapsedSynthTime + elapsedDeployTime)}s\n`);
        };
        const assetBuildTime = options.assetBuildTime ?? AssetBuildTime.ALL_BEFORE_DEPLOY;
        const prebuildAssets = assetBuildTime === AssetBuildTime.ALL_BEFORE_DEPLOY;
        const concurrency = options.concurrency || 1;
        if (concurrency > 1) {
            // always force "events" progress output when we have concurrency
            this.ioHost.stackProgress = deploy_1.StackActivityProgress.EVENTS;
            // ...but only warn if the user explicitly requested "bar" progress
            if (options.progress && options.progress != deploy_1.StackActivityProgress.EVENTS) {
                await this.ioHost.asIoHelper().defaults.warn('⚠️ The --concurrency flag only supports --progress "events". Switching to "events".');
            }
        }
        const stacksAndTheirAssetManifests = stacks.flatMap((stack) => [
            stack,
            ...stack.dependencies.filter(x => cxapi.AssetManifestArtifact.isAssetManifestArtifact(x)),
        ]);
        const workGraph = new api_1.WorkGraphBuilder((0, api_private_1.asIoHelper)(this.ioHost, 'deploy'), prebuildAssets).build(stacksAndTheirAssetManifests);
        // Unless we are running with '--force', skip already published assets
        if (!options.force) {
            await this.removePublishedAssets(workGraph, options);
        }
        const graphConcurrency = {
            'stack': concurrency,
            'asset-build': 1, // This will be CPU-bound/memory bound, mostly matters for Docker builds
            'asset-publish': (options.assetParallelism ?? true) ? 8 : 1, // This will be I/O-bound, 8 in parallel seems reasonable
        };
        await workGraph.doParallel(graphConcurrency, {
            deployStack,
            buildAsset,
            publishAsset,
        });
    }
    /**
     * Detect infrastructure drift for the given stack(s)
     */
    async drift(options) {
        const driftResults = await this.toolkit.drift(this.props.cloudExecutable, {
            stacks: {
                patterns: options.selector.patterns,
                strategy: options.selector.patterns.length > 0 ? api_1.StackSelectionStrategy.PATTERN_MATCH : api_1.StackSelectionStrategy.ALL_STACKS,
            },
        });
        const totalDrifts = Object.values(driftResults).reduce((total, current) => total + (current.numResourcesWithDrift ?? 0), 0);
        return totalDrifts > 0 && options.fail ? 1 : 0;
    }
    /**
     * Roll back the given stack or stacks.
     */
    async rollback(options) {
        const startSynthTime = new Date().getTime();
        const stackCollection = await this.selectStacksForDeploy(options.selector, true);
        const elapsedSynthTime = new Date().getTime() - startSynthTime;
        await this.ioHost.asIoHelper().defaults.info(`\n✨  Synthesis time: ${(0, util_2.formatTime)(elapsedSynthTime)}s\n`);
        if (stackCollection.stackCount === 0) {
            await this.ioHost.asIoHelper().defaults.error('No stacks selected');
            return;
        }
        let anyRollbackable = false;
        for (const stack of stackCollection.stackArtifacts) {
            await this.ioHost.asIoHelper().defaults.info('Rolling back %s', chalk.bold(stack.displayName));
            const startRollbackTime = new Date().getTime();
            try {
                const result = await this.props.deployments.rollbackStack({
                    stack,
                    roleArn: options.roleArn,
                    toolkitStackName: options.toolkitStackName,
                    orphanFailedResources: options.force,
                    validateBootstrapStackVersion: options.validateBootstrapStackVersion,
                    orphanLogicalIds: options.orphanLogicalIds,
                });
                if (!result.notInRollbackableState) {
                    anyRollbackable = true;
                }
                const elapsedRollbackTime = new Date().getTime() - startRollbackTime;
                await this.ioHost.asIoHelper().defaults.info(`\n✨  Rollback time: ${(0, util_2.formatTime)(elapsedRollbackTime).toString()}s\n`);
            }
            catch (e) {
                await this.ioHost.asIoHelper().defaults.error('\n ❌  %s failed: %s', chalk.bold(stack.displayName), (0, util_2.formatErrorMessage)(e));
                throw new toolkit_lib_1.ToolkitError('Rollback failed (use --force to orphan failing resources)');
            }
        }
        if (!anyRollbackable) {
            throw new toolkit_lib_1.ToolkitError('No stacks were in a state that could be rolled back');
        }
    }
    async watch(options) {
        const rootDir = path.dirname(path.resolve(user_configuration_1.PROJECT_CONFIG));
        const ioHelper = (0, api_private_1.asIoHelper)(this.ioHost, 'watch');
        await this.ioHost.asIoHelper().defaults.debug("root directory used for 'watch' is: %s", rootDir);
        const watchSettings = this.props.configuration.settings.get(['watch']);
        if (!watchSettings) {
            throw new toolkit_lib_1.ToolkitError("Cannot use the 'watch' command without specifying at least one directory to monitor. " +
                'Make sure to add a "watch" key to your cdk.json');
        }
        // For the "include" subkey under the "watch" key, the behavior is:
        // 1. No "watch" setting? We error out.
        // 2. "watch" setting without an "include" key? We default to observing "./**".
        // 3. "watch" setting with an empty "include" key? We default to observing "./**".
        // 4. Non-empty "include" key? Just use the "include" key.
        const watchIncludes = this.patternsArrayForWatch(watchSettings.include, {
            rootDir,
            returnRootDirIfEmpty: true,
        });
        await this.ioHost.asIoHelper().defaults.debug("'include' patterns for 'watch': %s", watchIncludes);
        // For the "exclude" subkey under the "watch" key,
        // the behavior is to add some default excludes in addition to the ones specified by the user:
        // 1. The CDK output directory.
        // 2. Any file whose name starts with a dot.
        // 3. Any directory's content whose name starts with a dot.
        // 4. Any node_modules and its content (even if it's not a JS/TS project, you might be using a local aws-cli package)
        const outputDir = this.props.configuration.settings.get(['output']);
        const watchExcludes = this.patternsArrayForWatch(watchSettings.exclude, {
            rootDir,
            returnRootDirIfEmpty: false,
        }).concat(`${outputDir}/**`, '**/.*', '**/.*/**', '**/node_modules/**');
        await this.ioHost.asIoHelper().defaults.debug("'exclude' patterns for 'watch': %s", watchExcludes);
        // Since 'cdk deploy' is a relatively slow operation for a 'watch' process,
        // introduce a concurrency latch that tracks the state.
        // This way, if file change events arrive when a 'cdk deploy' is still executing,
        // we will batch them, and trigger another 'cdk deploy' after the current one finishes,
        // making sure 'cdk deploy's  always execute one at a time.
        // Here's a diagram showing the state transitions:
        // --------------                --------    file changed     --------------    file changed     --------------  file changed
        // |            |  ready event   |      | ------------------> |            | ------------------> |            | --------------|
        // | pre-ready  | -------------> | open |                     | deploying  |                     |   queued   |               |
        // |            |                |      | <------------------ |            | <------------------ |            | <-------------|
        // --------------                --------  'cdk deploy' done  --------------  'cdk deploy' done  --------------
        let latch = 'pre-ready';
        const cloudWatchLogMonitor = options.traceLogs ? new api_1.CloudWatchLogEventMonitor({
            ioHelper,
        }) : undefined;
        const deployAndWatch = async () => {
            latch = 'deploying';
            await cloudWatchLogMonitor?.deactivate();
            await this.invokeDeployFromWatch(options, cloudWatchLogMonitor);
            // If latch is still 'deploying' after the 'await', that's fine,
            // but if it's 'queued', that means we need to deploy again
            while (latch === 'queued') {
                // TypeScript doesn't realize latch can change between 'awaits',
                // and thinks the above 'while' condition is always 'false' without the cast
                latch = 'deploying';
                await this.ioHost.asIoHelper().defaults.info("Detected file changes during deployment. Invoking 'cdk deploy' again");
                await this.invokeDeployFromWatch(options, cloudWatchLogMonitor);
            }
            latch = 'open';
            await cloudWatchLogMonitor?.activate();
        };
        chokidar
            .watch(watchIncludes, {
            ignored: watchExcludes,
            cwd: rootDir,
        })
            .on('ready', async () => {
            latch = 'open';
            await this.ioHost.asIoHelper().defaults.debug("'watch' received the 'ready' event. From now on, all file changes will trigger a deployment");
            await this.ioHost.asIoHelper().defaults.info("Triggering initial 'cdk deploy'");
            await deployAndWatch();
        })
            .on('all', async (event, filePath) => {
            if (latch === 'pre-ready') {
                await this.ioHost.asIoHelper().defaults.info(`'watch' is observing ${event === 'addDir' ? 'directory' : 'the file'} '%s' for changes`, filePath);
            }
            else if (latch === 'open') {
                await this.ioHost.asIoHelper().defaults.info("Detected change to '%s' (type: %s). Triggering 'cdk deploy'", filePath, event);
                await deployAndWatch();
            }
            else {
                // this means latch is either 'deploying' or 'queued'
                latch = 'queued';
                await this.ioHost.asIoHelper().defaults.info("Detected change to '%s' (type: %s) while 'cdk deploy' is still running. " +
                    'Will queue for another deployment after this one finishes', filePath, event);
            }
        });
    }
    async import(options) {
        const stacks = await this.selectStacksForDeploy(options.selector, true, true, false);
        // set progress from options, this includes user and app config
        if (options.progress) {
            this.ioHost.stackProgress = options.progress;
        }
        if (stacks.stackCount > 1) {
            throw new toolkit_lib_1.ToolkitError(`Stack selection is ambiguous, please choose a specific stack for import [${stacks.stackArtifacts.map((x) => x.id).join(', ')}]`);
        }
        if (!process.stdout.isTTY && !options.resourceMappingFile) {
            throw new toolkit_lib_1.ToolkitError('--resource-mapping is required when input is not a terminal');
        }
        const stack = stacks.stackArtifacts[0];
        await this.ioHost.asIoHelper().defaults.info(chalk.bold(stack.displayName));
        const resourceImporter = new api_1.ResourceImporter(stack, {
            deployments: this.props.deployments,
            ioHelper: (0, api_private_1.asIoHelper)(this.ioHost, 'import'),
        });
        const { additions, hasNonAdditions } = await resourceImporter.discoverImportableResources(options.force);
        if (additions.length === 0) {
            await this.ioHost.asIoHelper().defaults.warn('%s: no new resources compared to the currently deployed stack, skipping import.', chalk.bold(stack.displayName));
            return;
        }
        // Prepare a mapping of physical resources to CDK constructs
        const actualImport = !options.resourceMappingFile
            ? await resourceImporter.askForResourceIdentifiers(additions)
            : await resourceImporter.loadResourceIdentifiers(additions, options.resourceMappingFile);
        if (actualImport.importResources.length === 0) {
            await this.ioHost.asIoHelper().defaults.warn('No resources selected for import.');
            return;
        }
        // If "--create-resource-mapping" option was passed, write the resource mapping to the given file and exit
        if (options.recordResourceMapping) {
            const outputFile = options.recordResourceMapping;
            fs.ensureFileSync(outputFile);
            await fs.writeJson(outputFile, actualImport.resourceMap, {
                spaces: 2,
                encoding: 'utf8',
            });
            await this.ioHost.asIoHelper().defaults.info('%s: mapping file written.', outputFile);
            return;
        }
        // Import the resources according to the given mapping
        await this.ioHost.asIoHelper().defaults.info('%s: importing resources into stack...', chalk.bold(stack.displayName));
        const tags = (0, api_private_1.tagsForStack)(stack);
        await resourceImporter.importResourcesFromMap(actualImport, {
            roleArn: options.roleArn,
            tags,
            deploymentMethod: options.deploymentMethod,
            usePreviousParameters: true,
            rollback: options.rollback,
        });
        // Notify user of next steps
        await this.ioHost.asIoHelper().defaults.info(`Import operation complete. We recommend you run a ${chalk.blueBright('drift detection')} operation ` +
            'to confirm your CDK app resource definitions are up-to-date. Read more here: ' +
            chalk.underline.blueBright('https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/detect-drift-stack.html'));
        if (actualImport.importResources.length < additions.length) {
            await this.ioHost.asIoHelper().defaults.info('');
            await this.ioHost.asIoHelper().defaults.warn(`Some resources were skipped. Run another ${chalk.blueBright('cdk import')} or a ${chalk.blueBright('cdk deploy')} to bring the stack up-to-date with your CDK app definition.`);
        }
        else if (hasNonAdditions) {
            await this.ioHost.asIoHelper().defaults.info('');
            await this.ioHost.asIoHelper().defaults.warn(`Your app has pending updates or deletes excluded from this import operation. Run a ${chalk.blueBright('cdk deploy')} to bring the stack up-to-date with your CDK app definition.`);
        }
    }
    async destroy(options) {
        const ioHelper = this.ioHost.asIoHelper();
        // The stacks will have been ordered for deployment, so reverse them for deletion.
        const stacks = (await this.selectStacksForDestroy(options.selector, options.exclusively)).reversed();
        if (!options.force) {
            const motivation = 'Destroying stacks is an irreversible action';
            const question = `Are you sure you want to delete: ${chalk.blue(stacks.stackArtifacts.map((s) => s.hierarchicalId).join(', '))}`;
            try {
                await ioHelper.requestResponse(api_private_1.IO.CDK_TOOLKIT_I7010.req(question, { motivation }));
            }
            catch (err) {
                if (!toolkit_lib_1.ToolkitError.isToolkitError(err) || err.message != 'Aborted by user') {
                    throw err; // unexpected error
                }
                await ioHelper.notify(api_private_1.IO.CDK_TOOLKIT_E7010.msg(err.message));
                return;
            }
        }
        const action = options.fromDeploy ? 'deploy' : 'destroy';
        for (const [index, stack] of stacks.stackArtifacts.entries()) {
            await ioHelper.defaults.info(chalk.green('%s: destroying... [%s/%s]'), chalk.blue(stack.displayName), index + 1, stacks.stackCount);
            try {
                await this.props.deployments.destroyStack({
                    stack,
                    deployName: stack.stackName,
                    roleArn: options.roleArn,
                });
                await ioHelper.defaults.info(chalk.green(`\n ✅  %s: ${action}ed`), chalk.blue(stack.displayName));
            }
            catch (e) {
                await ioHelper.defaults.error(`\n ❌  %s: ${action} failed`, chalk.blue(stack.displayName), e);
                throw e;
            }
        }
    }
    async list(selectors, options = {}) {
        const stacks = await (0, list_stacks_1.listStacks)(this, {
            selectors: selectors,
        });
        if (options.long && options.showDeps) {
            await printSerializedObject(this.ioHost.asIoHelper(), stacks, options.json ?? false);
            return 0;
        }
        if (options.showDeps) {
            const stackDeps = stacks.map(stack => ({
                id: stack.id,
                dependencies: stack.dependencies,
            }));
            await printSerializedObject(this.ioHost.asIoHelper(), stackDeps, options.json ?? false);
            return 0;
        }
        if (options.long) {
            const long = stacks.map(stack => ({
                id: stack.id,
                name: stack.name,
                environment: stack.environment,
            }));
            await printSerializedObject(this.ioHost.asIoHelper(), long, options.json ?? false);
            return 0;
        }
        // just print stack IDs
        for (const stack of stacks) {
            await this.ioHost.asIoHelper().defaults.result(stack.id);
        }
        return 0; // exit-code
    }
    /**
     * Synthesize the given set of stacks (called when the user runs 'cdk synth')
     *
     * INPUT: Stack names can be supplied using a glob filter. If no stacks are
     * given, all stacks from the application are implicitly selected.
     *
     * OUTPUT: If more than one stack ends up being selected, an output directory
     * should be supplied, where the templates will be written.
     */
    async synth(stackNames, exclusively, quiet, autoValidate, json) {
        const stacks = await this.selectStacksForDiff(stackNames, exclusively, autoValidate);
        // if we have a single stack, print it to STDOUT
        if (stacks.stackCount === 1) {
            if (!quiet) {
                await printSerializedObject(this.ioHost.asIoHelper(), (0, util_2.obscureTemplate)(stacks.firstStack.template), json ?? false);
            }
            await displayFlagsMessage(this.ioHost.asIoHelper(), this.toolkit, this.props.cloudExecutable);
            return undefined;
        }
        // not outputting template to stdout, let's explain things to the user a little bit...
        await this.ioHost.asIoHelper().defaults.info(chalk.green(`Successfully synthesized to ${chalk.blue(path.resolve(stacks.assembly.directory))}`));
        await this.ioHost.asIoHelper().defaults.info(`Supply a stack id (${stacks.stackArtifacts.map((s) => chalk.green(s.hierarchicalId)).join(', ')}) to display its template.`);
        await displayFlagsMessage(this.ioHost.asIoHelper(), this.toolkit, this.props.cloudExecutable);
        return undefined;
    }
    /**
     * Bootstrap the CDK Toolkit stack in the accounts used by the specified stack(s).
     *
     * @param userEnvironmentSpecs - environment names that need to have toolkit support
     *             provisioned, as a glob filter. If none is provided, all stacks are implicitly selected.
     * @param options - The name, role ARN, bootstrapping parameters, etc. to be used for the CDK Toolkit stack.
     */
    async bootstrap(userEnvironmentSpecs, options) {
        const bootstrapper = new bootstrap_1.Bootstrapper(options.source, (0, api_private_1.asIoHelper)(this.ioHost, 'bootstrap'));
        // If there is an '--app' argument and an environment looks like a glob, we
        // select the environments from the app. Otherwise, use what the user said.
        const environments = await this.defineEnvironments(userEnvironmentSpecs);
        const limit = pLimit(20);
        // eslint-disable-next-line @cdklabs/promiseall-no-unbounded-parallelism
        await Promise.all(environments.map((environment) => limit(async () => {
            await this.ioHost.asIoHelper().defaults.info(chalk.green(' ⏳  Bootstrapping environment %s...'), chalk.blue(environment.name));
            try {
                const result = await bootstrapper.bootstrapEnvironment(environment, this.props.sdkProvider, options);
                const message = result.noOp
                    ? ' ✅  Environment %s bootstrapped (no changes).'
                    : ' ✅  Environment %s bootstrapped.';
                await this.ioHost.asIoHelper().defaults.info(chalk.green(message), chalk.blue(environment.name));
            }
            catch (e) {
                await this.ioHost.asIoHelper().defaults.error(' ❌  Environment %s failed bootstrapping: %s', chalk.blue(environment.name), e);
                throw e;
            }
        })));
    }
    /**
     * Garbage collects assets from a CDK app's environment
     * @param options - Options for Garbage Collection
     */
    async garbageCollect(userEnvironmentSpecs, options) {
        const environments = await this.defineEnvironments(userEnvironmentSpecs);
        for (const environment of environments) {
            await this.ioHost.asIoHelper().defaults.info(chalk.green(' ⏳  Garbage Collecting environment %s...'), chalk.blue(environment.name));
            const gc = new api_1.GarbageCollector({
                sdkProvider: this.props.sdkProvider,
                ioHelper: (0, api_private_1.asIoHelper)(this.ioHost, 'gc'),
                resolvedEnvironment: environment,
                bootstrapStackName: options.bootstrapStackName,
                rollbackBufferDays: options.rollbackBufferDays,
                createdBufferDays: options.createdBufferDays,
                action: options.action ?? 'full',
                type: options.type ?? 'all',
                confirm: options.confirm ?? true,
            });
            await gc.garbageCollect();
        }
    }
    async defineEnvironments(userEnvironmentSpecs) {
        // By default, glob for everything
        const environmentSpecs = userEnvironmentSpecs.length > 0 ? [...userEnvironmentSpecs] : ['**'];
        // Partition into globs and non-globs (this will mutate environmentSpecs).
        const globSpecs = (0, util_2.partition)(environmentSpecs, cxapp_1.looksLikeGlob);
        if (globSpecs.length > 0 && !this.props.cloudExecutable.hasApp) {
            if (userEnvironmentSpecs.length > 0) {
                // User did request this glob
                throw new toolkit_lib_1.ToolkitError(`'${globSpecs}' is not an environment name. Specify an environment name like 'aws://123456789012/us-east-1', or run in a directory with 'cdk.json' to use wildcards.`);
            }
            else {
                // User did not request anything
                throw new toolkit_lib_1.ToolkitError("Specify an environment name like 'aws://123456789012/us-east-1', or run in a directory with 'cdk.json'.");
            }
        }
        const environments = [...(0, cxapp_1.environmentsFromDescriptors)(environmentSpecs)];
        // If there is an '--app' argument, select the environments from the app.
        if (this.props.cloudExecutable.hasApp) {
            environments.push(...(await (0, cxapp_1.globEnvironmentsFromStacks)(await this.selectStacksForList([]), globSpecs, this.props.sdkProvider)));
        }
        return environments;
    }
    /**
     * Migrates a CloudFormation stack/template to a CDK app
     * @param options - Options for CDK app creation
     */
    async migrate(options) {
        await this.ioHost.asIoHelper().defaults.warn('This command is an experimental feature.');
        const language = options.language?.toLowerCase() ?? 'typescript';
        const environment = (0, migrate_1.setEnvironment)(options.account, options.region);
        let generateTemplateOutput;
        let cfn;
        let templateToDelete;
        try {
            // if neither fromPath nor fromStack is provided, generate a template using cloudformation
            const scanType = (0, migrate_1.parseSourceOptions)(options.fromPath, options.fromStack, options.stackName).source;
            if (scanType == migrate_1.TemplateSourceOptions.SCAN) {
                generateTemplateOutput = await (0, migrate_1.generateTemplate)({
                    stackName: options.stackName,
                    filters: options.filter,
                    fromScan: options.fromScan,
                    sdkProvider: this.props.sdkProvider,
                    environment: environment,
                    ioHelper: this.ioHost.asIoHelper(),
                });
                templateToDelete = generateTemplateOutput.templateId;
            }
            else if (scanType == migrate_1.TemplateSourceOptions.PATH) {
                const templateBody = (0, migrate_1.readFromPath)(options.fromPath);
                const parsedTemplate = (0, util_2.deserializeStructure)(templateBody);
                const templateId = parsedTemplate.Metadata?.AWSToolsMetrics?.IaC_Generator?.toString();
                if (templateId) {
                    // if we have a template id, we can call describe generated template to get the resource identifiers
                    // resource metadata, and template source to generate the template
                    cfn = new migrate_1.CfnTemplateGeneratorProvider(await (0, migrate_1.buildCfnClient)(this.props.sdkProvider, environment), this.ioHost.asIoHelper());
                    const generatedTemplateSummary = await cfn.describeGeneratedTemplate(templateId);
                    generateTemplateOutput = (0, migrate_1.buildGeneratedTemplateOutput)(generatedTemplateSummary, templateBody, generatedTemplateSummary.GeneratedTemplateId);
                }
                else {
                    generateTemplateOutput = {
                        migrateJson: {
                            templateBody: templateBody,
                            source: 'localfile',
                        },
                    };
                }
            }
            else if (scanType == migrate_1.TemplateSourceOptions.STACK) {
                const template = await (0, migrate_1.readFromStack)(options.stackName, this.props.sdkProvider, environment);
                if (!template) {
                    throw new toolkit_lib_1.ToolkitError(`No template found for stack-name: ${options.stackName}`);
                }
                generateTemplateOutput = {
                    migrateJson: {
                        templateBody: template,
                        source: options.stackName,
                    },
                };
            }
            else {
                // We shouldn't ever get here, but just in case.
                throw new toolkit_lib_1.ToolkitError(`Invalid source option provided: ${scanType}`);
            }
            const stack = (0, migrate_1.generateStack)(generateTemplateOutput.migrateJson.templateBody, options.stackName, language);
            await this.ioHost.asIoHelper().defaults.info(chalk.green(' ⏳  Generating CDK app for %s...'), chalk.blue(options.stackName));
            await (0, migrate_1.generateCdkApp)(this.ioHost.asIoHelper(), options.stackName, stack, language, options.outputPath, options.compress);
            if (generateTemplateOutput) {
                (0, migrate_1.writeMigrateJsonFile)(options.outputPath, options.stackName, generateTemplateOutput.migrateJson);
            }
            if ((0, migrate_1.isThereAWarning)(generateTemplateOutput)) {
                await this.ioHost.asIoHelper().defaults.warn(' ⚠️  Some resources could not be migrated completely. Please review the README.md file for more information.');
                (0, migrate_1.appendWarningsToReadme)(`${path.join(options.outputPath ?? process.cwd(), options.stackName)}/README.md`, generateTemplateOutput.resources);
            }
        }
        catch (e) {
            await this.ioHost.asIoHelper().defaults.error(' ❌  Migrate failed for `%s`: %s', options.stackName, e.message);
            throw e;
        }
        finally {
            if (templateToDelete) {
                if (!cfn) {
                    cfn = new migrate_1.CfnTemplateGeneratorProvider(await (0, migrate_1.buildCfnClient)(this.props.sdkProvider, environment), this.ioHost.asIoHelper());
                }
                if (!process.env.MIGRATE_INTEG_TEST) {
                    await cfn.deleteGeneratedTemplate(templateToDelete);
                }
            }
        }
    }
    async refactor(options) {
        if (options.revert && !options.overrideFile) {
            throw new toolkit_lib_1.ToolkitError('The --revert option can only be used with the --override-file option.');
        }
        try {
            const patterns = options.stacks?.patterns ?? [];
            await this.toolkit.refactor(this.props.cloudExecutable, {
                dryRun: options.dryRun,
                stacks: {
                    patterns: patterns,
                    strategy: patterns.length > 0 ? api_1.StackSelectionStrategy.PATTERN_MATCH : api_1.StackSelectionStrategy.ALL_STACKS,
                },
                force: options.force,
                additionalStackNames: options.additionalStackNames,
                overrides: readOverrides(options.overrideFile, options.revert),
                roleArn: options.roleArn,
            });
        }
        catch (e) {
            await this.ioHost.asIoHelper().defaults.error(e.message);
            throw e;
        }
        return 0;
        function readOverrides(filePath, revert = false) {
            if (filePath == null) {
                return [];
            }
            if (!fs.pathExistsSync(filePath)) {
                throw new toolkit_lib_1.ToolkitError(`The mapping file ${filePath} does not exist`);
            }
            const groups = (0, refactor_1.parseMappingGroups)(fs.readFileSync(filePath).toString('utf-8'));
            return revert
                ? groups.map((group) => ({
                    ...group,
                    resources: Object.fromEntries(Object.entries(group.resources ?? {}).map(([src, dst]) => [dst, src])),
                }))
                : groups;
        }
    }
    async selectStacksForList(patterns) {
        const assembly = await this.assembly();
        const stacks = await assembly.selectStacks({ patterns }, { defaultBehavior: cxapp_1.DefaultSelection.AllStacks });
        // No validation
        return stacks;
    }
    async selectStacksForDeploy(selector, exclusively, cacheCloudAssembly, ignoreNoStacks) {
        const assembly = await this.assembly(cacheCloudAssembly);
        const stacks = await assembly.selectStacks(selector, {
            extend: exclusively ? cloud_assembly_1.ExtendedStackSelection.None : cloud_assembly_1.ExtendedStackSelection.Upstream,
            defaultBehavior: cxapp_1.DefaultSelection.OnlySingle,
            ignoreNoStacks,
        });
        this.validateStacksSelected(stacks, selector.patterns);
        await this.validateStacks(stacks);
        return stacks;
    }
    async selectStacksForDiff(stackNames, exclusively, autoValidate) {
        const assembly = await this.assembly();
        const selectedForDiff = await assembly.selectStacks({ patterns: stackNames }, {
            extend: exclusively ? cloud_assembly_1.ExtendedStackSelection.None : cloud_assembly_1.ExtendedStackSelection.Upstream,
            defaultBehavior: cxapp_1.DefaultSelection.MainAssembly,
        });
        const allStacks = await this.selectStacksForList([]);
        const autoValidateStacks = autoValidate
            ? allStacks.filter((art) => art.validateOnSynth ?? false)
            : new cloud_assembly_1.StackCollection(assembly, []);
        this.validateStacksSelected(selectedForDiff.concat(autoValidateStacks), stackNames);
        await this.validateStacks(selectedForDiff.concat(autoValidateStacks));
        return selectedForDiff;
    }
    async selectStacksForDestroy(selector, exclusively) {
        const assembly = await this.assembly();
        const stacks = await assembly.selectStacks(selector, {
            extend: exclusively ? cloud_assembly_1.ExtendedStackSelection.None : cloud_assembly_1.ExtendedStackSelection.Downstream,
            defaultBehavior: cxapp_1.DefaultSelection.OnlySingle,
        });
        // No validation
        return stacks;
    }
    /**
     * Validate the stacks for errors and warnings according to the CLI's current settings
     */
    async validateStacks(stacks) {
        const failAt = this.validateMetadataFailAt();
        await stacks.validateMetadata(failAt, stackMetadataLogger(this.ioHost.asIoHelper(), this.props.verbose));
    }
    validateMetadataFailAt() {
        let failAt = 'error';
        if (this.props.ignoreErrors) {
            failAt = 'none';
        }
        if (this.props.strict) {
            failAt = 'warn';
        }
        return failAt;
    }
    /**
     * Validate that if a user specified a stack name there exists at least 1 stack selected
     */
    validateStacksSelected(stacks, stackNames) {
        if (stackNames.length != 0 && stacks.stackCount == 0) {
            throw new toolkit_lib_1.ToolkitError(`No stacks match the name(s) ${stackNames}`);
        }
    }
    /**
     * Select a single stack by its name
     */
    async selectSingleStackByName(stackName) {
        const assembly = await this.assembly();
        const stacks = await assembly.selectStacks({ patterns: [stackName] }, {
            extend: cloud_assembly_1.ExtendedStackSelection.None,
            defaultBehavior: cxapp_1.DefaultSelection.None,
        });
        // Could have been a glob so check that we evaluated to exactly one
        if (stacks.stackCount > 1) {
            throw new toolkit_lib_1.ToolkitError(`This command requires exactly one stack and we matched more than one: ${stacks.stackIds}`);
        }
        return assembly.stackById(stacks.firstStack.id);
    }
    assembly(cacheCloudAssembly) {
        return this.props.cloudExecutable.synthesize(cacheCloudAssembly);
    }
    patternsArrayForWatch(patterns, options) {
        const patternsArray = patterns !== undefined ? (Array.isArray(patterns) ? patterns : [patterns]) : [];
        return patternsArray.length > 0 ? patternsArray : options.returnRootDirIfEmpty ? [options.rootDir] : [];
    }
    async invokeDeployFromWatch(options, cloudWatchLogMonitor) {
        const deployOptions = {
            ...options,
            requireApproval: cloud_assembly_schema_1.RequireApproval.NEVER,
            // if 'watch' is called by invoking 'cdk deploy --watch',
            // we need to make sure to not call 'deploy' with 'watch' again,
            // as that would lead to a cycle
            watch: false,
            cloudWatchLogMonitor,
            cacheCloudAssembly: false,
            extraUserAgent: `cdk-watch/hotswap-${options.deploymentMethod?.method === 'hotswap' ? 'on' : 'off'}`,
            concurrency: options.concurrency,
        };
        try {
            await this.deploy(deployOptions);
        }
        catch {
            // just continue - deploy will show the error
        }
    }
    /**
     * Remove the asset publishing and building from the work graph for assets that are already in place
     */
    async removePublishedAssets(graph, options) {
        await graph.removeUnnecessaryAssets(assetNode => this.props.deployments.isSingleAssetPublished(assetNode.assetManifest, assetNode.asset, {
            stack: assetNode.parentStack,
            roleArn: options.roleArn,
            stackName: assetNode.parentStack.stackName,
        }));
    }
}
exports.CdkToolkit = CdkToolkit;
/**
 * Print a serialized object (YAML or JSON) to stdout.
 */
async function printSerializedObject(ioHelper, obj, json) {
    await ioHelper.defaults.result((0, util_2.serializeStructure)(obj, json));
}
function buildParameterMap(parameters) {
    const parameterMap = { '*': {} };
    for (const key in parameters) {
        if (parameters.hasOwnProperty(key)) {
            const [stack, parameter] = key.split(':', 2);
            if (!parameter) {
                parameterMap['*'][stack] = parameters[key];
            }
            else {
                if (!parameterMap[stack]) {
                    parameterMap[stack] = {};
                }
                parameterMap[stack][parameter] = parameters[key];
            }
        }
    }
    return parameterMap;
}
/**
 * Ask the user for a yes/no confirmation
 *
 * Automatically fail the confirmation in case we're in a situation where the confirmation
 * cannot be interactively obtained from a human at the keyboard.
 */
async function askUserConfirmation(ioHost, req) {
    await ioHost.withCorkedLogging(async () => {
        await ioHost.asIoHelper().requestResponse(req);
    });
}
/**
 * Display a warning if there are flags that are different from the recommended value
 *
 * This happens if both of the following are true:
 *
 * - The user didn't configure the value
 * - The default value for the flag (unconfiguredBehavesLike) is different from the recommended value
 */
async function displayFlagsMessage(ioHost, toolkit, cloudExecutable) {
    const flags = await toolkit.flags(cloudExecutable);
    // The "unconfiguredBehavesLike" information got added later. If none of the flags have this information,
    // we don't have enough information to reliably display this information without scaring users, so don't do anything.
    if (flags.every(flag => flag.unconfiguredBehavesLike === undefined)) {
        return;
    }
    const unconfiguredFlags = flags
        .filter(flag => !obsolete_flags_1.OBSOLETE_FLAGS.includes(flag.name))
        .filter(flag => (flag.unconfiguredBehavesLike?.v2 ?? false) !== flag.recommendedValue)
        .filter(flag => flag.userValue === undefined);
    const numUnconfigured = unconfiguredFlags.length;
    if (numUnconfigured > 0) {
        await ioHost.defaults.warn(`${numUnconfigured} feature flags are not configured. Run 'cdk flags --unstable=flags' to learn more.`);
    }
}
/**
 * Logger for processing stack metadata
 */
function stackMetadataLogger(ioHelper, verbose) {
    const makeLogger = (level) => {
        switch (level) {
            case 'error':
                return [(m) => ioHelper.defaults.error(m), 'Error'];
            case 'warn':
                return [(m) => ioHelper.defaults.warn(m), 'Warning'];
            default:
                return [(m) => ioHelper.defaults.info(m), 'Info'];
        }
    };
    return async (level, msg) => {
        const [logFn, prefix] = makeLogger(level);
        await logFn(`[${prefix} at ${msg.id}] ${msg.entry.data}`);
        if (verbose && msg.entry.trace) {
            logFn(`  ${msg.entry.trace.join('\n  ')}`);
        }
    };
}
/**
 * Determine if manual approval is required or not. Requires approval for
 * - RequireApproval.ANY_CHANGE
 * - RequireApproval.BROADENING and the changes are indeed broadening permissions
 */
function requiresApproval(requireApproval, permissionChangeType) {
    return requireApproval === cloud_assembly_schema_1.RequireApproval.ANYCHANGE ||
        requireApproval === cloud_assembly_schema_1.RequireApproval.BROADENING && permissionChangeType === toolkit_lib_1.PermissionChangeType.BROADENING;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLXRvb2xraXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjZGstdG9vbGtpdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUEya0VBLGtEQWtCQztBQTdsRUQsNkJBQTZCO0FBQzdCLCtCQUE4QjtBQUM5QiwwRUFBaUU7QUFDakUseUNBQXlDO0FBRXpDLHNEQUFtRjtBQUNuRiwrQkFBK0I7QUFDL0IscUNBQXFDO0FBQ3JDLCtCQUErQjtBQUMvQiw2QkFBNkI7QUFDN0IsdUNBQXNDO0FBRXRDLDZEQUFzRDtBQUV0RCx1REFBNkU7QUFFN0UsZ0NBV2dCO0FBR2hCLGdEQUFnRDtBQUNoRCwwREFBZ0Y7QUFFaEYsOENBQTRFO0FBRTVFLCtDQUEyRDtBQUMzRCx5REFBcUQ7QUFFckQsaURBZTZCO0FBRTdCLG9DQUFvSDtBQUNwSCxzREFBbUQ7QUFDbkQsa0NBUWlCO0FBQ2pCLHFFQUFvRTtBQUNwRSw2Q0FBb0Q7QUFDcEQsbURBQXdEO0FBR3hELDZFQUE2RTtBQUM3RSw0R0FBNEc7QUFDNUcsTUFBTSxNQUFNLEdBQTZCLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztBQXlENUQ7O0dBRUc7QUFDSCxJQUFZLGNBYVg7QUFiRCxXQUFZLGNBQWM7SUFDeEI7Ozs7O09BS0c7SUFDSCx5REFBdUMsQ0FBQTtJQUV2Qzs7T0FFRztJQUNILCtDQUE2QixDQUFBO0FBQy9CLENBQUMsRUFiVyxjQUFjLDhCQUFkLGNBQWMsUUFhekI7QUFFRDs7Ozs7R0FLRztBQUNILE1BQU0sZUFBZ0IsU0FBUSxxQkFBTztJQUVuQyxZQUFtQixXQUF3QixFQUFFLE9BQTBDO1FBQ3JGLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNmLElBQUksQ0FBQyxZQUFZLEdBQUcsV0FBVyxDQUFDO0lBQ2xDLENBQUM7SUFFRDs7O09BR0c7SUFDTyxLQUFLLENBQUMsV0FBVyxDQUFDLE9BQXNCO1FBQ2hELE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQztJQUMzQixDQUFDO0NBQ0Y7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QUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3ZEO2dCQUNFLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDdEQsQ0FBQztJQUNILENBQUMsQ0FBQztJQUVGLE9BQU8sS0FBSyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsRUFBRTtRQUMxQixNQUFNLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMxQyxNQUFNLEtBQUssQ0FBQyxJQUFJLE1BQU0sT0FBTyxHQUFHLENBQUMsRUFBRSxLQUFLLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUUxRCxJQUFJLE9BQU8sSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQy9CLEtBQUssQ0FBQyxLQUFLLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDN0MsQ0FBQztJQUNILENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsU0FBUyxnQkFBZ0IsQ0FBQyxlQUFnQyxFQUFFLG9CQUEwQztJQUNwRyxPQUFPLGVBQWUsS0FBSyx1Q0FBZSxDQUFDLFNBQVM7UUFDbEQsZUFBZSxLQUFLLHVDQUFlLENBQUMsVUFBVSxJQUFJLG9CQUFvQixLQUFLLGtDQUFvQixDQUFDLFVBQVUsQ0FBQztBQUMvRyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IGZvcm1hdCB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgUmVxdWlyZUFwcHJvdmFsIH0gZnJvbSAnQGF3cy1jZGsvY2xvdWQtYXNzZW1ibHktc2NoZW1hJztcbmltcG9ydCAqIGFzIGN4YXBpIGZyb20gJ0Bhd3MtY2RrL2N4LWFwaSc7XG5pbXBvcnQgdHlwZSB7IENvbmZpcm1hdGlvblJlcXVlc3QsIERlcGxveW1lbnRNZXRob2QsIFRvb2xraXRBY3Rpb24sIFRvb2xraXRPcHRpb25zIH0gZnJvbSAnQGF3cy1jZGsvdG9vbGtpdC1saWInO1xuaW1wb3J0IHsgUGVybWlzc2lvbkNoYW5nZVR5cGUsIFRvb2xraXQsIFRvb2xraXRFcnJvciB9IGZyb20gJ0Bhd3MtY2RrL3Rvb2xraXQtbGliJztcbmltcG9ydCAqIGFzIGNoYWxrIGZyb20gJ2NoYWxrJztcbmltcG9ydCAqIGFzIGNob2tpZGFyIGZyb20gJ2Nob2tpZGFyJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzLWV4dHJhJztcbmltcG9ydCAqIGFzIHV1aWQgZnJvbSAndXVpZCc7XG5pbXBvcnQgeyBDbGlJb0hvc3QgfSBmcm9tICcuL2lvLWhvc3QnO1xuaW1wb3J0IHR5cGUgeyBDb25maWd1cmF0aW9uIH0gZnJvbSAnLi91c2VyLWNvbmZpZ3VyYXRpb24nO1xuaW1wb3J0IHsgUFJPSkVDVF9DT05GSUcgfSBmcm9tICcuL3VzZXItY29uZmlndXJhdGlvbic7XG5pbXBvcnQgdHlwZSB7IEFjdGlvbkxlc3NSZXF1ZXN0LCBJb0hlbHBlciB9IGZyb20gJy4uLy4uL2xpYi9hcGktcHJpdmF0ZSc7XG5pbXBvcnQgeyBhc0lvSGVscGVyLCBjZm5BcGksIElPLCB0YWdzRm9yU3RhY2sgfSBmcm9tICcuLi8uLi9saWIvYXBpLXByaXZhdGUnO1xuaW1wb3J0IHR5cGUgeyBBc3NldEJ1aWxkTm9kZSwgQXNzZXRQdWJsaXNoTm9kZSwgQ29uY3VycmVuY3ksIFN0YWNrTm9kZSwgV29ya0dyYXBoIH0gZnJvbSAnLi4vYXBpJztcbmltcG9ydCB7XG4gIENsb3VkV2F0Y2hMb2dFdmVudE1vbml0b3IsXG4gIERFRkFVTFRfVE9PTEtJVF9TVEFDS19OQU1FLFxuICBEaWZmRm9ybWF0dGVyLFxuICBmaW5kQ2xvdWRXYXRjaExvZ0dyb3VwcyxcbiAgR2FyYmFnZUNvbGxlY3RvcixcbiAgcmVtb3ZlTm9uSW1wb3J0UmVzb3VyY2VzLFxuICBSZXNvdXJjZUltcG9ydGVyLFxuICBSZXNvdXJjZU1pZ3JhdG9yLFxuICBTdGFja1NlbGVjdGlvblN0cmF0ZWd5LFxuICBXb3JrR3JhcGhCdWlsZGVyLFxufSBmcm9tICcuLi9hcGknO1xuaW1wb3J0IHR5cGUgeyBTZGtQcm92aWRlciB9IGZyb20gJy4uL2FwaS9hd3MtYXV0aCc7XG5pbXBvcnQgdHlwZSB7IEJvb3RzdHJhcEVudmlyb25tZW50T3B0aW9ucyB9IGZyb20gJy4uL2FwaS9ib290c3RyYXAnO1xuaW1wb3J0IHsgQm9vdHN0cmFwcGVyIH0gZnJvbSAnLi4vYXBpL2Jvb3RzdHJhcCc7XG5pbXBvcnQgeyBFeHRlbmRlZFN0YWNrU2VsZWN0aW9uLCBTdGFja0NvbGxlY3Rpb24gfSBmcm9tICcuLi9hcGkvY2xvdWQtYXNzZW1ibHknO1xuaW1wb3J0IHR5cGUgeyBEZXBsb3ltZW50cywgU3VjY2Vzc2Z1bERlcGxveVN0YWNrUmVzdWx0IH0gZnJvbSAnLi4vYXBpL2RlcGxveW1lbnRzJztcbmltcG9ydCB7IG1hcHBpbmdzQnlFbnZpcm9ubWVudCwgcGFyc2VNYXBwaW5nR3JvdXBzIH0gZnJvbSAnLi4vYXBpL3JlZmFjdG9yJztcbmltcG9ydCB7IHR5cGUgVGFnIH0gZnJvbSAnLi4vYXBpL3RhZ3MnO1xuaW1wb3J0IHsgU3RhY2tBY3Rpdml0eVByb2dyZXNzIH0gZnJvbSAnLi4vY29tbWFuZHMvZGVwbG95JztcbmltcG9ydCB7IGxpc3RTdGFja3MgfSBmcm9tICcuLi9jb21tYW5kcy9saXN0LXN0YWNrcyc7XG5pbXBvcnQgdHlwZSB7IEZyb21TY2FuLCBHZW5lcmF0ZVRlbXBsYXRlT3V0cHV0IH0gZnJvbSAnLi4vY29tbWFuZHMvbWlncmF0ZSc7XG5pbXBvcnQge1xuICBhcHBlbmRXYXJuaW5nc1RvUmVhZG1lLFxuICBidWlsZENmbkNsaWVudCxcbiAgYnVpbGRHZW5lcmF0ZWRUZW1wbGF0ZU91dHB1dCxcbiAgQ2ZuVGVtcGxhdGVHZW5lcmF0b3JQcm92aWRlcixcbiAgZ2VuZXJhdGVDZGtBcHAsXG4gIGdlbmVyYXRlU3RhY2ssXG4gIGdlbmVyYXRlVGVtcGxhdGUsXG4gIGlzVGhlcmVBV2FybmluZyxcbiAgcGFyc2VTb3VyY2VPcHRpb25zLFxuICByZWFkRnJvbVBhdGgsXG4gIHJlYWRGcm9tU3RhY2ssXG4gIHNldEVudmlyb25tZW50LFxuICBUZW1wbGF0ZVNvdXJjZU9wdGlvbnMsXG4gIHdyaXRlTWlncmF0ZUpzb25GaWxlLFxufSBmcm9tICcuLi9jb21tYW5kcy9taWdyYXRlJztcbmltcG9ydCB0eXBlIHsgQ2xvdWRBc3NlbWJseSwgQ2xvdWRFeGVjdXRhYmxlLCBTdGFja1NlbGVjdG9yIH0gZnJvbSAnLi4vY3hhcHAnO1xuaW1wb3J0IHsgRGVmYXVsdFNlbGVjdGlvbiwgZW52aXJvbm1lbnRzRnJvbURlc2NyaXB0b3JzLCBnbG9iRW52aXJvbm1lbnRzRnJvbVN0YWNrcywgbG9va3NMaWtlR2xvYiB9IGZyb20gJy4uL2N4YXBwJztcbmltcG9ydCB7IE9CU09MRVRFX0ZMQUdTIH0gZnJvbSAnLi4vb2Jzb2xldGUtZmxhZ3MnO1xuaW1wb3J0IHtcbiAgZGVzZXJpYWxpemVTdHJ1Y3R1cmUsXG4gIGZvcm1hdEVycm9yTWVzc2FnZSxcbiAgZm9ybWF0VGltZSxcbiAgb2JzY3VyZVRlbXBsYXRlLFxuICBwYXJ0aXRpb24sXG4gIHNlcmlhbGl6ZVN0cnVjdHVyZSxcbiAgdmFsaWRhdGVTbnNUb3BpY0Fybixcbn0gZnJvbSAnLi4vdXRpbCc7XG5pbXBvcnQgeyBjYW5Db2xsZWN0VGVsZW1ldHJ5IH0gZnJvbSAnLi90ZWxlbWV0cnkvY29sbGVjdC10ZWxlbWV0cnknO1xuaW1wb3J0IHsgY2RrQ2xpRXJyb3JOYW1lIH0gZnJvbSAnLi90ZWxlbWV0cnkvZXJyb3InO1xuaW1wb3J0IHsgQ0xJX1BSSVZBVEVfU1BBTiB9IGZyb20gJy4vdGVsZW1ldHJ5L21lc3NhZ2VzJztcbmltcG9ydCB0eXBlIHsgRXJyb3JEZXRhaWxzIH0gZnJvbSAnLi90ZWxlbWV0cnkvc2NoZW1hJztcblxuLy8gTXVzdCB1c2UgYSByZXF1aXJlKCkgb3RoZXJ3aXNlIGVzYnVpbGQgY29tcGxhaW5zIGFib3V0IGNhbGxpbmcgYSBuYW1lc3BhY2Vcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tcmVxdWlyZS1pbXBvcnRzLEB0eXBlc2NyaXB0LWVzbGludC9jb25zaXN0ZW50LXR5cGUtaW1wb3J0c1xuY29uc3QgcExpbWl0OiB0eXBlb2YgaW1wb3J0KCdwLWxpbWl0JykgPSByZXF1aXJlKCdwLWxpbWl0Jyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2RrVG9vbGtpdFByb3BzIHtcbiAgLyoqXG4gICAqIFRoZSBDbG91ZCBFeGVjdXRhYmxlXG4gICAqL1xuICBjbG91ZEV4ZWN1dGFibGU6IENsb3VkRXhlY3V0YWJsZTtcblxuICAvKipcbiAgICogVGhlIHByb3Zpc2lvbmluZyBlbmdpbmUgdXNlZCB0byBhcHBseSBjaGFuZ2VzIHRvIHRoZSBjbG91ZFxuICAgKi9cbiAgZGVwbG95bWVudHM6IERlcGxveW1lbnRzO1xuXG4gIC8qKlxuICAgKiBUaGUgQ2xpSW9Ib3N0IHRoYXQncyB1c2VkIGZvciBJL08gb3BlcmF0aW9uc1xuICAgKi9cbiAgaW9Ib3N0PzogQ2xpSW9Ib3N0O1xuXG4gIC8qKlxuICAgKiBOYW1lIG9mIHRoZSB0b29sa2l0IHN0YWNrIHRvIHVzZS9kZXBsb3lcbiAgICpcbiAgICogQGRlZmF1bHQgQ0RLVG9vbGtpdFxuICAgKi9cbiAgdG9vbGtpdFN0YWNrTmFtZT86IHN0cmluZztcblxuICAvKipcbiAgICogV2hldGhlciB0byBiZSB2ZXJib3NlXG4gICAqXG4gICAqIEBkZWZhdWx0IGZhbHNlXG4gICAqL1xuICB2ZXJib3NlPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogRG9uJ3Qgc3RvcCBvbiBlcnJvciBtZXRhZGF0YVxuICAgKlxuICAgKiBAZGVmYXVsdCBmYWxzZVxuICAgKi9cbiAgaWdub3JlRXJyb3JzPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogVHJlYXQgd2FybmluZ3MgaW4gbWV0YWRhdGEgYXMgZXJyb3JzXG4gICAqXG4gICAqIEBkZWZhdWx0IGZhbHNlXG4gICAqL1xuICBzdHJpY3Q/OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBBcHBsaWNhdGlvbiBjb25maWd1cmF0aW9uIChzZXR0aW5ncyBhbmQgY29udGV4dClcbiAgICovXG4gIGNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb247XG5cbiAgLyoqXG4gICAqIEFXUyBvYmplY3QgKHVzZWQgYnkgc3ludGhlc2l6ZXIgYW5kIGNvbnRleHRwcm92aWRlcilcbiAgICovXG4gIHNka1Byb3ZpZGVyOiBTZGtQcm92aWRlcjtcbn1cblxuLyoqXG4gKiBXaGVuIHRvIGJ1aWxkIGFzc2V0c1xuICovXG5leHBvcnQgZW51bSBBc3NldEJ1aWxkVGltZSB7XG4gIC8qKlxuICAgKiBCdWlsZCBhbGwgYXNzZXRzIGJlZm9yZSBkZXBsb3lpbmcgdGhlIGZpcnN0IHN0YWNrXG4gICAqXG4gICAqIFRoaXMgaXMgaW50ZW5kZWQgZm9yIGV4cGVuc2l2ZSBEb2NrZXIgaW1hZ2UgYnVpbGRzOyBzbyB0aGF0IGlmIHRoZSBEb2NrZXIgaW1hZ2UgYnVpbGRcbiAgICogZmFpbHMsIG5vIHN0YWNrcyBhcmUgdW5uZWNlc3NhcmlseSBkZXBsb3llZCAod2l0aCB0aGUgYXR0ZW5kYW50IHdhaXQgdGltZSkuXG4gICAqL1xuICBBTExfQkVGT1JFX0RFUExPWSA9ICdhbGwtYmVmb3JlLWRlcGxveScsXG5cbiAgLyoqXG4gICAqIEJ1aWxkIGFzc2V0cyBqdXN0LWluLXRpbWUsIGJlZm9yZSBwdWJsaXNoaW5nXG4gICAqL1xuICBKVVNUX0lOX1RJTUUgPSAnanVzdC1pbi10aW1lJyxcbn1cblxuLyoqXG4gKiBDdXN0b20gaW1wbGVtZW50YXRpb24gb2YgdGhlIHB1YmxpYyBUb29sa2l0IHRvIGludGVncmF0ZSB3aXRoIHRoZSBsZWdhY3kgQ2RrVG9vbGtpdFxuICpcbiAqIFRoaXMgb3ZlcndyaXRlcyBob3cgYW4gc2RrUHJvdmlkZXIgaXMgYWNxdWlyZWRcbiAqIGluIGZhdm9yIG9mIHRoZSBvbmUgcHJvdmlkZWQgZGlyZWN0bHkgdG8gQ2RrVG9vbGtpdC5cbiAqL1xuY2xhc3MgSW50ZXJuYWxUb29sa2l0IGV4dGVuZHMgVG9vbGtpdCB7XG4gIHByaXZhdGUgcmVhZG9ubHkgX3Nka1Byb3ZpZGVyOiBTZGtQcm92aWRlcjtcbiAgcHVibGljIGNvbnN0cnVjdG9yKHNka1Byb3ZpZGVyOiBTZGtQcm92aWRlciwgb3B0aW9uczogT21pdDxUb29sa2l0T3B0aW9ucywgJ3Nka0NvbmZpZyc+KSB7XG4gICAgc3VwZXIob3B0aW9ucyk7XG4gICAgdGhpcy5fc2RrUHJvdmlkZXIgPSBzZGtQcm92aWRlcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBBY2Nlc3MgdG8gdGhlIEFXUyBTREtcbiAgICogQGludGVybmFsXG4gICAqL1xuICBwcm90ZWN0ZWQgYXN5bmMgc2RrUHJvdmlkZXIoX2FjdGlvbjogVG9vbGtpdEFjdGlvbik6IFByb21pc2U8U2RrUHJvdmlkZXI+IHtcbiAgICByZXR1cm4gdGhpcy5fc2RrUHJvdmlkZXI7XG4gIH1cbn1cblxuLyoqXG4gKiBUb29sa2l0IGxvZ2ljXG4gKlxuICogVGhlIHRvb2xraXQgcnVucyB0aGUgYGNsb3VkRXhlY3V0YWJsZWAgdG8gb2J0YWluIGEgY2xvdWQgYXNzZW1ibHkgYW5kXG4gKiBkZXBsb3lzIGFwcGxpZXMgdGhlbSB0byBgY2xvdWRGb3JtYXRpb25gLlxuICovXG5leHBvcnQgY2xhc3MgQ2RrVG9vbGtpdCB7XG4gIHByaXZhdGUgaW9Ib3N0OiBDbGlJb0hvc3Q7XG4gIHByaXZhdGUgdG9vbGtpdFN0YWNrTmFtZTogc3RyaW5nO1xuICBwcml2YXRlIHRvb2xraXQ6IEludGVybmFsVG9vbGtpdDtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHByb3BzOiBDZGtUb29sa2l0UHJvcHMpIHtcbiAgICB0aGlzLmlvSG9zdCA9IHByb3BzLmlvSG9zdCA/PyBDbGlJb0hvc3QuaW5zdGFuY2UoKTtcbiAgICB0aGlzLnRvb2xraXRTdGFja05hbWUgPSBwcm9wcy50b29sa2l0U3RhY2tOYW1lID8/IERFRkFVTFRfVE9PTEtJVF9TVEFDS19OQU1FO1xuXG4gICAgdGhpcy50b29sa2l0ID0gbmV3IEludGVybmFsVG9vbGtpdChwcm9wcy5zZGtQcm92aWRlciwge1xuICAgICAgYXNzZW1ibHlGYWlsdXJlQXQ6IHRoaXMudmFsaWRhdGVNZXRhZGF0YUZhaWxBdCgpLFxuICAgICAgY29sb3I6IHRydWUsXG4gICAgICBlbW9qaXM6IHRydWUsXG4gICAgICBpb0hvc3Q6IHRoaXMuaW9Ib3N0LFxuICAgICAgdG9vbGtpdFN0YWNrTmFtZTogdGhpcy50b29sa2l0U3RhY2tOYW1lLFxuICAgICAgdW5zdGFibGVGZWF0dXJlczogWydyZWZhY3RvcicsICdmbGFncyddLFxuICAgIH0pO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIG1ldGFkYXRhKHN0YWNrTmFtZTogc3RyaW5nLCBqc29uOiBib29sZWFuKSB7XG4gICAgY29uc3Qgc3RhY2tzID0gYXdhaXQgdGhpcy5zZWxlY3RTaW5nbGVTdGFja0J5TmFtZShzdGFja05hbWUpO1xuICAgIGF3YWl0IHByaW50U2VyaWFsaXplZE9iamVjdCh0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCksIHN0YWNrcy5maXJzdFN0YWNrLm1hbmlmZXN0Lm1ldGFkYXRhID8/IHt9LCBqc29uKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhY2tub3dsZWRnZShub3RpY2VJZDogc3RyaW5nKSB7XG4gICAgY29uc3QgYWNrcyA9IG5ldyBTZXQodGhpcy5wcm9wcy5jb25maWd1cmF0aW9uLmNvbnRleHQuZ2V0KCdhY2tub3dsZWRnZWQtaXNzdWUtbnVtYmVycycpID8/IFtdKTtcbiAgICBhY2tzLmFkZChOdW1iZXIobm90aWNlSWQpKTtcbiAgICB0aGlzLnByb3BzLmNvbmZpZ3VyYXRpb24uY29udGV4dC5zZXQoJ2Fja25vd2xlZGdlZC1pc3N1ZS1udW1iZXJzJywgQXJyYXkuZnJvbShhY2tzKSk7XG4gICAgYXdhaXQgdGhpcy5wcm9wcy5jb25maWd1cmF0aW9uLnNhdmVDb250ZXh0KCk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY2xpVGVsZW1ldHJ5U3RhdHVzKHZlcnNpb25SZXBvcnRpbmc6IGJvb2xlYW4gPSB0cnVlKSB7XG4gICAgLy8gcmVjcmVhdGUgdGhlIHZlcnNpb24tcmVwb3J0aW5nIHByb3BlcnR5IGluIGFyZ3MgcmF0aGVyIHRoYW4gYnJpbmcgdGhlIGVudGlyZSBhcmdzIG9iamVjdCBvdmVyXG4gICAgY29uc3QgYXJncyA9IHsgWyd2ZXJzaW9uLXJlcG9ydGluZyddOiB2ZXJzaW9uUmVwb3J0aW5nIH07XG4gICAgY29uc3QgY2FuQ29sbGVjdCA9IGNhbkNvbGxlY3RUZWxlbWV0cnkoYXJncywgdGhpcy5wcm9wcy5jb25maWd1cmF0aW9uLmNvbnRleHQpO1xuICAgIGlmIChjYW5Db2xsZWN0KSB7XG4gICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbygnQ0xJIFRlbGVtZXRyeSBpcyBlbmFibGVkLiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL2F3cy9hd3MtY2RrLWNsaS90cmVlL21haW4vcGFja2FnZXMvYXdzLWNkayNjZGstY2xpLXRlbGVtZXRyeSBmb3Igd2F5cyB0byBkaXNhYmxlLicpO1xuICAgIH0gZWxzZSB7XG4gICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbygnQ0xJIFRlbGVtZXRyeSBpcyBkaXNhYmxlZC4gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hd3MvYXdzLWNkay1jbGkvdHJlZS9tYWluL3BhY2thZ2VzL2F3cy1jZGsjY2RrLWNsaS10ZWxlbWV0cnkgZm9yIHdheXMgdG8gZW5hYmxlLicpO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjbGlUZWxlbWV0cnkoZW5hYmxlOiBib29sZWFuKSB7XG4gICAgdGhpcy5wcm9wcy5jb25maWd1cmF0aW9uLmNvbnRleHQuc2V0KCdjbGktdGVsZW1ldHJ5JywgZW5hYmxlKTtcbiAgICBhd2FpdCB0aGlzLnByb3BzLmNvbmZpZ3VyYXRpb24uc2F2ZUNvbnRleHQoKTtcbiAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbyhgVGVsZW1ldHJ5ICR7ZW5hYmxlID8gJ2VuYWJsZWQnIDogJ2Rpc2FibGVkJ31gKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkaWZmKG9wdGlvbnM6IERpZmZPcHRpb25zKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICBjb25zdCBzdGFja3MgPSBhd2FpdCB0aGlzLnNlbGVjdFN0YWNrc0ZvckRpZmYob3B0aW9ucy5zdGFja05hbWVzLCBvcHRpb25zLmV4Y2x1c2l2ZWx5KTtcblxuICAgIGNvbnN0IHN0cmljdCA9ICEhb3B0aW9ucy5zdHJpY3Q7XG4gICAgY29uc3QgY29udGV4dExpbmVzID0gb3B0aW9ucy5jb250ZXh0TGluZXMgfHwgMztcbiAgICBjb25zdCBxdWlldCA9IG9wdGlvbnMucXVpZXQgfHwgZmFsc2U7XG5cbiAgICBsZXQgZGlmZnMgPSAwO1xuICAgIGNvbnN0IHBhcmFtZXRlck1hcCA9IGJ1aWxkUGFyYW1ldGVyTWFwKG9wdGlvbnMucGFyYW1ldGVycyk7XG5cbiAgICBpZiAob3B0aW9ucy50ZW1wbGF0ZVBhdGggIT09IHVuZGVmaW5lZCkge1xuICAgICAgLy8gQ29tcGFyZSBzaW5nbGUgc3RhY2sgYWdhaW5zdCBmaXhlZCB0ZW1wbGF0ZVxuICAgICAgaWYgKHN0YWNrcy5zdGFja0NvdW50ICE9PSAxKSB7XG4gICAgICAgIHRocm93IG5ldyBUb29sa2l0RXJyb3IoXG4gICAgICAgICAgJ0NhbiBvbmx5IHNlbGVjdCBvbmUgc3RhY2sgd2hlbiBjb21wYXJpbmcgdG8gZml4ZWQgdGVtcGxhdGUuIFVzZSAtLWV4Y2x1c2l2ZWx5IHRvIGF2b2lkIHNlbGVjdGluZyBtdWx0aXBsZSBzdGFja3MuJyxcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCEoYXdhaXQgZnMucGF0aEV4aXN0cyhvcHRpb25zLnRlbXBsYXRlUGF0aCkpKSB7XG4gICAgICAgIHRocm93IG5ldyBUb29sa2l0RXJyb3IoYFRoZXJlIGlzIG5vIGZpbGUgYXQgJHtvcHRpb25zLnRlbXBsYXRlUGF0aH1gKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wdGlvbnMuaW1wb3J0RXhpc3RpbmdSZXNvdXJjZXMpIHtcbiAgICAgICAgdGhyb3cgbmV3IFRvb2xraXRFcnJvcihcbiAgICAgICAgICAnQ2FuIG9ubHkgdXNlIC0taW1wb3J0LWV4aXN0aW5nLXJlc291cmNlcyBmbGFnIHdoZW4gY29tcGFyaW5nIGFnYWluc3QgZGVwbG95ZWQgc3RhY2tzLicsXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gZGVzZXJpYWxpemVTdHJ1Y3R1cmUoYXdhaXQgZnMucmVhZEZpbGUob3B0aW9ucy50ZW1wbGF0ZVBhdGgsIHsgZW5jb2Rpbmc6ICdVVEYtOCcgfSkpO1xuICAgICAgY29uc3QgZm9ybWF0dGVyID0gbmV3IERpZmZGb3JtYXR0ZXIoe1xuICAgICAgICB0ZW1wbGF0ZUluZm86IHtcbiAgICAgICAgICBvbGRUZW1wbGF0ZTogdGVtcGxhdGUsXG4gICAgICAgICAgbmV3VGVtcGxhdGU6IHN0YWNrcy5maXJzdFN0YWNrLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChvcHRpb25zLnNlY3VyaXR5T25seSkge1xuICAgICAgICBjb25zdCBzZWN1cml0eURpZmYgPSBmb3JtYXR0ZXIuZm9ybWF0U2VjdXJpdHlEaWZmKCk7XG4gICAgICAgIC8vIFdhcm4sIGNvdW50LCBhbmQgZGlzcGxheSB0aGUgZGlmZiBvbmx5IGlmIHRoZSByZXBvcnRlZCBjaGFuZ2VzIGFyZSBicm9hZGVuaW5nIHBlcm1pc3Npb25zXG4gICAgICAgIGlmIChzZWN1cml0eURpZmYucGVybWlzc2lvbkNoYW5nZVR5cGUgPT09IFBlcm1pc3Npb25DaGFuZ2VUeXBlLkJST0FERU5JTkcpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMud2FybignVGhpcyBkZXBsb3ltZW50IHdpbGwgbWFrZSBwb3RlbnRpYWxseSBzZW5zaXRpdmUgY2hhbmdlcyBhY2NvcmRpbmcgdG8geW91ciBjdXJyZW50IHNlY3VyaXR5IGFwcHJvdmFsIGxldmVsLlxcblBsZWFzZSBjb25maXJtIHlvdSBpbnRlbmQgdG8gbWFrZSB0aGUgZm9sbG93aW5nIG1vZGlmaWNhdGlvbnM6XFxuJyk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmluZm8oc2VjdXJpdHlEaWZmLmZvcm1hdHRlZERpZmYpO1xuICAgICAgICAgIGRpZmZzICs9IDE7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IGRpZmYgPSBmb3JtYXR0ZXIuZm9ybWF0U3RhY2tEaWZmKHtcbiAgICAgICAgICBzdHJpY3QsXG4gICAgICAgICAgY29udGV4dExpbmVzLFxuICAgICAgICAgIHF1aWV0LFxuICAgICAgICB9KTtcbiAgICAgICAgZGlmZnMgPSBkaWZmLm51bVN0YWNrc1dpdGhDaGFuZ2VzO1xuICAgICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbyhkaWZmLmZvcm1hdHRlZERpZmYpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBhbGxNYXBwaW5ncyA9IG9wdGlvbnMuaW5jbHVkZU1vdmVzXG4gICAgICAgID8gYXdhaXQgbWFwcGluZ3NCeUVudmlyb25tZW50KHN0YWNrcy5zdGFja0FydGlmYWN0cywgdGhpcy5wcm9wcy5zZGtQcm92aWRlciwgdHJ1ZSlcbiAgICAgICAgOiBbXTtcblxuICAgICAgLy8gQ29tcGFyZSBOIHN0YWNrcyBhZ2FpbnN0IGRlcGxveWVkIHRlbXBsYXRlc1xuICAgICAgZm9yIChjb25zdCBzdGFjayBvZiBzdGFja3Muc3RhY2tBcnRpZmFjdHMpIHtcbiAgICAgICAgY29uc3QgdGVtcGxhdGVXaXRoTmVzdGVkU3RhY2tzID0gYXdhaXQgdGhpcy5wcm9wcy5kZXBsb3ltZW50cy5yZWFkQ3VycmVudFRlbXBsYXRlV2l0aE5lc3RlZFN0YWNrcyhcbiAgICAgICAgICBzdGFjayxcbiAgICAgICAgICBvcHRpb25zLmNvbXBhcmVBZ2FpbnN0UHJvY2Vzc2VkVGVtcGxhdGUsXG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRUZW1wbGF0ZSA9IHRlbXBsYXRlV2l0aE5lc3RlZFN0YWNrcy5kZXBsb3llZFJvb3RUZW1wbGF0ZTtcbiAgICAgICAgY29uc3QgbmVzdGVkU3RhY2tzID0gdGVtcGxhdGVXaXRoTmVzdGVkU3RhY2tzLm5lc3RlZFN0YWNrcztcblxuICAgICAgICBjb25zdCBtaWdyYXRvciA9IG5ldyBSZXNvdXJjZU1pZ3JhdG9yKHtcbiAgICAgICAgICBkZXBsb3ltZW50czogdGhpcy5wcm9wcy5kZXBsb3ltZW50cyxcbiAgICAgICAgICBpb0hlbHBlcjogYXNJb0hlbHBlcih0aGlzLmlvSG9zdCwgJ2RpZmYnKSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IHJlc291cmNlc1RvSW1wb3J0ID0gYXdhaXQgbWlncmF0b3IudHJ5R2V0UmVzb3VyY2VzKGF3YWl0IHRoaXMucHJvcHMuZGVwbG95bWVudHMucmVzb2x2ZUVudmlyb25tZW50KHN0YWNrKSk7XG4gICAgICAgIGlmIChyZXNvdXJjZXNUb0ltcG9ydCkge1xuICAgICAgICAgIHJlbW92ZU5vbkltcG9ydFJlc291cmNlcyhzdGFjayk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgY2hhbmdlU2V0ID0gdW5kZWZpbmVkO1xuXG4gICAgICAgIGlmIChvcHRpb25zLmNoYW5nZVNldCkge1xuICAgICAgICAgIGxldCBzdGFja0V4aXN0cyA9IGZhbHNlO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBzdGFja0V4aXN0cyA9IGF3YWl0IHRoaXMucHJvcHMuZGVwbG95bWVudHMuc3RhY2tFeGlzdHMoe1xuICAgICAgICAgICAgICBzdGFjayxcbiAgICAgICAgICAgICAgZGVwbG95TmFtZTogc3RhY2suc3RhY2tOYW1lLFxuICAgICAgICAgICAgICB0cnlMb29rdXBSb2xlOiB0cnVlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuZGVidWcoZm9ybWF0RXJyb3JNZXNzYWdlKGUpKTtcbiAgICAgICAgICAgIGlmICghcXVpZXQpIHtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmluZm8oXG4gICAgICAgICAgICAgICAgYENoZWNraW5nIGlmIHRoZSBzdGFjayAke3N0YWNrLnN0YWNrTmFtZX0gZXhpc3RzIGJlZm9yZSBjcmVhdGluZyB0aGUgY2hhbmdlc2V0IGhhcyBmYWlsZWQsIHdpbGwgYmFzZSB0aGUgZGlmZiBvbiB0ZW1wbGF0ZSBkaWZmZXJlbmNlcyAocnVuIGFnYWluIHdpdGggLXYgdG8gc2VlIHRoZSByZWFzb24pXFxuYCxcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHN0YWNrRXhpc3RzID0gZmFsc2U7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHN0YWNrRXhpc3RzKSB7XG4gICAgICAgICAgICBjaGFuZ2VTZXQgPSBhd2FpdCBjZm5BcGkuY3JlYXRlRGlmZkNoYW5nZVNldChhc0lvSGVscGVyKHRoaXMuaW9Ib3N0LCAnZGlmZicpLCB7XG4gICAgICAgICAgICAgIHN0YWNrLFxuICAgICAgICAgICAgICB1dWlkOiB1dWlkLnY0KCksXG4gICAgICAgICAgICAgIGRlcGxveW1lbnRzOiB0aGlzLnByb3BzLmRlcGxveW1lbnRzLFxuICAgICAgICAgICAgICB3aWxsRXhlY3V0ZTogZmFsc2UsXG4gICAgICAgICAgICAgIHNka1Byb3ZpZGVyOiB0aGlzLnByb3BzLnNka1Byb3ZpZGVyLFxuICAgICAgICAgICAgICBwYXJhbWV0ZXJzOiBPYmplY3QuYXNzaWduKHt9LCBwYXJhbWV0ZXJNYXBbJyonXSwgcGFyYW1ldGVyTWFwW3N0YWNrLnN0YWNrTmFtZV0pLFxuICAgICAgICAgICAgICByZXNvdXJjZXNUb0ltcG9ydCxcbiAgICAgICAgICAgICAgaW1wb3J0RXhpc3RpbmdSZXNvdXJjZXM6IG9wdGlvbnMuaW1wb3J0RXhpc3RpbmdSZXNvdXJjZXMsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmRlYnVnKFxuICAgICAgICAgICAgICBgdGhlIHN0YWNrICcke3N0YWNrLnN0YWNrTmFtZX0nIGhhcyBub3QgYmVlbiBkZXBsb3llZCB0byBDbG91ZEZvcm1hdGlvbiBvciBkZXNjcmliZVN0YWNrcyBjYWxsIGZhaWxlZCwgc2tpcHBpbmcgY2hhbmdlc2V0IGNyZWF0aW9uLmAsXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IG1hcHBpbmdzID0gYWxsTWFwcGluZ3MuZmluZChtID0+XG4gICAgICAgICAgbS5lbnZpcm9ubWVudC5yZWdpb24gPT09IHN0YWNrLmVudmlyb25tZW50LnJlZ2lvbiAmJiBtLmVudmlyb25tZW50LmFjY291bnQgPT09IHN0YWNrLmVudmlyb25tZW50LmFjY291bnQsXG4gICAgICAgICk/Lm1hcHBpbmdzID8/IHt9O1xuXG4gICAgICAgIGNvbnN0IGZvcm1hdHRlciA9IG5ldyBEaWZmRm9ybWF0dGVyKHtcbiAgICAgICAgICB0ZW1wbGF0ZUluZm86IHtcbiAgICAgICAgICAgIG9sZFRlbXBsYXRlOiBjdXJyZW50VGVtcGxhdGUsXG4gICAgICAgICAgICBuZXdUZW1wbGF0ZTogc3RhY2ssXG4gICAgICAgICAgICBjaGFuZ2VTZXQsXG4gICAgICAgICAgICBpc0ltcG9ydDogISFyZXNvdXJjZXNUb0ltcG9ydCxcbiAgICAgICAgICAgIG5lc3RlZFN0YWNrcyxcbiAgICAgICAgICAgIG1hcHBpbmdzLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChvcHRpb25zLnNlY3VyaXR5T25seSkge1xuICAgICAgICAgIGNvbnN0IHNlY3VyaXR5RGlmZiA9IGZvcm1hdHRlci5mb3JtYXRTZWN1cml0eURpZmYoKTtcbiAgICAgICAgICAvLyBXYXJuLCBjb3VudCwgYW5kIGRpc3BsYXkgdGhlIGRpZmYgb25seSBpZiB0aGUgcmVwb3J0ZWQgY2hhbmdlcyBhcmUgYnJvYWRlbmluZyBwZXJtaXNzaW9uc1xuICAgICAgICAgIGlmIChzZWN1cml0eURpZmYucGVybWlzc2lvbkNoYW5nZVR5cGUgPT09IFBlcm1pc3Npb25DaGFuZ2VUeXBlLkJST0FERU5JTkcpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy53YXJuKCdUaGlzIGRlcGxveW1lbnQgd2lsbCBtYWtlIHBvdGVudGlhbGx5IHNlbnNpdGl2ZSBjaGFuZ2VzIGFjY29yZGluZyB0byB5b3VyIGN1cnJlbnQgc2VjdXJpdHkgYXBwcm92YWwgbGV2ZWwuXFxuUGxlYXNlIGNvbmZpcm0geW91IGludGVuZCB0byBtYWtlIHRoZSBmb2xsb3dpbmcgbW9kaWZpY2F0aW9uczpcXG4nKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy5pbmZvKHNlY3VyaXR5RGlmZi5mb3JtYXR0ZWREaWZmKTtcbiAgICAgICAgICAgIGRpZmZzICs9IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IGRpZmYgPSBmb3JtYXR0ZXIuZm9ybWF0U3RhY2tEaWZmKHtcbiAgICAgICAgICAgIHN0cmljdCxcbiAgICAgICAgICAgIGNvbnRleHRMaW5lcyxcbiAgICAgICAgICAgIHF1aWV0LFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy5pbmZvKGRpZmYuZm9ybWF0dGVkRGlmZik7XG4gICAgICAgICAgZGlmZnMgKz0gZGlmZi5udW1TdGFja3NXaXRoQ2hhbmdlcztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy5pbmZvKGZvcm1hdCgnXFxu4pyoICBOdW1iZXIgb2Ygc3RhY2tzIHdpdGggZGlmZmVyZW5jZXM6ICVzXFxuJywgZGlmZnMpKTtcblxuICAgIHJldHVybiBkaWZmcyAmJiBvcHRpb25zLmZhaWwgPyAxIDogMDtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBkZXBsb3kob3B0aW9uczogRGVwbG95T3B0aW9ucykge1xuICAgIGlmIChvcHRpb25zLndhdGNoKSB7XG4gICAgICByZXR1cm4gdGhpcy53YXRjaChvcHRpb25zKTtcbiAgICB9XG5cbiAgICAvLyBzZXQgcHJvZ3Jlc3MgZnJvbSBvcHRpb25zLCB0aGlzIGluY2x1ZGVzIHVzZXIgYW5kIGFwcCBjb25maWdcbiAgICBpZiAob3B0aW9ucy5wcm9ncmVzcykge1xuICAgICAgdGhpcy5pb0hvc3Quc3RhY2tQcm9ncmVzcyA9IG9wdGlvbnMucHJvZ3Jlc3M7XG4gICAgfVxuXG4gICAgY29uc3Qgc3RhcnRTeW50aFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICBjb25zdCBzdGFja0NvbGxlY3Rpb24gPSBhd2FpdCB0aGlzLnNlbGVjdFN0YWNrc0ZvckRlcGxveShcbiAgICAgIG9wdGlvbnMuc2VsZWN0b3IsXG4gICAgICBvcHRpb25zLmV4Y2x1c2l2ZWx5LFxuICAgICAgb3B0aW9ucy5jYWNoZUNsb3VkQXNzZW1ibHksXG4gICAgICBvcHRpb25zLmlnbm9yZU5vU3RhY2tzLFxuICAgICk7XG4gICAgY29uc3QgZWxhcHNlZFN5bnRoVGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gc3RhcnRTeW50aFRpbWU7XG4gICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmluZm8oYFxcbuKcqCAgU3ludGhlc2lzIHRpbWU6ICR7Zm9ybWF0VGltZShlbGFwc2VkU3ludGhUaW1lKX1zXFxuYCk7XG5cbiAgICBpZiAoc3RhY2tDb2xsZWN0aW9uLnN0YWNrQ291bnQgPT09IDApIHtcbiAgICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy5lcnJvcignVGhpcyBhcHAgY29udGFpbnMgbm8gc3RhY2tzJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgbWlncmF0b3IgPSBuZXcgUmVzb3VyY2VNaWdyYXRvcih7XG4gICAgICBkZXBsb3ltZW50czogdGhpcy5wcm9wcy5kZXBsb3ltZW50cyxcbiAgICAgIGlvSGVscGVyOiBhc0lvSGVscGVyKHRoaXMuaW9Ib3N0LCAnZGVwbG95JyksXG4gICAgfSk7XG4gICAgYXdhaXQgbWlncmF0b3IudHJ5TWlncmF0ZVJlc291cmNlcyhzdGFja0NvbGxlY3Rpb24sIHtcbiAgICAgIHRvb2xraXRTdGFja05hbWU6IHRoaXMudG9vbGtpdFN0YWNrTmFtZSxcbiAgICAgIC4uLm9wdGlvbnMsXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXF1aXJlQXBwcm92YWwgPSBvcHRpb25zLnJlcXVpcmVBcHByb3ZhbCA/PyBSZXF1aXJlQXBwcm92YWwuQlJPQURFTklORztcblxuICAgIGNvbnN0IHBhcmFtZXRlck1hcCA9IGJ1aWxkUGFyYW1ldGVyTWFwKG9wdGlvbnMucGFyYW1ldGVycyk7XG5cbiAgICBpZiAob3B0aW9ucy5kZXBsb3ltZW50TWV0aG9kPy5tZXRob2QgPT09ICdob3Rzd2FwJykge1xuICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLndhcm4oXG4gICAgICAgICfimqDvuI8gVGhlIC0taG90c3dhcCBhbmQgLS1ob3Rzd2FwLWZhbGxiYWNrIGZsYWdzIGRlbGliZXJhdGVseSBpbnRyb2R1Y2UgQ2xvdWRGb3JtYXRpb24gZHJpZnQgdG8gc3BlZWQgdXAgZGVwbG95bWVudHMnLFxuICAgICAgKTtcbiAgICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy53YXJuKCfimqDvuI8gVGhleSBzaG91bGQgb25seSBiZSB1c2VkIGZvciBkZXZlbG9wbWVudCAtIG5ldmVyIHVzZSB0aGVtIGZvciB5b3VyIHByb2R1Y3Rpb24gU3RhY2tzIVxcbicpO1xuICAgIH1cblxuICAgIGNvbnN0IHN0YWNrcyA9IHN0YWNrQ29sbGVjdGlvbi5zdGFja0FydGlmYWN0cztcblxuICAgIGNvbnN0IHN0YWNrT3V0cHV0czogeyBba2V5OiBzdHJpbmddOiBhbnkgfSA9IHt9O1xuICAgIGNvbnN0IG91dHB1dHNGaWxlID0gb3B0aW9ucy5vdXRwdXRzRmlsZTtcblxuICAgIGNvbnN0IGJ1aWxkQXNzZXQgPSBhc3luYyAoYXNzZXROb2RlOiBBc3NldEJ1aWxkTm9kZSkgPT4ge1xuICAgICAgYXdhaXQgdGhpcy5wcm9wcy5kZXBsb3ltZW50cy5idWlsZFNpbmdsZUFzc2V0KFxuICAgICAgICBhc3NldE5vZGUuYXNzZXRNYW5pZmVzdEFydGlmYWN0LFxuICAgICAgICBhc3NldE5vZGUuYXNzZXRNYW5pZmVzdCxcbiAgICAgICAgYXNzZXROb2RlLmFzc2V0LFxuICAgICAgICB7XG4gICAgICAgICAgc3RhY2s6IGFzc2V0Tm9kZS5wYXJlbnRTdGFjayxcbiAgICAgICAgICByb2xlQXJuOiBvcHRpb25zLnJvbGVBcm4sXG4gICAgICAgICAgc3RhY2tOYW1lOiBhc3NldE5vZGUucGFyZW50U3RhY2suc3RhY2tOYW1lLFxuICAgICAgICB9LFxuICAgICAgKTtcbiAgICB9O1xuXG4gICAgY29uc3QgcHVibGlzaEFzc2V0ID0gYXN5bmMgKGFzc2V0Tm9kZTogQXNzZXRQdWJsaXNoTm9kZSkgPT4ge1xuICAgICAgYXdhaXQgdGhpcy5wcm9wcy5kZXBsb3ltZW50cy5wdWJsaXNoU2luZ2xlQXNzZXQoYXNzZXROb2RlLmFzc2V0TWFuaWZlc3QsIGFzc2V0Tm9kZS5hc3NldCwge1xuICAgICAgICBzdGFjazogYXNzZXROb2RlLnBhcmVudFN0YWNrLFxuICAgICAgICByb2xlQXJuOiBvcHRpb25zLnJvbGVBcm4sXG4gICAgICAgIHN0YWNrTmFtZTogYXNzZXROb2RlLnBhcmVudFN0YWNrLnN0YWNrTmFtZSxcbiAgICAgICAgZm9yY2VQdWJsaXNoOiBvcHRpb25zLmZvcmNlLFxuICAgICAgfSk7XG4gICAgfTtcblxuICAgIGNvbnN0IGRlcGxveVN0YWNrID0gYXN5bmMgKHN0YWNrTm9kZTogU3RhY2tOb2RlKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IHN0YWNrTm9kZS5zdGFjaztcbiAgICAgIGlmIChzdGFja0NvbGxlY3Rpb24uc3RhY2tDb3VudCAhPT0gMSkge1xuICAgICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbyhjaGFsay5ib2xkKHN0YWNrLmRpc3BsYXlOYW1lKSk7XG4gICAgICB9XG5cbiAgICAgIGlmICghc3RhY2suZW52aXJvbm1lbnQpIHtcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEBzdHlsaXN0aWMvbWF4LWxlblxuICAgICAgICB0aHJvdyBuZXcgVG9vbGtpdEVycm9yKFxuICAgICAgICAgIGBTdGFjayAke3N0YWNrLmRpc3BsYXlOYW1lfSBkb2VzIG5vdCBkZWZpbmUgYW4gZW52aXJvbm1lbnQsIGFuZCBBV1MgY3JlZGVudGlhbHMgY291bGQgbm90IGJlIG9idGFpbmVkIGZyb20gc3RhbmRhcmQgbG9jYXRpb25zIG9yIG5vIHJlZ2lvbiB3YXMgY29uZmlndXJlZC5gLFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBpZiAoT2JqZWN0LmtleXMoc3RhY2sudGVtcGxhdGUuUmVzb3VyY2VzIHx8IHt9KS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgLy8gVGhlIGdlbmVyYXRlZCBzdGFjayBoYXMgbm8gcmVzb3VyY2VzXG4gICAgICAgIGlmICghKGF3YWl0IHRoaXMucHJvcHMuZGVwbG95bWVudHMuc3RhY2tFeGlzdHMoeyBzdGFjayB9KSkpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMud2FybignJXM6IHN0YWNrIGhhcyBubyByZXNvdXJjZXMsIHNraXBwaW5nIGRlcGxveW1lbnQuJywgY2hhbGsuYm9sZChzdGFjay5kaXNwbGF5TmFtZSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy53YXJuKCclczogc3RhY2sgaGFzIG5vIHJlc291cmNlcywgZGVsZXRpbmcgZXhpc3Rpbmcgc3RhY2suJywgY2hhbGsuYm9sZChzdGFjay5kaXNwbGF5TmFtZSkpO1xuICAgICAgICAgIGF3YWl0IHRoaXMuZGVzdHJveSh7XG4gICAgICAgICAgICBzZWxlY3RvcjogeyBwYXR0ZXJuczogW3N0YWNrLmhpZXJhcmNoaWNhbElkXSB9LFxuICAgICAgICAgICAgZXhjbHVzaXZlbHk6IHRydWUsXG4gICAgICAgICAgICBmb3JjZTogdHJ1ZSxcbiAgICAgICAgICAgIHJvbGVBcm46IG9wdGlvbnMucm9sZUFybixcbiAgICAgICAgICAgIGZyb21EZXBsb3k6IHRydWUsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxdWlyZUFwcHJvdmFsICE9PSBSZXF1aXJlQXBwcm92YWwuTkVWRVIpIHtcbiAgICAgICAgY29uc3QgY3VycmVudFRlbXBsYXRlID0gYXdhaXQgdGhpcy5wcm9wcy5kZXBsb3ltZW50cy5yZWFkQ3VycmVudFRlbXBsYXRlKHN0YWNrKTtcbiAgICAgICAgY29uc3QgZm9ybWF0dGVyID0gbmV3IERpZmZGb3JtYXR0ZXIoe1xuICAgICAgICAgIHRlbXBsYXRlSW5mbzoge1xuICAgICAgICAgICAgb2xkVGVtcGxhdGU6IGN1cnJlbnRUZW1wbGF0ZSxcbiAgICAgICAgICAgIG5ld1RlbXBsYXRlOiBzdGFjayxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3Qgc2VjdXJpdHlEaWZmID0gZm9ybWF0dGVyLmZvcm1hdFNlY3VyaXR5RGlmZigpO1xuICAgICAgICBpZiAocmVxdWlyZXNBcHByb3ZhbChyZXF1aXJlQXBwcm92YWwsIHNlY3VyaXR5RGlmZi5wZXJtaXNzaW9uQ2hhbmdlVHlwZSkpIHtcbiAgICAgICAgICBjb25zdCBtb3RpdmF0aW9uID0gJ1wiLS1yZXF1aXJlLWFwcHJvdmFsXCIgaXMgZW5hYmxlZCBhbmQgc3RhY2sgaW5jbHVkZXMgc2VjdXJpdHktc2Vuc2l0aXZlIHVwZGF0ZXMnO1xuICAgICAgICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy5pbmZvKHNlY3VyaXR5RGlmZi5mb3JtYXR0ZWREaWZmKTtcbiAgICAgICAgICBhd2FpdCBhc2tVc2VyQ29uZmlybWF0aW9uKFxuICAgICAgICAgICAgdGhpcy5pb0hvc3QsXG4gICAgICAgICAgICBJTy5DREtfVE9PTEtJVF9JNTA2MC5yZXEoYCR7bW90aXZhdGlvbn06ICdEbyB5b3Ugd2lzaCB0byBkZXBsb3kgdGhlc2UgY2hhbmdlcydgLCB7XG4gICAgICAgICAgICAgIG1vdGl2YXRpb24sXG4gICAgICAgICAgICAgIGNvbmN1cnJlbmN5LFxuICAgICAgICAgICAgICBwZXJtaXNzaW9uQ2hhbmdlVHlwZTogc2VjdXJpdHlEaWZmLnBlcm1pc3Npb25DaGFuZ2VUeXBlLFxuICAgICAgICAgICAgICB0ZW1wbGF0ZURpZmZzOiBmb3JtYXR0ZXIuZGlmZnMsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIEZvbGxvd2luZyBhcmUgdGhlIHNhbWUgc2VtYW50aWNzIHdlIGFwcGx5IHdpdGggcmVzcGVjdCB0byBOb3RpZmljYXRpb24gQVJOcyAoZGljdGF0ZWQgYnkgdGhlIFNESylcbiAgICAgIC8vXG4gICAgICAvLyAgLSB1bmRlZmluZWQgID0+ICBjZGsgaWdub3JlcyBpdCwgYXMgaWYgaXQgd2Fzbid0IHN1cHBvcnRlZCAoYWxsb3dzIGV4dGVybmFsIG1hbmFnZW1lbnQpLlxuICAgICAgLy8gIC0gW106ICAgICAgICA9PiAgY2RrIG1hbmFnZXMgaXQsIGFuZCB0aGUgdXNlciB3YW50cyB0byB3aXBlIGl0IG91dC5cbiAgICAgIC8vICAtIFsnYXJuLTEnXSAgPT4gIGNkayBtYW5hZ2VzIGl0LCBhbmQgdGhlIHVzZXIgd2FudHMgdG8gc2V0IGl0IHRvIFsnYXJuLTEnXS5cbiAgICAgIGNvbnN0IG5vdGlmaWNhdGlvbkFybnMgPSAoISFvcHRpb25zLm5vdGlmaWNhdGlvbkFybnMgfHwgISFzdGFjay5ub3RpZmljYXRpb25Bcm5zKVxuICAgICAgICA/IChvcHRpb25zLm5vdGlmaWNhdGlvbkFybnMgPz8gW10pLmNvbmNhdChzdGFjay5ub3RpZmljYXRpb25Bcm5zID8/IFtdKVxuICAgICAgICA6IHVuZGVmaW5lZDtcblxuICAgICAgZm9yIChjb25zdCBub3RpZmljYXRpb25Bcm4gb2Ygbm90aWZpY2F0aW9uQXJucyA/PyBbXSkge1xuICAgICAgICBpZiAoIXZhbGlkYXRlU25zVG9waWNBcm4obm90aWZpY2F0aW9uQXJuKSkge1xuICAgICAgICAgIHRocm93IG5ldyBUb29sa2l0RXJyb3IoYE5vdGlmaWNhdGlvbiBhcm4gJHtub3RpZmljYXRpb25Bcm59IGlzIG5vdCBhIHZhbGlkIGFybiBmb3IgYW4gU05TIHRvcGljYCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3Qgc3RhY2tJbmRleCA9IHN0YWNrcy5pbmRleE9mKHN0YWNrKSArIDE7XG4gICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbyhgJHtjaGFsay5ib2xkKHN0YWNrLmRpc3BsYXlOYW1lKX06IGRlcGxveWluZy4uLiBbJHtzdGFja0luZGV4fS8ke3N0YWNrQ29sbGVjdGlvbi5zdGFja0NvdW50fV1gKTtcbiAgICAgIGNvbnN0IHN0YXJ0RGVwbG95VGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgbGV0IHRhZ3MgPSBvcHRpb25zLnRhZ3M7XG4gICAgICBpZiAoIXRhZ3MgfHwgdGFncy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgdGFncyA9IHRhZ3NGb3JTdGFjayhzdGFjayk7XG4gICAgICB9XG5cbiAgICAgIC8vIFRoZXJlIGlzIGFscmVhZHkgYSBzdGFydERlcGxveVRpbWUgY29uc3RhbnQsIGJ1dCB0aGF0IGRvZXMgbm90IHdvcmsgd2l0aCB0ZWxlbWV0cnkuXG4gICAgICAvLyBXZSBzaG91bGQgaW50ZWdyYXRlIHRoZSB0d28gaW4gdGhlIGZ1dHVyZVxuICAgICAgY29uc3QgZGVwbG95U3BhbiA9IGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5zcGFuKENMSV9QUklWQVRFX1NQQU4uREVQTE9ZKS5iZWdpbih7fSk7XG4gICAgICBsZXQgZXJyb3I6IEVycm9yRGV0YWlscyB8IHVuZGVmaW5lZDtcbiAgICAgIGxldCBlbGFwc2VkRGVwbG95VGltZSA9IDA7XG4gICAgICB0cnkge1xuICAgICAgICBsZXQgZGVwbG95UmVzdWx0OiBTdWNjZXNzZnVsRGVwbG95U3RhY2tSZXN1bHQgfCB1bmRlZmluZWQ7XG5cbiAgICAgICAgbGV0IHJvbGxiYWNrID0gb3B0aW9ucy5yb2xsYmFjaztcbiAgICAgICAgbGV0IGl0ZXJhdGlvbiA9IDA7XG4gICAgICAgIHdoaWxlICghZGVwbG95UmVzdWx0KSB7XG4gICAgICAgICAgaWYgKCsraXRlcmF0aW9uID4gMikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFRvb2xraXRFcnJvcignVGhpcyBsb29wIHNob3VsZCBoYXZlIHN0YWJpbGl6ZWQgaW4gMiBpdGVyYXRpb25zLCBidXQgZGlkblxcJ3QuIElmIHlvdSBhcmUgc2VlaW5nIHRoaXMgZXJyb3IsIHBsZWFzZSByZXBvcnQgaXQgYXQgaHR0cHM6Ly9naXRodWIuY29tL2F3cy9hd3MtY2RrL2lzc3Vlcy9uZXcvY2hvb3NlJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgciA9IGF3YWl0IHRoaXMucHJvcHMuZGVwbG95bWVudHMuZGVwbG95U3RhY2soe1xuICAgICAgICAgICAgc3RhY2ssXG4gICAgICAgICAgICBkZXBsb3lOYW1lOiBzdGFjay5zdGFja05hbWUsXG4gICAgICAgICAgICByb2xlQXJuOiBvcHRpb25zLnJvbGVBcm4sXG4gICAgICAgICAgICB0b29sa2l0U3RhY2tOYW1lOiBvcHRpb25zLnRvb2xraXRTdGFja05hbWUsXG4gICAgICAgICAgICByZXVzZUFzc2V0czogb3B0aW9ucy5yZXVzZUFzc2V0cyxcbiAgICAgICAgICAgIG5vdGlmaWNhdGlvbkFybnMsXG4gICAgICAgICAgICB0YWdzLFxuICAgICAgICAgICAgZXhlY3V0ZTogb3B0aW9ucy5leGVjdXRlLFxuICAgICAgICAgICAgY2hhbmdlU2V0TmFtZTogb3B0aW9ucy5jaGFuZ2VTZXROYW1lLFxuICAgICAgICAgICAgZGVwbG95bWVudE1ldGhvZDogb3B0aW9ucy5kZXBsb3ltZW50TWV0aG9kLFxuICAgICAgICAgICAgZm9yY2VEZXBsb3ltZW50OiBvcHRpb25zLmZvcmNlLFxuICAgICAgICAgICAgcGFyYW1ldGVyczogT2JqZWN0LmFzc2lnbih7fSwgcGFyYW1ldGVyTWFwWycqJ10sIHBhcmFtZXRlck1hcFtzdGFjay5zdGFja05hbWVdKSxcbiAgICAgICAgICAgIHVzZVByZXZpb3VzUGFyYW1ldGVyczogb3B0aW9ucy51c2VQcmV2aW91c1BhcmFtZXRlcnMsXG4gICAgICAgICAgICByb2xsYmFjayxcbiAgICAgICAgICAgIGV4dHJhVXNlckFnZW50OiBvcHRpb25zLmV4dHJhVXNlckFnZW50LFxuICAgICAgICAgICAgYXNzZXRQYXJhbGxlbGlzbTogb3B0aW9ucy5hc3NldFBhcmFsbGVsaXNtLFxuICAgICAgICAgICAgaWdub3JlTm9TdGFja3M6IG9wdGlvbnMuaWdub3JlTm9TdGFja3MsXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBzd2l0Y2ggKHIudHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnZGlkLWRlcGxveS1zdGFjayc6XG4gICAgICAgICAgICAgIGRlcGxveVJlc3VsdCA9IHI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdmYWlscGF1c2VkLW5lZWQtcm9sbGJhY2stZmlyc3QnOiB7XG4gICAgICAgICAgICAgIGNvbnN0IG1vdGl2YXRpb24gPSByLnJlYXNvbiA9PT0gJ3JlcGxhY2VtZW50J1xuICAgICAgICAgICAgICAgID8gYFN0YWNrIGlzIGluIGEgcGF1c2VkIGZhaWwgc3RhdGUgKCR7ci5zdGF0dXN9KSBhbmQgY2hhbmdlIGluY2x1ZGVzIGEgcmVwbGFjZW1lbnQgd2hpY2ggY2Fubm90IGJlIGRlcGxveWVkIHdpdGggXCItLW5vLXJvbGxiYWNrXCJgXG4gICAgICAgICAgICAgICAgOiBgU3RhY2sgaXMgaW4gYSBwYXVzZWQgZmFpbCBzdGF0ZSAoJHtyLnN0YXR1c30pIGFuZCBjb21tYW5kIGxpbmUgYXJndW1lbnRzIGRvIG5vdCBpbmNsdWRlIFwiLS1uby1yb2xsYmFja1wiYDtcblxuICAgICAgICAgICAgICBpZiAob3B0aW9ucy5mb3JjZSkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy53YXJuKGAke21vdGl2YXRpb259LiBSb2xsaW5nIGJhY2sgZmlyc3QgKC0tZm9yY2UpLmApO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGF3YWl0IGFza1VzZXJDb25maXJtYXRpb24oXG4gICAgICAgICAgICAgICAgICB0aGlzLmlvSG9zdCxcbiAgICAgICAgICAgICAgICAgIElPLkNES19UT09MS0lUX0k1MDUwLnJlcShgJHttb3RpdmF0aW9ufS4gUm9sbCBiYWNrIGZpcnN0IGFuZCB0aGVuIHByb2NlZWQgd2l0aCBkZXBsb3ltZW50YCwge1xuICAgICAgICAgICAgICAgICAgICBtb3RpdmF0aW9uLFxuICAgICAgICAgICAgICAgICAgICBjb25jdXJyZW5jeSxcbiAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLyBQZXJmb3JtIGEgcm9sbGJhY2tcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5yb2xsYmFjayh7XG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IHsgcGF0dGVybnM6IFtzdGFjay5oaWVyYXJjaGljYWxJZF0gfSxcbiAgICAgICAgICAgICAgICB0b29sa2l0U3RhY2tOYW1lOiBvcHRpb25zLnRvb2xraXRTdGFja05hbWUsXG4gICAgICAgICAgICAgICAgZm9yY2U6IG9wdGlvbnMuZm9yY2UsXG4gICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgIC8vIEdvIGFyb3VuZCB0aHJvdWdoIHRoZSAnd2hpbGUnIGxvb3AgYWdhaW4gYnV0IHN3aXRjaCByb2xsYmFjayB0byB0cnVlLlxuICAgICAgICAgICAgICByb2xsYmFjayA9IHRydWU7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjYXNlICdyZXBsYWNlbWVudC1yZXF1aXJlcy1yb2xsYmFjayc6IHtcbiAgICAgICAgICAgICAgY29uc3QgbW90aXZhdGlvbiA9ICdDaGFuZ2UgaW5jbHVkZXMgYSByZXBsYWNlbWVudCB3aGljaCBjYW5ub3QgYmUgZGVwbG95ZWQgd2l0aCBcIi0tbm8tcm9sbGJhY2tcIic7XG5cbiAgICAgICAgICAgICAgaWYgKG9wdGlvbnMuZm9yY2UpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMud2FybihgJHttb3RpdmF0aW9ufS4gUHJvY2VlZGluZyB3aXRoIHJlZ3VsYXIgZGVwbG95bWVudCAoLS1mb3JjZSkuYCk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgYXNrVXNlckNvbmZpcm1hdGlvbihcbiAgICAgICAgICAgICAgICAgIHRoaXMuaW9Ib3N0LFxuICAgICAgICAgICAgICAgICAgSU8uQ0RLX1RPT0xLSVRfSTUwNTAucmVxKGAke21vdGl2YXRpb259LiBQZXJmb3JtIGEgcmVndWxhciBkZXBsb3ltZW50YCwge1xuICAgICAgICAgICAgICAgICAgICBjb25jdXJyZW5jeSxcbiAgICAgICAgICAgICAgICAgICAgbW90aXZhdGlvbixcbiAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLyBHbyBhcm91bmQgdGhyb3VnaCB0aGUgJ3doaWxlJyBsb29wIGFnYWluIGJ1dCBzd2l0Y2ggcm9sbGJhY2sgdG8gdHJ1ZS5cbiAgICAgICAgICAgICAgcm9sbGJhY2sgPSB0cnVlO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFRvb2xraXRFcnJvcihgVW5leHBlY3RlZCByZXN1bHQgdHlwZSBmcm9tIGRlcGxveVN0YWNrOiAke0pTT04uc3RyaW5naWZ5KHIpfS4gSWYgeW91IGFyZSBzZWVpbmcgdGhpcyBlcnJvciwgcGxlYXNlIHJlcG9ydCBpdCBhdCBodHRwczovL2dpdGh1Yi5jb20vYXdzL2F3cy1jZGsvaXNzdWVzL25ldy9jaG9vc2VgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBtZXNzYWdlID0gZGVwbG95UmVzdWx0Lm5vT3BcbiAgICAgICAgICA/ICcg4pyFICAlcyAobm8gY2hhbmdlcyknXG4gICAgICAgICAgOiAnIOKchSAgJXMnO1xuXG4gICAgICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy5pbmZvKGNoYWxrLmdyZWVuKCdcXG4nICsgbWVzc2FnZSksIHN0YWNrLmRpc3BsYXlOYW1lKTtcbiAgICAgICAgZWxhcHNlZERlcGxveVRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIHN0YXJ0RGVwbG95VGltZTtcbiAgICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmluZm8oYFxcbuKcqCAgRGVwbG95bWVudCB0aW1lOiAke2Zvcm1hdFRpbWUoZWxhcHNlZERlcGxveVRpbWUpfXNcXG5gKTtcblxuICAgICAgICBpZiAoT2JqZWN0LmtleXMoZGVwbG95UmVzdWx0Lm91dHB1dHMpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbygnT3V0cHV0czonKTtcblxuICAgICAgICAgIHN0YWNrT3V0cHV0c1tzdGFjay5zdGFja05hbWVdID0gZGVwbG95UmVzdWx0Lm91dHB1dHM7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGNvbnN0IG5hbWUgb2YgT2JqZWN0LmtleXMoZGVwbG95UmVzdWx0Lm91dHB1dHMpLnNvcnQoKSkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gZGVwbG95UmVzdWx0Lm91dHB1dHNbbmFtZV07XG4gICAgICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmluZm8oYCR7Y2hhbGsuY3lhbihzdGFjay5pZCl9LiR7Y2hhbGsuY3lhbihuYW1lKX0gPSAke2NoYWxrLnVuZGVybGluZShjaGFsay5jeWFuKHZhbHVlKSl9YCk7XG4gICAgICAgIH1cblxuICAgICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbygnU3RhY2sgQVJOOicpO1xuXG4gICAgICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy5yZXN1bHQoZGVwbG95UmVzdWx0LnN0YWNrQXJuKTtcbiAgICAgIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgICAgICAvLyBJdCBoYXMgdG8gYmUgZXhhY3RseSB0aGlzIHN0cmluZyBiZWNhdXNlIGFuIGludGVncmF0aW9uIHRlc3QgdGVzdHMgZm9yXG4gICAgICAgIC8vIFwiYm9sZChzdGFja25hbWUpIGZhaWxlZDogUmVzb3VyY2VOb3RSZWFkeTogPGVycm9yPlwiXG4gICAgICAgIGNvbnN0IHdyYXBwZWRFcnJvciA9IG5ldyBUb29sa2l0RXJyb3IoXG4gICAgICAgICAgW2DinYwgICR7Y2hhbGsuYm9sZChzdGFjay5zdGFja05hbWUpfSBmYWlsZWQ6YCwgLi4uKGUubmFtZSA/IFtgJHtlLm5hbWV9OmBdIDogW10pLCBmb3JtYXRFcnJvck1lc3NhZ2UoZSldLmpvaW4oJyAnKSxcbiAgICAgICAgKTtcblxuICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICBuYW1lOiBjZGtDbGlFcnJvck5hbWUod3JhcHBlZEVycm9yLm5hbWUpLFxuICAgICAgICB9O1xuXG4gICAgICAgIHRocm93IHdyYXBwZWRFcnJvcjtcbiAgICAgIH0gZmluYWxseSB7XG4gICAgICAgIGF3YWl0IGRlcGxveVNwYW4uZW5kKHsgZXJyb3IgfSk7XG5cbiAgICAgICAgaWYgKG9wdGlvbnMuY2xvdWRXYXRjaExvZ01vbml0b3IpIHtcbiAgICAgICAgICBjb25zdCBmb3VuZExvZ0dyb3Vwc1Jlc3VsdCA9IGF3YWl0IGZpbmRDbG91ZFdhdGNoTG9nR3JvdXBzKHRoaXMucHJvcHMuc2RrUHJvdmlkZXIsIGFzSW9IZWxwZXIodGhpcy5pb0hvc3QsICdkZXBsb3knKSwgc3RhY2spO1xuICAgICAgICAgIG9wdGlvbnMuY2xvdWRXYXRjaExvZ01vbml0b3IuYWRkTG9nR3JvdXBzKFxuICAgICAgICAgICAgZm91bmRMb2dHcm91cHNSZXN1bHQuZW52LFxuICAgICAgICAgICAgZm91bmRMb2dHcm91cHNSZXN1bHQuc2RrLFxuICAgICAgICAgICAgZm91bmRMb2dHcm91cHNSZXN1bHQubG9nR3JvdXBOYW1lcyxcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIElmIGFuIG91dHB1dHMgZmlsZSBoYXMgYmVlbiBzcGVjaWZpZWQsIGNyZWF0ZSB0aGUgZmlsZSBwYXRoIGFuZCB3cml0ZSBzdGFjayBvdXRwdXRzIHRvIGl0IG9uY2UuXG4gICAgICAgIC8vIE91dHB1dHMgYXJlIHdyaXR0ZW4gYWZ0ZXIgYWxsIHN0YWNrcyBoYXZlIGJlZW4gZGVwbG95ZWQuIElmIGEgc3RhY2sgZGVwbG95bWVudCBmYWlscyxcbiAgICAgICAgLy8gYWxsIG9mIHRoZSBvdXRwdXRzIGZyb20gc3VjY2Vzc2Z1bGx5IGRlcGxveWVkIHN0YWNrcyBiZWZvcmUgdGhlIGZhaWx1cmUgd2lsbCBzdGlsbCBiZSB3cml0dGVuLlxuICAgICAgICBpZiAob3V0cHV0c0ZpbGUpIHtcbiAgICAgICAgICBmcy5lbnN1cmVGaWxlU3luYyhvdXRwdXRzRmlsZSk7XG4gICAgICAgICAgYXdhaXQgZnMud3JpdGVKc29uKG91dHB1dHNGaWxlLCBzdGFja091dHB1dHMsIHtcbiAgICAgICAgICAgIHNwYWNlczogMixcbiAgICAgICAgICAgIGVuY29kaW5nOiAndXRmOCcsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy5pbmZvKGBcXG7inKggIFRvdGFsIHRpbWU6ICR7Zm9ybWF0VGltZShlbGFwc2VkU3ludGhUaW1lICsgZWxhcHNlZERlcGxveVRpbWUpfXNcXG5gKTtcbiAgICB9O1xuXG4gICAgY29uc3QgYXNzZXRCdWlsZFRpbWUgPSBvcHRpb25zLmFzc2V0QnVpbGRUaW1lID8/IEFzc2V0QnVpbGRUaW1lLkFMTF9CRUZPUkVfREVQTE9ZO1xuICAgIGNvbnN0IHByZWJ1aWxkQXNzZXRzID0gYXNzZXRCdWlsZFRpbWUgPT09IEFzc2V0QnVpbGRUaW1lLkFMTF9CRUZPUkVfREVQTE9ZO1xuICAgIGNvbnN0IGNvbmN1cnJlbmN5ID0gb3B0aW9ucy5jb25jdXJyZW5jeSB8fCAxO1xuICAgIGlmIChjb25jdXJyZW5jeSA+IDEpIHtcbiAgICAgIC8vIGFsd2F5cyBmb3JjZSBcImV2ZW50c1wiIHByb2dyZXNzIG91dHB1dCB3aGVuIHdlIGhhdmUgY29uY3VycmVuY3lcbiAgICAgIHRoaXMuaW9Ib3N0LnN0YWNrUHJvZ3Jlc3MgPSBTdGFja0FjdGl2aXR5UHJvZ3Jlc3MuRVZFTlRTO1xuXG4gICAgICAvLyAuLi5idXQgb25seSB3YXJuIGlmIHRoZSB1c2VyIGV4cGxpY2l0bHkgcmVxdWVzdGVkIFwiYmFyXCIgcHJvZ3Jlc3NcbiAgICAgIGlmIChvcHRpb25zLnByb2dyZXNzICYmIG9wdGlvbnMucHJvZ3Jlc3MgIT0gU3RhY2tBY3Rpdml0eVByb2dyZXNzLkVWRU5UUykge1xuICAgICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMud2Fybign4pqg77iPIFRoZSAtLWNvbmN1cnJlbmN5IGZsYWcgb25seSBzdXBwb3J0cyAtLXByb2dyZXNzIFwiZXZlbnRzXCIuIFN3aXRjaGluZyB0byBcImV2ZW50c1wiLicpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHN0YWNrc0FuZFRoZWlyQXNzZXRNYW5pZmVzdHMgPSBzdGFja3MuZmxhdE1hcCgoc3RhY2spID0+IFtcbiAgICAgIHN0YWNrLFxuICAgICAgLi4uc3RhY2suZGVwZW5kZW5jaWVzLmZpbHRlcih4ID0+IGN4YXBpLkFzc2V0TWFuaWZlc3RBcnRpZmFjdC5pc0Fzc2V0TWFuaWZlc3RBcnRpZmFjdCh4KSksXG4gICAgXSk7XG4gICAgY29uc3Qgd29ya0dyYXBoID0gbmV3IFdvcmtHcmFwaEJ1aWxkZXIoXG4gICAgICBhc0lvSGVscGVyKHRoaXMuaW9Ib3N0LCAnZGVwbG95JyksXG4gICAgICBwcmVidWlsZEFzc2V0cyxcbiAgICApLmJ1aWxkKHN0YWNrc0FuZFRoZWlyQXNzZXRNYW5pZmVzdHMpO1xuXG4gICAgLy8gVW5sZXNzIHdlIGFyZSBydW5uaW5nIHdpdGggJy0tZm9yY2UnLCBza2lwIGFscmVhZHkgcHVibGlzaGVkIGFzc2V0c1xuICAgIGlmICghb3B0aW9ucy5mb3JjZSkge1xuICAgICAgYXdhaXQgdGhpcy5yZW1vdmVQdWJsaXNoZWRBc3NldHMod29ya0dyYXBoLCBvcHRpb25zKTtcbiAgICB9XG5cbiAgICBjb25zdCBncmFwaENvbmN1cnJlbmN5OiBDb25jdXJyZW5jeSA9IHtcbiAgICAgICdzdGFjayc6IGNvbmN1cnJlbmN5LFxuICAgICAgJ2Fzc2V0LWJ1aWxkJzogMSwgLy8gVGhpcyB3aWxsIGJlIENQVS1ib3VuZC9tZW1vcnkgYm91bmQsIG1vc3RseSBtYXR0ZXJzIGZvciBEb2NrZXIgYnVpbGRzXG4gICAgICAnYXNzZXQtcHVibGlzaCc6IChvcHRpb25zLmFzc2V0UGFyYWxsZWxpc20gPz8gdHJ1ZSkgPyA4IDogMSwgLy8gVGhpcyB3aWxsIGJlIEkvTy1ib3VuZCwgOCBpbiBwYXJhbGxlbCBzZWVtcyByZWFzb25hYmxlXG4gICAgfTtcblxuICAgIGF3YWl0IHdvcmtHcmFwaC5kb1BhcmFsbGVsKGdyYXBoQ29uY3VycmVuY3ksIHtcbiAgICAgIGRlcGxveVN0YWNrLFxuICAgICAgYnVpbGRBc3NldCxcbiAgICAgIHB1Ymxpc2hBc3NldCxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEZXRlY3QgaW5mcmFzdHJ1Y3R1cmUgZHJpZnQgZm9yIHRoZSBnaXZlbiBzdGFjayhzKVxuICAgKi9cbiAgcHVibGljIGFzeW5jIGRyaWZ0KG9wdGlvbnM6IERyaWZ0T3B0aW9ucyk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgY29uc3QgZHJpZnRSZXN1bHRzID0gYXdhaXQgdGhpcy50b29sa2l0LmRyaWZ0KHRoaXMucHJvcHMuY2xvdWRFeGVjdXRhYmxlLCB7XG4gICAgICBzdGFja3M6IHtcbiAgICAgICAgcGF0dGVybnM6IG9wdGlvbnMuc2VsZWN0b3IucGF0dGVybnMsXG4gICAgICAgIHN0cmF0ZWd5OiBvcHRpb25zLnNlbGVjdG9yLnBhdHRlcm5zLmxlbmd0aCA+IDAgPyBTdGFja1NlbGVjdGlvblN0cmF0ZWd5LlBBVFRFUk5fTUFUQ0ggOiBTdGFja1NlbGVjdGlvblN0cmF0ZWd5LkFMTF9TVEFDS1MsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgdG90YWxEcmlmdHMgPSBPYmplY3QudmFsdWVzKGRyaWZ0UmVzdWx0cykucmVkdWNlKCh0b3RhbCwgY3VycmVudCkgPT4gdG90YWwgKyAoY3VycmVudC5udW1SZXNvdXJjZXNXaXRoRHJpZnQgPz8gMCksIDApO1xuICAgIHJldHVybiB0b3RhbERyaWZ0cyA+IDAgJiYgb3B0aW9ucy5mYWlsID8gMSA6IDA7XG4gIH1cblxuICAvKipcbiAgICogUm9sbCBiYWNrIHRoZSBnaXZlbiBzdGFjayBvciBzdGFja3MuXG4gICAqL1xuICBwdWJsaWMgYXN5bmMgcm9sbGJhY2sob3B0aW9uczogUm9sbGJhY2tPcHRpb25zKSB7XG4gICAgY29uc3Qgc3RhcnRTeW50aFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICBjb25zdCBzdGFja0NvbGxlY3Rpb24gPSBhd2FpdCB0aGlzLnNlbGVjdFN0YWNrc0ZvckRlcGxveShvcHRpb25zLnNlbGVjdG9yLCB0cnVlKTtcbiAgICBjb25zdCBlbGFwc2VkU3ludGhUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCkgLSBzdGFydFN5bnRoVGltZTtcbiAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbyhgXFxu4pyoICBTeW50aGVzaXMgdGltZTogJHtmb3JtYXRUaW1lKGVsYXBzZWRTeW50aFRpbWUpfXNcXG5gKTtcblxuICAgIGlmIChzdGFja0NvbGxlY3Rpb24uc3RhY2tDb3VudCA9PT0gMCkge1xuICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmVycm9yKCdObyBzdGFja3Mgc2VsZWN0ZWQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgYW55Um9sbGJhY2thYmxlID0gZmFsc2U7XG5cbiAgICBmb3IgKGNvbnN0IHN0YWNrIG9mIHN0YWNrQ29sbGVjdGlvbi5zdGFja0FydGlmYWN0cykge1xuICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmluZm8oJ1JvbGxpbmcgYmFjayAlcycsIGNoYWxrLmJvbGQoc3RhY2suZGlzcGxheU5hbWUpKTtcbiAgICAgIGNvbnN0IHN0YXJ0Um9sbGJhY2tUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnByb3BzLmRlcGxveW1lbnRzLnJvbGxiYWNrU3RhY2soe1xuICAgICAgICAgIHN0YWNrLFxuICAgICAgICAgIHJvbGVBcm46IG9wdGlvbnMucm9sZUFybixcbiAgICAgICAgICB0b29sa2l0U3RhY2tOYW1lOiBvcHRpb25zLnRvb2xraXRTdGFja05hbWUsXG4gICAgICAgICAgb3JwaGFuRmFpbGVkUmVzb3VyY2VzOiBvcHRpb25zLmZvcmNlLFxuICAgICAgICAgIHZhbGlkYXRlQm9vdHN0cmFwU3RhY2tWZXJzaW9uOiBvcHRpb25zLnZhbGlkYXRlQm9vdHN0cmFwU3RhY2tWZXJzaW9uLFxuICAgICAgICAgIG9ycGhhbkxvZ2ljYWxJZHM6IG9wdGlvbnMub3JwaGFuTG9naWNhbElkcyxcbiAgICAgICAgfSk7XG4gICAgICAgIGlmICghcmVzdWx0Lm5vdEluUm9sbGJhY2thYmxlU3RhdGUpIHtcbiAgICAgICAgICBhbnlSb2xsYmFja2FibGUgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGVsYXBzZWRSb2xsYmFja1RpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIHN0YXJ0Um9sbGJhY2tUaW1lO1xuICAgICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbyhgXFxu4pyoICBSb2xsYmFjayB0aW1lOiAke2Zvcm1hdFRpbWUoZWxhcHNlZFJvbGxiYWNrVGltZSkudG9TdHJpbmcoKX1zXFxuYCk7XG4gICAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmVycm9yKCdcXG4g4p2MICAlcyBmYWlsZWQ6ICVzJywgY2hhbGsuYm9sZChzdGFjay5kaXNwbGF5TmFtZSksIGZvcm1hdEVycm9yTWVzc2FnZShlKSk7XG4gICAgICAgIHRocm93IG5ldyBUb29sa2l0RXJyb3IoJ1JvbGxiYWNrIGZhaWxlZCAodXNlIC0tZm9yY2UgdG8gb3JwaGFuIGZhaWxpbmcgcmVzb3VyY2VzKScpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIWFueVJvbGxiYWNrYWJsZSkge1xuICAgICAgdGhyb3cgbmV3IFRvb2xraXRFcnJvcignTm8gc3RhY2tzIHdlcmUgaW4gYSBzdGF0ZSB0aGF0IGNvdWxkIGJlIHJvbGxlZCBiYWNrJyk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHdhdGNoKG9wdGlvbnM6IFdhdGNoT3B0aW9ucykge1xuICAgIGNvbnN0IHJvb3REaXIgPSBwYXRoLmRpcm5hbWUocGF0aC5yZXNvbHZlKFBST0pFQ1RfQ09ORklHKSk7XG4gICAgY29uc3QgaW9IZWxwZXIgPSBhc0lvSGVscGVyKHRoaXMuaW9Ib3N0LCAnd2F0Y2gnKTtcbiAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuZGVidWcoXCJyb290IGRpcmVjdG9yeSB1c2VkIGZvciAnd2F0Y2gnIGlzOiAlc1wiLCByb290RGlyKTtcblxuICAgIGNvbnN0IHdhdGNoU2V0dGluZ3M6IHsgaW5jbHVkZT86IHN0cmluZyB8IHN0cmluZ1tdOyBleGNsdWRlOiBzdHJpbmcgfCBzdHJpbmdbXSB9IHwgdW5kZWZpbmVkID1cbiAgICAgIHRoaXMucHJvcHMuY29uZmlndXJhdGlvbi5zZXR0aW5ncy5nZXQoWyd3YXRjaCddKTtcbiAgICBpZiAoIXdhdGNoU2V0dGluZ3MpIHtcbiAgICAgIHRocm93IG5ldyBUb29sa2l0RXJyb3IoXG4gICAgICAgIFwiQ2Fubm90IHVzZSB0aGUgJ3dhdGNoJyBjb21tYW5kIHdpdGhvdXQgc3BlY2lmeWluZyBhdCBsZWFzdCBvbmUgZGlyZWN0b3J5IHRvIG1vbml0b3IuIFwiICtcbiAgICAgICAgJ01ha2Ugc3VyZSB0byBhZGQgYSBcIndhdGNoXCIga2V5IHRvIHlvdXIgY2RrLmpzb24nLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBGb3IgdGhlIFwiaW5jbHVkZVwiIHN1YmtleSB1bmRlciB0aGUgXCJ3YXRjaFwiIGtleSwgdGhlIGJlaGF2aW9yIGlzOlxuICAgIC8vIDEuIE5vIFwid2F0Y2hcIiBzZXR0aW5nPyBXZSBlcnJvciBvdXQuXG4gICAgLy8gMi4gXCJ3YXRjaFwiIHNldHRpbmcgd2l0aG91dCBhbiBcImluY2x1ZGVcIiBrZXk/IFdlIGRlZmF1bHQgdG8gb2JzZXJ2aW5nIFwiLi8qKlwiLlxuICAgIC8vIDMuIFwid2F0Y2hcIiBzZXR0aW5nIHdpdGggYW4gZW1wdHkgXCJpbmNsdWRlXCIga2V5PyBXZSBkZWZhdWx0IHRvIG9ic2VydmluZyBcIi4vKipcIi5cbiAgICAvLyA0LiBOb24tZW1wdHkgXCJpbmNsdWRlXCIga2V5PyBKdXN0IHVzZSB0aGUgXCJpbmNsdWRlXCIga2V5LlxuICAgIGNvbnN0IHdhdGNoSW5jbHVkZXMgPSB0aGlzLnBhdHRlcm5zQXJyYXlGb3JXYXRjaCh3YXRjaFNldHRpbmdzLmluY2x1ZGUsIHtcbiAgICAgIHJvb3REaXIsXG4gICAgICByZXR1cm5Sb290RGlySWZFbXB0eTogdHJ1ZSxcbiAgICB9KTtcbiAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuZGVidWcoXCInaW5jbHVkZScgcGF0dGVybnMgZm9yICd3YXRjaCc6ICVzXCIsIHdhdGNoSW5jbHVkZXMpO1xuXG4gICAgLy8gRm9yIHRoZSBcImV4Y2x1ZGVcIiBzdWJrZXkgdW5kZXIgdGhlIFwid2F0Y2hcIiBrZXksXG4gICAgLy8gdGhlIGJlaGF2aW9yIGlzIHRvIGFkZCBzb21lIGRlZmF1bHQgZXhjbHVkZXMgaW4gYWRkaXRpb24gdG8gdGhlIG9uZXMgc3BlY2lmaWVkIGJ5IHRoZSB1c2VyOlxuICAgIC8vIDEuIFRoZSBDREsgb3V0cHV0IGRpcmVjdG9yeS5cbiAgICAvLyAyLiBBbnkgZmlsZSB3aG9zZSBuYW1lIHN0YXJ0cyB3aXRoIGEgZG90LlxuICAgIC8vIDMuIEFueSBkaXJlY3RvcnkncyBjb250ZW50IHdob3NlIG5hbWUgc3RhcnRzIHdpdGggYSBkb3QuXG4gICAgLy8gNC4gQW55IG5vZGVfbW9kdWxlcyBhbmQgaXRzIGNvbnRlbnQgKGV2ZW4gaWYgaXQncyBub3QgYSBKUy9UUyBwcm9qZWN0LCB5b3UgbWlnaHQgYmUgdXNpbmcgYSBsb2NhbCBhd3MtY2xpIHBhY2thZ2UpXG4gICAgY29uc3Qgb3V0cHV0RGlyID0gdGhpcy5wcm9wcy5jb25maWd1cmF0aW9uLnNldHRpbmdzLmdldChbJ291dHB1dCddKTtcbiAgICBjb25zdCB3YXRjaEV4Y2x1ZGVzID0gdGhpcy5wYXR0ZXJuc0FycmF5Rm9yV2F0Y2god2F0Y2hTZXR0aW5ncy5leGNsdWRlLCB7XG4gICAgICByb290RGlyLFxuICAgICAgcmV0dXJuUm9vdERpcklmRW1wdHk6IGZhbHNlLFxuICAgIH0pLmNvbmNhdChgJHtvdXRwdXREaXJ9LyoqYCwgJyoqLy4qJywgJyoqLy4qLyoqJywgJyoqL25vZGVfbW9kdWxlcy8qKicpO1xuICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy5kZWJ1ZyhcIidleGNsdWRlJyBwYXR0ZXJucyBmb3IgJ3dhdGNoJzogJXNcIiwgd2F0Y2hFeGNsdWRlcyk7XG5cbiAgICAvLyBTaW5jZSAnY2RrIGRlcGxveScgaXMgYSByZWxhdGl2ZWx5IHNsb3cgb3BlcmF0aW9uIGZvciBhICd3YXRjaCcgcHJvY2VzcyxcbiAgICAvLyBpbnRyb2R1Y2UgYSBjb25jdXJyZW5jeSBsYXRjaCB0aGF0IHRyYWNrcyB0aGUgc3RhdGUuXG4gICAgLy8gVGhpcyB3YXksIGlmIGZpbGUgY2hhbmdlIGV2ZW50cyBhcnJpdmUgd2hlbiBhICdjZGsgZGVwbG95JyBpcyBzdGlsbCBleGVjdXRpbmcsXG4gICAgLy8gd2Ugd2lsbCBiYXRjaCB0aGVtLCBhbmQgdHJpZ2dlciBhbm90aGVyICdjZGsgZGVwbG95JyBhZnRlciB0aGUgY3VycmVudCBvbmUgZmluaXNoZXMsXG4gICAgLy8gbWFraW5nIHN1cmUgJ2NkayBkZXBsb3kncyAgYWx3YXlzIGV4ZWN1dGUgb25lIGF0IGEgdGltZS5cbiAgICAvLyBIZXJlJ3MgYSBkaWFncmFtIHNob3dpbmcgdGhlIHN0YXRlIHRyYW5zaXRpb25zOlxuICAgIC8vIC0tLS0tLS0tLS0tLS0tICAgICAgICAgICAgICAgIC0tLS0tLS0tICAgIGZpbGUgY2hhbmdlZCAgICAgLS0tLS0tLS0tLS0tLS0gICAgZmlsZSBjaGFuZ2VkICAgICAtLS0tLS0tLS0tLS0tLSAgZmlsZSBjaGFuZ2VkXG4gICAgLy8gfCAgICAgICAgICAgIHwgIHJlYWR5IGV2ZW50ICAgfCAgICAgIHwgLS0tLS0tLS0tLS0tLS0tLS0tPiB8ICAgICAgICAgICAgfCAtLS0tLS0tLS0tLS0tLS0tLS0+IHwgICAgICAgICAgICB8IC0tLS0tLS0tLS0tLS0tfFxuICAgIC8vIHwgcHJlLXJlYWR5ICB8IC0tLS0tLS0tLS0tLS0+IHwgb3BlbiB8ICAgICAgICAgICAgICAgICAgICAgfCBkZXBsb3lpbmcgIHwgICAgICAgICAgICAgICAgICAgICB8ICAgcXVldWVkICAgfCAgICAgICAgICAgICAgIHxcbiAgICAvLyB8ICAgICAgICAgICAgfCAgICAgICAgICAgICAgICB8ICAgICAgfCA8LS0tLS0tLS0tLS0tLS0tLS0tIHwgICAgICAgICAgICB8IDwtLS0tLS0tLS0tLS0tLS0tLS0gfCAgICAgICAgICAgIHwgPC0tLS0tLS0tLS0tLS18XG4gICAgLy8gLS0tLS0tLS0tLS0tLS0gICAgICAgICAgICAgICAgLS0tLS0tLS0gICdjZGsgZGVwbG95JyBkb25lICAtLS0tLS0tLS0tLS0tLSAgJ2NkayBkZXBsb3knIGRvbmUgIC0tLS0tLS0tLS0tLS0tXG4gICAgbGV0IGxhdGNoOiAncHJlLXJlYWR5JyB8ICdvcGVuJyB8ICdkZXBsb3lpbmcnIHwgJ3F1ZXVlZCcgPSAncHJlLXJlYWR5JztcblxuICAgIGNvbnN0IGNsb3VkV2F0Y2hMb2dNb25pdG9yID0gb3B0aW9ucy50cmFjZUxvZ3MgPyBuZXcgQ2xvdWRXYXRjaExvZ0V2ZW50TW9uaXRvcih7XG4gICAgICBpb0hlbHBlcixcbiAgICB9KSA6IHVuZGVmaW5lZDtcbiAgICBjb25zdCBkZXBsb3lBbmRXYXRjaCA9IGFzeW5jICgpID0+IHtcbiAgICAgIGxhdGNoID0gJ2RlcGxveWluZyc7XG4gICAgICBhd2FpdCBjbG91ZFdhdGNoTG9nTW9uaXRvcj8uZGVhY3RpdmF0ZSgpO1xuXG4gICAgICBhd2FpdCB0aGlzLmludm9rZURlcGxveUZyb21XYXRjaChvcHRpb25zLCBjbG91ZFdhdGNoTG9nTW9uaXRvcik7XG5cbiAgICAgIC8vIElmIGxhdGNoIGlzIHN0aWxsICdkZXBsb3lpbmcnIGFmdGVyIHRoZSAnYXdhaXQnLCB0aGF0J3MgZmluZSxcbiAgICAgIC8vIGJ1dCBpZiBpdCdzICdxdWV1ZWQnLCB0aGF0IG1lYW5zIHdlIG5lZWQgdG8gZGVwbG95IGFnYWluXG4gICAgICB3aGlsZSAoKGxhdGNoIGFzICdkZXBsb3lpbmcnIHwgJ3F1ZXVlZCcpID09PSAncXVldWVkJykge1xuICAgICAgICAvLyBUeXBlU2NyaXB0IGRvZXNuJ3QgcmVhbGl6ZSBsYXRjaCBjYW4gY2hhbmdlIGJldHdlZW4gJ2F3YWl0cycsXG4gICAgICAgIC8vIGFuZCB0aGlua3MgdGhlIGFib3ZlICd3aGlsZScgY29uZGl0aW9uIGlzIGFsd2F5cyAnZmFsc2UnIHdpdGhvdXQgdGhlIGNhc3RcbiAgICAgICAgbGF0Y2ggPSAnZGVwbG95aW5nJztcbiAgICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmluZm8oXCJEZXRlY3RlZCBmaWxlIGNoYW5nZXMgZHVyaW5nIGRlcGxveW1lbnQuIEludm9raW5nICdjZGsgZGVwbG95JyBhZ2FpblwiKTtcbiAgICAgICAgYXdhaXQgdGhpcy5pbnZva2VEZXBsb3lGcm9tV2F0Y2gob3B0aW9ucywgY2xvdWRXYXRjaExvZ01vbml0b3IpO1xuICAgICAgfVxuICAgICAgbGF0Y2ggPSAnb3Blbic7XG4gICAgICBhd2FpdCBjbG91ZFdhdGNoTG9nTW9uaXRvcj8uYWN0aXZhdGUoKTtcbiAgICB9O1xuXG4gICAgY2hva2lkYXJcbiAgICAgIC53YXRjaCh3YXRjaEluY2x1ZGVzLCB7XG4gICAgICAgIGlnbm9yZWQ6IHdhdGNoRXhjbHVkZXMsXG4gICAgICAgIGN3ZDogcm9vdERpcixcbiAgICAgIH0pXG4gICAgICAub24oJ3JlYWR5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgICBsYXRjaCA9ICdvcGVuJztcbiAgICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmRlYnVnKFwiJ3dhdGNoJyByZWNlaXZlZCB0aGUgJ3JlYWR5JyBldmVudC4gRnJvbSBub3cgb24sIGFsbCBmaWxlIGNoYW5nZXMgd2lsbCB0cmlnZ2VyIGEgZGVwbG95bWVudFwiKTtcbiAgICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmluZm8oXCJUcmlnZ2VyaW5nIGluaXRpYWwgJ2NkayBkZXBsb3knXCIpO1xuICAgICAgICBhd2FpdCBkZXBsb3lBbmRXYXRjaCgpO1xuICAgICAgfSlcbiAgICAgIC5vbignYWxsJywgYXN5bmMgKGV2ZW50OiAnYWRkJyB8ICdhZGREaXInIHwgJ2NoYW5nZScgfCAndW5saW5rJyB8ICd1bmxpbmtEaXInLCBmaWxlUGF0aD86IHN0cmluZykgPT4ge1xuICAgICAgICBpZiAobGF0Y2ggPT09ICdwcmUtcmVhZHknKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmluZm8oYCd3YXRjaCcgaXMgb2JzZXJ2aW5nICR7ZXZlbnQgPT09ICdhZGREaXInID8gJ2RpcmVjdG9yeScgOiAndGhlIGZpbGUnfSAnJXMnIGZvciBjaGFuZ2VzYCwgZmlsZVBhdGgpO1xuICAgICAgICB9IGVsc2UgaWYgKGxhdGNoID09PSAnb3BlbicpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbyhcIkRldGVjdGVkIGNoYW5nZSB0byAnJXMnICh0eXBlOiAlcykuIFRyaWdnZXJpbmcgJ2NkayBkZXBsb3knXCIsIGZpbGVQYXRoLCBldmVudCk7XG4gICAgICAgICAgYXdhaXQgZGVwbG95QW5kV2F0Y2goKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyB0aGlzIG1lYW5zIGxhdGNoIGlzIGVpdGhlciAnZGVwbG95aW5nJyBvciAncXVldWVkJ1xuICAgICAgICAgIGxhdGNoID0gJ3F1ZXVlZCc7XG4gICAgICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmluZm8oXG4gICAgICAgICAgICBcIkRldGVjdGVkIGNoYW5nZSB0byAnJXMnICh0eXBlOiAlcykgd2hpbGUgJ2NkayBkZXBsb3knIGlzIHN0aWxsIHJ1bm5pbmcuIFwiICtcbiAgICAgICAgICAgICdXaWxsIHF1ZXVlIGZvciBhbm90aGVyIGRlcGxveW1lbnQgYWZ0ZXIgdGhpcyBvbmUgZmluaXNoZXMnLFxuICAgICAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgICAgICBldmVudCxcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBpbXBvcnQob3B0aW9uczogSW1wb3J0T3B0aW9ucykge1xuICAgIGNvbnN0IHN0YWNrcyA9IGF3YWl0IHRoaXMuc2VsZWN0U3RhY2tzRm9yRGVwbG95KG9wdGlvbnMuc2VsZWN0b3IsIHRydWUsIHRydWUsIGZhbHNlKTtcblxuICAgIC8vIHNldCBwcm9ncmVzcyBmcm9tIG9wdGlvbnMsIHRoaXMgaW5jbHVkZXMgdXNlciBhbmQgYXBwIGNvbmZpZ1xuICAgIGlmIChvcHRpb25zLnByb2dyZXNzKSB7XG4gICAgICB0aGlzLmlvSG9zdC5zdGFja1Byb2dyZXNzID0gb3B0aW9ucy5wcm9ncmVzcztcbiAgICB9XG5cbiAgICBpZiAoc3RhY2tzLnN0YWNrQ291bnQgPiAxKSB7XG4gICAgICB0aHJvdyBuZXcgVG9vbGtpdEVycm9yKFxuICAgICAgICBgU3RhY2sgc2VsZWN0aW9uIGlzIGFtYmlndW91cywgcGxlYXNlIGNob29zZSBhIHNwZWNpZmljIHN0YWNrIGZvciBpbXBvcnQgWyR7c3RhY2tzLnN0YWNrQXJ0aWZhY3RzLm1hcCgoeCkgPT4geC5pZCkuam9pbignLCAnKX1dYCxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKCFwcm9jZXNzLnN0ZG91dC5pc1RUWSAmJiAhb3B0aW9ucy5yZXNvdXJjZU1hcHBpbmdGaWxlKSB7XG4gICAgICB0aHJvdyBuZXcgVG9vbGtpdEVycm9yKCctLXJlc291cmNlLW1hcHBpbmcgaXMgcmVxdWlyZWQgd2hlbiBpbnB1dCBpcyBub3QgYSB0ZXJtaW5hbCcpO1xuICAgIH1cblxuICAgIGNvbnN0IHN0YWNrID0gc3RhY2tzLnN0YWNrQXJ0aWZhY3RzWzBdO1xuXG4gICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmluZm8oY2hhbGsuYm9sZChzdGFjay5kaXNwbGF5TmFtZSkpO1xuXG4gICAgY29uc3QgcmVzb3VyY2VJbXBvcnRlciA9IG5ldyBSZXNvdXJjZUltcG9ydGVyKHN0YWNrLCB7XG4gICAgICBkZXBsb3ltZW50czogdGhpcy5wcm9wcy5kZXBsb3ltZW50cyxcbiAgICAgIGlvSGVscGVyOiBhc0lvSGVscGVyKHRoaXMuaW9Ib3N0LCAnaW1wb3J0JyksXG4gICAgfSk7XG4gICAgY29uc3QgeyBhZGRpdGlvbnMsIGhhc05vbkFkZGl0aW9ucyB9ID0gYXdhaXQgcmVzb3VyY2VJbXBvcnRlci5kaXNjb3ZlckltcG9ydGFibGVSZXNvdXJjZXMob3B0aW9ucy5mb3JjZSk7XG4gICAgaWYgKGFkZGl0aW9ucy5sZW5ndGggPT09IDApIHtcbiAgICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy53YXJuKFxuICAgICAgICAnJXM6IG5vIG5ldyByZXNvdXJjZXMgY29tcGFyZWQgdG8gdGhlIGN1cnJlbnRseSBkZXBsb3llZCBzdGFjaywgc2tpcHBpbmcgaW1wb3J0LicsXG4gICAgICAgIGNoYWxrLmJvbGQoc3RhY2suZGlzcGxheU5hbWUpLFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBQcmVwYXJlIGEgbWFwcGluZyBvZiBwaHlzaWNhbCByZXNvdXJjZXMgdG8gQ0RLIGNvbnN0cnVjdHNcbiAgICBjb25zdCBhY3R1YWxJbXBvcnQgPSAhb3B0aW9ucy5yZXNvdXJjZU1hcHBpbmdGaWxlXG4gICAgICA/IGF3YWl0IHJlc291cmNlSW1wb3J0ZXIuYXNrRm9yUmVzb3VyY2VJZGVudGlmaWVycyhhZGRpdGlvbnMpXG4gICAgICA6IGF3YWl0IHJlc291cmNlSW1wb3J0ZXIubG9hZFJlc291cmNlSWRlbnRpZmllcnMoYWRkaXRpb25zLCBvcHRpb25zLnJlc291cmNlTWFwcGluZ0ZpbGUpO1xuXG4gICAgaWYgKGFjdHVhbEltcG9ydC5pbXBvcnRSZXNvdXJjZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMud2FybignTm8gcmVzb3VyY2VzIHNlbGVjdGVkIGZvciBpbXBvcnQuJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gSWYgXCItLWNyZWF0ZS1yZXNvdXJjZS1tYXBwaW5nXCIgb3B0aW9uIHdhcyBwYXNzZWQsIHdyaXRlIHRoZSByZXNvdXJjZSBtYXBwaW5nIHRvIHRoZSBnaXZlbiBmaWxlIGFuZCBleGl0XG4gICAgaWYgKG9wdGlvbnMucmVjb3JkUmVzb3VyY2VNYXBwaW5nKSB7XG4gICAgICBjb25zdCBvdXRwdXRGaWxlID0gb3B0aW9ucy5yZWNvcmRSZXNvdXJjZU1hcHBpbmc7XG4gICAgICBmcy5lbnN1cmVGaWxlU3luYyhvdXRwdXRGaWxlKTtcbiAgICAgIGF3YWl0IGZzLndyaXRlSnNvbihvdXRwdXRGaWxlLCBhY3R1YWxJbXBvcnQucmVzb3VyY2VNYXAsIHtcbiAgICAgICAgc3BhY2VzOiAyLFxuICAgICAgICBlbmNvZGluZzogJ3V0ZjgnLFxuICAgICAgfSk7XG4gICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbygnJXM6IG1hcHBpbmcgZmlsZSB3cml0dGVuLicsIG91dHB1dEZpbGUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEltcG9ydCB0aGUgcmVzb3VyY2VzIGFjY29yZGluZyB0byB0aGUgZ2l2ZW4gbWFwcGluZ1xuICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy5pbmZvKCclczogaW1wb3J0aW5nIHJlc291cmNlcyBpbnRvIHN0YWNrLi4uJywgY2hhbGsuYm9sZChzdGFjay5kaXNwbGF5TmFtZSkpO1xuICAgIGNvbnN0IHRhZ3MgPSB0YWdzRm9yU3RhY2soc3RhY2spO1xuICAgIGF3YWl0IHJlc291cmNlSW1wb3J0ZXIuaW1wb3J0UmVzb3VyY2VzRnJvbU1hcChhY3R1YWxJbXBvcnQsIHtcbiAgICAgIHJvbGVBcm46IG9wdGlvbnMucm9sZUFybixcbiAgICAgIHRhZ3MsXG4gICAgICBkZXBsb3ltZW50TWV0aG9kOiBvcHRpb25zLmRlcGxveW1lbnRNZXRob2QsXG4gICAgICB1c2VQcmV2aW91c1BhcmFtZXRlcnM6IHRydWUsXG4gICAgICByb2xsYmFjazogb3B0aW9ucy5yb2xsYmFjayxcbiAgICB9KTtcblxuICAgIC8vIE5vdGlmeSB1c2VyIG9mIG5leHQgc3RlcHNcbiAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbyhcbiAgICAgIGBJbXBvcnQgb3BlcmF0aW9uIGNvbXBsZXRlLiBXZSByZWNvbW1lbmQgeW91IHJ1biBhICR7Y2hhbGsuYmx1ZUJyaWdodCgnZHJpZnQgZGV0ZWN0aW9uJyl9IG9wZXJhdGlvbiBgICtcbiAgICAgICd0byBjb25maXJtIHlvdXIgQ0RLIGFwcCByZXNvdXJjZSBkZWZpbml0aW9ucyBhcmUgdXAtdG8tZGF0ZS4gUmVhZCBtb3JlIGhlcmU6ICcgK1xuICAgICAgY2hhbGsudW5kZXJsaW5lLmJsdWVCcmlnaHQoXG4gICAgICAgICdodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vQVdTQ2xvdWRGb3JtYXRpb24vbGF0ZXN0L1VzZXJHdWlkZS9kZXRlY3QtZHJpZnQtc3RhY2suaHRtbCcsXG4gICAgICApLFxuICAgICk7XG4gICAgaWYgKGFjdHVhbEltcG9ydC5pbXBvcnRSZXNvdXJjZXMubGVuZ3RoIDwgYWRkaXRpb25zLmxlbmd0aCkge1xuICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmluZm8oJycpO1xuICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLndhcm4oXG4gICAgICAgIGBTb21lIHJlc291cmNlcyB3ZXJlIHNraXBwZWQuIFJ1biBhbm90aGVyICR7Y2hhbGsuYmx1ZUJyaWdodCgnY2RrIGltcG9ydCcpfSBvciBhICR7Y2hhbGsuYmx1ZUJyaWdodCgnY2RrIGRlcGxveScpfSB0byBicmluZyB0aGUgc3RhY2sgdXAtdG8tZGF0ZSB3aXRoIHlvdXIgQ0RLIGFwcCBkZWZpbml0aW9uLmAsXG4gICAgICApO1xuICAgIH0gZWxzZSBpZiAoaGFzTm9uQWRkaXRpb25zKSB7XG4gICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbygnJyk7XG4gICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMud2FybihcbiAgICAgICAgYFlvdXIgYXBwIGhhcyBwZW5kaW5nIHVwZGF0ZXMgb3IgZGVsZXRlcyBleGNsdWRlZCBmcm9tIHRoaXMgaW1wb3J0IG9wZXJhdGlvbi4gUnVuIGEgJHtjaGFsay5ibHVlQnJpZ2h0KCdjZGsgZGVwbG95Jyl9IHRvIGJyaW5nIHRoZSBzdGFjayB1cC10by1kYXRlIHdpdGggeW91ciBDREsgYXBwIGRlZmluaXRpb24uYCxcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGRlc3Ryb3kob3B0aW9uczogRGVzdHJveU9wdGlvbnMpIHtcbiAgICBjb25zdCBpb0hlbHBlciA9IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKTtcblxuICAgIC8vIFRoZSBzdGFja3Mgd2lsbCBoYXZlIGJlZW4gb3JkZXJlZCBmb3IgZGVwbG95bWVudCwgc28gcmV2ZXJzZSB0aGVtIGZvciBkZWxldGlvbi5cbiAgICBjb25zdCBzdGFja3MgPSAoYXdhaXQgdGhpcy5zZWxlY3RTdGFja3NGb3JEZXN0cm95KG9wdGlvbnMuc2VsZWN0b3IsIG9wdGlvbnMuZXhjbHVzaXZlbHkpKS5yZXZlcnNlZCgpO1xuXG4gICAgaWYgKCFvcHRpb25zLmZvcmNlKSB7XG4gICAgICBjb25zdCBtb3RpdmF0aW9uID0gJ0Rlc3Ryb3lpbmcgc3RhY2tzIGlzIGFuIGlycmV2ZXJzaWJsZSBhY3Rpb24nO1xuICAgICAgY29uc3QgcXVlc3Rpb24gPSBgQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZTogJHtjaGFsay5ibHVlKHN0YWNrcy5zdGFja0FydGlmYWN0cy5tYXAoKHMpID0+IHMuaGllcmFyY2hpY2FsSWQpLmpvaW4oJywgJykpfWA7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBpb0hlbHBlci5yZXF1ZXN0UmVzcG9uc2UoSU8uQ0RLX1RPT0xLSVRfSTcwMTAucmVxKHF1ZXN0aW9uLCB7IG1vdGl2YXRpb24gfSkpO1xuICAgICAgfSBjYXRjaCAoZXJyOiB1bmtub3duKSB7XG4gICAgICAgIGlmICghVG9vbGtpdEVycm9yLmlzVG9vbGtpdEVycm9yKGVycikgfHwgZXJyLm1lc3NhZ2UgIT0gJ0Fib3J0ZWQgYnkgdXNlcicpIHtcbiAgICAgICAgICB0aHJvdyBlcnI7IC8vIHVuZXhwZWN0ZWQgZXJyb3JcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBpb0hlbHBlci5ub3RpZnkoSU8uQ0RLX1RPT0xLSVRfRTcwMTAubXNnKGVyci5tZXNzYWdlKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBhY3Rpb24gPSBvcHRpb25zLmZyb21EZXBsb3kgPyAnZGVwbG95JyA6ICdkZXN0cm95JztcbiAgICBmb3IgKGNvbnN0IFtpbmRleCwgc3RhY2tdIG9mIHN0YWNrcy5zdGFja0FydGlmYWN0cy5lbnRyaWVzKCkpIHtcbiAgICAgIGF3YWl0IGlvSGVscGVyLmRlZmF1bHRzLmluZm8oY2hhbGsuZ3JlZW4oJyVzOiBkZXN0cm95aW5nLi4uIFslcy8lc10nKSwgY2hhbGsuYmx1ZShzdGFjay5kaXNwbGF5TmFtZSksIGluZGV4ICsgMSwgc3RhY2tzLnN0YWNrQ291bnQpO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5wcm9wcy5kZXBsb3ltZW50cy5kZXN0cm95U3RhY2soe1xuICAgICAgICAgIHN0YWNrLFxuICAgICAgICAgIGRlcGxveU5hbWU6IHN0YWNrLnN0YWNrTmFtZSxcbiAgICAgICAgICByb2xlQXJuOiBvcHRpb25zLnJvbGVBcm4sXG4gICAgICAgIH0pO1xuICAgICAgICBhd2FpdCBpb0hlbHBlci5kZWZhdWx0cy5pbmZvKGNoYWxrLmdyZWVuKGBcXG4g4pyFICAlczogJHthY3Rpb259ZWRgKSwgY2hhbGsuYmx1ZShzdGFjay5kaXNwbGF5TmFtZSkpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBhd2FpdCBpb0hlbHBlci5kZWZhdWx0cy5lcnJvcihgXFxuIOKdjCAgJXM6ICR7YWN0aW9ufSBmYWlsZWRgLCBjaGFsay5ibHVlKHN0YWNrLmRpc3BsYXlOYW1lKSwgZSk7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGxpc3QoXG4gICAgc2VsZWN0b3JzOiBzdHJpbmdbXSxcbiAgICBvcHRpb25zOiB7IGxvbmc/OiBib29sZWFuOyBqc29uPzogYm9vbGVhbjsgc2hvd0RlcHM/OiBib29sZWFuIH0gPSB7fSxcbiAgKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICBjb25zdCBzdGFja3MgPSBhd2FpdCBsaXN0U3RhY2tzKHRoaXMsIHtcbiAgICAgIHNlbGVjdG9yczogc2VsZWN0b3JzLFxuICAgIH0pO1xuXG4gICAgaWYgKG9wdGlvbnMubG9uZyAmJiBvcHRpb25zLnNob3dEZXBzKSB7XG4gICAgICBhd2FpdCBwcmludFNlcmlhbGl6ZWRPYmplY3QodGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLCBzdGFja3MsIG9wdGlvbnMuanNvbiA/PyBmYWxzZSk7XG4gICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICBpZiAob3B0aW9ucy5zaG93RGVwcykge1xuICAgICAgY29uc3Qgc3RhY2tEZXBzID0gc3RhY2tzLm1hcChzdGFjayA9PiAoe1xuICAgICAgICBpZDogc3RhY2suaWQsXG4gICAgICAgIGRlcGVuZGVuY2llczogc3RhY2suZGVwZW5kZW5jaWVzLFxuICAgICAgfSkpO1xuICAgICAgYXdhaXQgcHJpbnRTZXJpYWxpemVkT2JqZWN0KHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKSwgc3RhY2tEZXBzLCBvcHRpb25zLmpzb24gPz8gZmFsc2UpO1xuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgaWYgKG9wdGlvbnMubG9uZykge1xuICAgICAgY29uc3QgbG9uZyA9IHN0YWNrcy5tYXAoc3RhY2sgPT4gKHtcbiAgICAgICAgaWQ6IHN0YWNrLmlkLFxuICAgICAgICBuYW1lOiBzdGFjay5uYW1lLFxuICAgICAgICBlbnZpcm9ubWVudDogc3RhY2suZW52aXJvbm1lbnQsXG4gICAgICB9KSk7XG4gICAgICBhd2FpdCBwcmludFNlcmlhbGl6ZWRPYmplY3QodGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLCBsb25nLCBvcHRpb25zLmpzb24gPz8gZmFsc2UpO1xuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgLy8ganVzdCBwcmludCBzdGFjayBJRHNcbiAgICBmb3IgKGNvbnN0IHN0YWNrIG9mIHN0YWNrcykge1xuICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLnJlc3VsdChzdGFjay5pZCk7XG4gICAgfVxuICAgIHJldHVybiAwOyAvLyBleGl0LWNvZGVcbiAgfVxuXG4gIC8qKlxuICAgKiBTeW50aGVzaXplIHRoZSBnaXZlbiBzZXQgb2Ygc3RhY2tzIChjYWxsZWQgd2hlbiB0aGUgdXNlciBydW5zICdjZGsgc3ludGgnKVxuICAgKlxuICAgKiBJTlBVVDogU3RhY2sgbmFtZXMgY2FuIGJlIHN1cHBsaWVkIHVzaW5nIGEgZ2xvYiBmaWx0ZXIuIElmIG5vIHN0YWNrcyBhcmVcbiAgICogZ2l2ZW4sIGFsbCBzdGFja3MgZnJvbSB0aGUgYXBwbGljYXRpb24gYXJlIGltcGxpY2l0bHkgc2VsZWN0ZWQuXG4gICAqXG4gICAqIE9VVFBVVDogSWYgbW9yZSB0aGFuIG9uZSBzdGFjayBlbmRzIHVwIGJlaW5nIHNlbGVjdGVkLCBhbiBvdXRwdXQgZGlyZWN0b3J5XG4gICAqIHNob3VsZCBiZSBzdXBwbGllZCwgd2hlcmUgdGhlIHRlbXBsYXRlcyB3aWxsIGJlIHdyaXR0ZW4uXG4gICAqL1xuICBwdWJsaWMgYXN5bmMgc3ludGgoXG4gICAgc3RhY2tOYW1lczogc3RyaW5nW10sXG4gICAgZXhjbHVzaXZlbHk6IGJvb2xlYW4sXG4gICAgcXVpZXQ6IGJvb2xlYW4sXG4gICAgYXV0b1ZhbGlkYXRlPzogYm9vbGVhbixcbiAgICBqc29uPzogYm9vbGVhbixcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBzdGFja3MgPSBhd2FpdCB0aGlzLnNlbGVjdFN0YWNrc0ZvckRpZmYoc3RhY2tOYW1lcywgZXhjbHVzaXZlbHksIGF1dG9WYWxpZGF0ZSk7XG5cbiAgICAvLyBpZiB3ZSBoYXZlIGEgc2luZ2xlIHN0YWNrLCBwcmludCBpdCB0byBTVERPVVRcbiAgICBpZiAoc3RhY2tzLnN0YWNrQ291bnQgPT09IDEpIHtcbiAgICAgIGlmICghcXVpZXQpIHtcbiAgICAgICAgYXdhaXQgcHJpbnRTZXJpYWxpemVkT2JqZWN0KHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKSwgb2JzY3VyZVRlbXBsYXRlKHN0YWNrcy5maXJzdFN0YWNrLnRlbXBsYXRlKSwganNvbiA/PyBmYWxzZSk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IGRpc3BsYXlGbGFnc01lc3NhZ2UodGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLCB0aGlzLnRvb2xraXQsIHRoaXMucHJvcHMuY2xvdWRFeGVjdXRhYmxlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgLy8gbm90IG91dHB1dHRpbmcgdGVtcGxhdGUgdG8gc3Rkb3V0LCBsZXQncyBleHBsYWluIHRoaW5ncyB0byB0aGUgdXNlciBhIGxpdHRsZSBiaXQuLi5cbiAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbyhjaGFsay5ncmVlbihgU3VjY2Vzc2Z1bGx5IHN5bnRoZXNpemVkIHRvICR7Y2hhbGsuYmx1ZShwYXRoLnJlc29sdmUoc3RhY2tzLmFzc2VtYmx5LmRpcmVjdG9yeSkpfWApKTtcbiAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbyhcbiAgICAgIGBTdXBwbHkgYSBzdGFjayBpZCAoJHtzdGFja3Muc3RhY2tBcnRpZmFjdHMubWFwKChzKSA9PiBjaGFsay5ncmVlbihzLmhpZXJhcmNoaWNhbElkKSkuam9pbignLCAnKX0pIHRvIGRpc3BsYXkgaXRzIHRlbXBsYXRlLmAsXG4gICAgKTtcblxuICAgIGF3YWl0IGRpc3BsYXlGbGFnc01lc3NhZ2UodGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLCB0aGlzLnRvb2xraXQsIHRoaXMucHJvcHMuY2xvdWRFeGVjdXRhYmxlKTtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG5cbiAgLyoqXG4gICAqIEJvb3RzdHJhcCB0aGUgQ0RLIFRvb2xraXQgc3RhY2sgaW4gdGhlIGFjY291bnRzIHVzZWQgYnkgdGhlIHNwZWNpZmllZCBzdGFjayhzKS5cbiAgICpcbiAgICogQHBhcmFtIHVzZXJFbnZpcm9ubWVudFNwZWNzIC0gZW52aXJvbm1lbnQgbmFtZXMgdGhhdCBuZWVkIHRvIGhhdmUgdG9vbGtpdCBzdXBwb3J0XG4gICAqICAgICAgICAgICAgIHByb3Zpc2lvbmVkLCBhcyBhIGdsb2IgZmlsdGVyLiBJZiBub25lIGlzIHByb3ZpZGVkLCBhbGwgc3RhY2tzIGFyZSBpbXBsaWNpdGx5IHNlbGVjdGVkLlxuICAgKiBAcGFyYW0gb3B0aW9ucyAtIFRoZSBuYW1lLCByb2xlIEFSTiwgYm9vdHN0cmFwcGluZyBwYXJhbWV0ZXJzLCBldGMuIHRvIGJlIHVzZWQgZm9yIHRoZSBDREsgVG9vbGtpdCBzdGFjay5cbiAgICovXG4gIHB1YmxpYyBhc3luYyBib290c3RyYXAoXG4gICAgdXNlckVudmlyb25tZW50U3BlY3M6IHN0cmluZ1tdLFxuICAgIG9wdGlvbnM6IEJvb3RzdHJhcEVudmlyb25tZW50T3B0aW9ucyxcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgYm9vdHN0cmFwcGVyID0gbmV3IEJvb3RzdHJhcHBlcihvcHRpb25zLnNvdXJjZSwgYXNJb0hlbHBlcih0aGlzLmlvSG9zdCwgJ2Jvb3RzdHJhcCcpKTtcbiAgICAvLyBJZiB0aGVyZSBpcyBhbiAnLS1hcHAnIGFyZ3VtZW50IGFuZCBhbiBlbnZpcm9ubWVudCBsb29rcyBsaWtlIGEgZ2xvYiwgd2VcbiAgICAvLyBzZWxlY3QgdGhlIGVudmlyb25tZW50cyBmcm9tIHRoZSBhcHAuIE90aGVyd2lzZSwgdXNlIHdoYXQgdGhlIHVzZXIgc2FpZC5cblxuICAgIGNvbnN0IGVudmlyb25tZW50cyA9IGF3YWl0IHRoaXMuZGVmaW5lRW52aXJvbm1lbnRzKHVzZXJFbnZpcm9ubWVudFNwZWNzKTtcblxuICAgIGNvbnN0IGxpbWl0ID0gcExpbWl0KDIwKTtcblxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAY2RrbGFicy9wcm9taXNlYWxsLW5vLXVuYm91bmRlZC1wYXJhbGxlbGlzbVxuICAgIGF3YWl0IFByb21pc2UuYWxsKGVudmlyb25tZW50cy5tYXAoKGVudmlyb25tZW50KSA9PiBsaW1pdChhc3luYyAoKSA9PiB7XG4gICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbyhjaGFsay5ncmVlbignIOKPsyAgQm9vdHN0cmFwcGluZyBlbnZpcm9ubWVudCAlcy4uLicpLCBjaGFsay5ibHVlKGVudmlyb25tZW50Lm5hbWUpKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGJvb3RzdHJhcHBlci5ib290c3RyYXBFbnZpcm9ubWVudChlbnZpcm9ubWVudCwgdGhpcy5wcm9wcy5zZGtQcm92aWRlciwgb3B0aW9ucyk7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2UgPSByZXN1bHQubm9PcFxuICAgICAgICAgID8gJyDinIUgIEVudmlyb25tZW50ICVzIGJvb3RzdHJhcHBlZCAobm8gY2hhbmdlcykuJ1xuICAgICAgICAgIDogJyDinIUgIEVudmlyb25tZW50ICVzIGJvb3RzdHJhcHBlZC4nO1xuICAgICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbyhjaGFsay5ncmVlbihtZXNzYWdlKSwgY2hhbGsuYmx1ZShlbnZpcm9ubWVudC5uYW1lKSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy5lcnJvcignIOKdjCAgRW52aXJvbm1lbnQgJXMgZmFpbGVkIGJvb3RzdHJhcHBpbmc6ICVzJywgY2hhbGsuYmx1ZShlbnZpcm9ubWVudC5uYW1lKSwgZSk7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfSkpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHYXJiYWdlIGNvbGxlY3RzIGFzc2V0cyBmcm9tIGEgQ0RLIGFwcCdzIGVudmlyb25tZW50XG4gICAqIEBwYXJhbSBvcHRpb25zIC0gT3B0aW9ucyBmb3IgR2FyYmFnZSBDb2xsZWN0aW9uXG4gICAqL1xuICBwdWJsaWMgYXN5bmMgZ2FyYmFnZUNvbGxlY3QodXNlckVudmlyb25tZW50U3BlY3M6IHN0cmluZ1tdLCBvcHRpb25zOiBHYXJiYWdlQ29sbGVjdGlvbk9wdGlvbnMpIHtcbiAgICBjb25zdCBlbnZpcm9ubWVudHMgPSBhd2FpdCB0aGlzLmRlZmluZUVudmlyb25tZW50cyh1c2VyRW52aXJvbm1lbnRTcGVjcyk7XG5cbiAgICBmb3IgKGNvbnN0IGVudmlyb25tZW50IG9mIGVudmlyb25tZW50cykge1xuICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmluZm8oY2hhbGsuZ3JlZW4oJyDij7MgIEdhcmJhZ2UgQ29sbGVjdGluZyBlbnZpcm9ubWVudCAlcy4uLicpLCBjaGFsay5ibHVlKGVudmlyb25tZW50Lm5hbWUpKTtcbiAgICAgIGNvbnN0IGdjID0gbmV3IEdhcmJhZ2VDb2xsZWN0b3Ioe1xuICAgICAgICBzZGtQcm92aWRlcjogdGhpcy5wcm9wcy5zZGtQcm92aWRlcixcbiAgICAgICAgaW9IZWxwZXI6IGFzSW9IZWxwZXIodGhpcy5pb0hvc3QsICdnYycpLFxuICAgICAgICByZXNvbHZlZEVudmlyb25tZW50OiBlbnZpcm9ubWVudCxcbiAgICAgICAgYm9vdHN0cmFwU3RhY2tOYW1lOiBvcHRpb25zLmJvb3RzdHJhcFN0YWNrTmFtZSxcbiAgICAgICAgcm9sbGJhY2tCdWZmZXJEYXlzOiBvcHRpb25zLnJvbGxiYWNrQnVmZmVyRGF5cyxcbiAgICAgICAgY3JlYXRlZEJ1ZmZlckRheXM6IG9wdGlvbnMuY3JlYXRlZEJ1ZmZlckRheXMsXG4gICAgICAgIGFjdGlvbjogb3B0aW9ucy5hY3Rpb24gPz8gJ2Z1bGwnLFxuICAgICAgICB0eXBlOiBvcHRpb25zLnR5cGUgPz8gJ2FsbCcsXG4gICAgICAgIGNvbmZpcm06IG9wdGlvbnMuY29uZmlybSA/PyB0cnVlLFxuICAgICAgfSk7XG4gICAgICBhd2FpdCBnYy5nYXJiYWdlQ29sbGVjdCgpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZGVmaW5lRW52aXJvbm1lbnRzKHVzZXJFbnZpcm9ubWVudFNwZWNzOiBzdHJpbmdbXSk6IFByb21pc2U8Y3hhcGkuRW52aXJvbm1lbnRbXT4ge1xuICAgIC8vIEJ5IGRlZmF1bHQsIGdsb2IgZm9yIGV2ZXJ5dGhpbmdcbiAgICBjb25zdCBlbnZpcm9ubWVudFNwZWNzID0gdXNlckVudmlyb25tZW50U3BlY3MubGVuZ3RoID4gMCA/IFsuLi51c2VyRW52aXJvbm1lbnRTcGVjc10gOiBbJyoqJ107XG5cbiAgICAvLyBQYXJ0aXRpb24gaW50byBnbG9icyBhbmQgbm9uLWdsb2JzICh0aGlzIHdpbGwgbXV0YXRlIGVudmlyb25tZW50U3BlY3MpLlxuICAgIGNvbnN0IGdsb2JTcGVjcyA9IHBhcnRpdGlvbihlbnZpcm9ubWVudFNwZWNzLCBsb29rc0xpa2VHbG9iKTtcbiAgICBpZiAoZ2xvYlNwZWNzLmxlbmd0aCA+IDAgJiYgIXRoaXMucHJvcHMuY2xvdWRFeGVjdXRhYmxlLmhhc0FwcCkge1xuICAgICAgaWYgKHVzZXJFbnZpcm9ubWVudFNwZWNzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgLy8gVXNlciBkaWQgcmVxdWVzdCB0aGlzIGdsb2JcbiAgICAgICAgdGhyb3cgbmV3IFRvb2xraXRFcnJvcihcbiAgICAgICAgICBgJyR7Z2xvYlNwZWNzfScgaXMgbm90IGFuIGVudmlyb25tZW50IG5hbWUuIFNwZWNpZnkgYW4gZW52aXJvbm1lbnQgbmFtZSBsaWtlICdhd3M6Ly8xMjM0NTY3ODkwMTIvdXMtZWFzdC0xJywgb3IgcnVuIGluIGEgZGlyZWN0b3J5IHdpdGggJ2Nkay5qc29uJyB0byB1c2Ugd2lsZGNhcmRzLmAsXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBVc2VyIGRpZCBub3QgcmVxdWVzdCBhbnl0aGluZ1xuICAgICAgICB0aHJvdyBuZXcgVG9vbGtpdEVycm9yKFxuICAgICAgICAgIFwiU3BlY2lmeSBhbiBlbnZpcm9ubWVudCBuYW1lIGxpa2UgJ2F3czovLzEyMzQ1Njc4OTAxMi91cy1lYXN0LTEnLCBvciBydW4gaW4gYSBkaXJlY3Rvcnkgd2l0aCAnY2RrLmpzb24nLlwiLFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGVudmlyb25tZW50czogY3hhcGkuRW52aXJvbm1lbnRbXSA9IFsuLi5lbnZpcm9ubWVudHNGcm9tRGVzY3JpcHRvcnMoZW52aXJvbm1lbnRTcGVjcyldO1xuXG4gICAgLy8gSWYgdGhlcmUgaXMgYW4gJy0tYXBwJyBhcmd1bWVudCwgc2VsZWN0IHRoZSBlbnZpcm9ubWVudHMgZnJvbSB0aGUgYXBwLlxuICAgIGlmICh0aGlzLnByb3BzLmNsb3VkRXhlY3V0YWJsZS5oYXNBcHApIHtcbiAgICAgIGVudmlyb25tZW50cy5wdXNoKFxuICAgICAgICAuLi4oYXdhaXQgZ2xvYkVudmlyb25tZW50c0Zyb21TdGFja3MoYXdhaXQgdGhpcy5zZWxlY3RTdGFja3NGb3JMaXN0KFtdKSwgZ2xvYlNwZWNzLCB0aGlzLnByb3BzLnNka1Byb3ZpZGVyKSksXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiBlbnZpcm9ubWVudHM7XG4gIH1cblxuICAvKipcbiAgICogTWlncmF0ZXMgYSBDbG91ZEZvcm1hdGlvbiBzdGFjay90ZW1wbGF0ZSB0byBhIENESyBhcHBcbiAgICogQHBhcmFtIG9wdGlvbnMgLSBPcHRpb25zIGZvciBDREsgYXBwIGNyZWF0aW9uXG4gICAqL1xuICBwdWJsaWMgYXN5bmMgbWlncmF0ZShvcHRpb25zOiBNaWdyYXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy53YXJuKCdUaGlzIGNvbW1hbmQgaXMgYW4gZXhwZXJpbWVudGFsIGZlYXR1cmUuJyk7XG4gICAgY29uc3QgbGFuZ3VhZ2UgPSBvcHRpb25zLmxhbmd1YWdlPy50b0xvd2VyQ2FzZSgpID8/ICd0eXBlc2NyaXB0JztcbiAgICBjb25zdCBlbnZpcm9ubWVudCA9IHNldEVudmlyb25tZW50KG9wdGlvbnMuYWNjb3VudCwgb3B0aW9ucy5yZWdpb24pO1xuICAgIGxldCBnZW5lcmF0ZVRlbXBsYXRlT3V0cHV0OiBHZW5lcmF0ZVRlbXBsYXRlT3V0cHV0IHwgdW5kZWZpbmVkO1xuICAgIGxldCBjZm46IENmblRlbXBsYXRlR2VuZXJhdG9yUHJvdmlkZXIgfCB1bmRlZmluZWQ7XG4gICAgbGV0IHRlbXBsYXRlVG9EZWxldGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgIHRyeSB7XG4gICAgICAvLyBpZiBuZWl0aGVyIGZyb21QYXRoIG5vciBmcm9tU3RhY2sgaXMgcHJvdmlkZWQsIGdlbmVyYXRlIGEgdGVtcGxhdGUgdXNpbmcgY2xvdWRmb3JtYXRpb25cbiAgICAgIGNvbnN0IHNjYW5UeXBlID0gcGFyc2VTb3VyY2VPcHRpb25zKG9wdGlvbnMuZnJvbVBhdGgsIG9wdGlvbnMuZnJvbVN0YWNrLCBvcHRpb25zLnN0YWNrTmFtZSkuc291cmNlO1xuICAgICAgaWYgKHNjYW5UeXBlID09IFRlbXBsYXRlU291cmNlT3B0aW9ucy5TQ0FOKSB7XG4gICAgICAgIGdlbmVyYXRlVGVtcGxhdGVPdXRwdXQgPSBhd2FpdCBnZW5lcmF0ZVRlbXBsYXRlKHtcbiAgICAgICAgICBzdGFja05hbWU6IG9wdGlvbnMuc3RhY2tOYW1lLFxuICAgICAgICAgIGZpbHRlcnM6IG9wdGlvbnMuZmlsdGVyLFxuICAgICAgICAgIGZyb21TY2FuOiBvcHRpb25zLmZyb21TY2FuLFxuICAgICAgICAgIHNka1Byb3ZpZGVyOiB0aGlzLnByb3BzLnNka1Byb3ZpZGVyLFxuICAgICAgICAgIGVudmlyb25tZW50OiBlbnZpcm9ubWVudCxcbiAgICAgICAgICBpb0hlbHBlcjogdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLFxuICAgICAgICB9KTtcbiAgICAgICAgdGVtcGxhdGVUb0RlbGV0ZSA9IGdlbmVyYXRlVGVtcGxhdGVPdXRwdXQudGVtcGxhdGVJZDtcbiAgICAgIH0gZWxzZSBpZiAoc2NhblR5cGUgPT0gVGVtcGxhdGVTb3VyY2VPcHRpb25zLlBBVEgpIHtcbiAgICAgICAgY29uc3QgdGVtcGxhdGVCb2R5ID0gcmVhZEZyb21QYXRoKG9wdGlvbnMuZnJvbVBhdGghKTtcblxuICAgICAgICBjb25zdCBwYXJzZWRUZW1wbGF0ZSA9IGRlc2VyaWFsaXplU3RydWN0dXJlKHRlbXBsYXRlQm9keSk7XG4gICAgICAgIGNvbnN0IHRlbXBsYXRlSWQgPSBwYXJzZWRUZW1wbGF0ZS5NZXRhZGF0YT8uQVdTVG9vbHNNZXRyaWNzPy5JYUNfR2VuZXJhdG9yPy50b1N0cmluZygpO1xuICAgICAgICBpZiAodGVtcGxhdGVJZCkge1xuICAgICAgICAgIC8vIGlmIHdlIGhhdmUgYSB0ZW1wbGF0ZSBpZCwgd2UgY2FuIGNhbGwgZGVzY3JpYmUgZ2VuZXJhdGVkIHRlbXBsYXRlIHRvIGdldCB0aGUgcmVzb3VyY2UgaWRlbnRpZmllcnNcbiAgICAgICAgICAvLyByZXNvdXJjZSBtZXRhZGF0YSwgYW5kIHRlbXBsYXRlIHNvdXJjZSB0byBnZW5lcmF0ZSB0aGUgdGVtcGxhdGVcbiAgICAgICAgICBjZm4gPSBuZXcgQ2ZuVGVtcGxhdGVHZW5lcmF0b3JQcm92aWRlcihhd2FpdCBidWlsZENmbkNsaWVudCh0aGlzLnByb3BzLnNka1Byb3ZpZGVyLCBlbnZpcm9ubWVudCksIHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKSk7XG4gICAgICAgICAgY29uc3QgZ2VuZXJhdGVkVGVtcGxhdGVTdW1tYXJ5ID0gYXdhaXQgY2ZuLmRlc2NyaWJlR2VuZXJhdGVkVGVtcGxhdGUodGVtcGxhdGVJZCk7XG4gICAgICAgICAgZ2VuZXJhdGVUZW1wbGF0ZU91dHB1dCA9IGJ1aWxkR2VuZXJhdGVkVGVtcGxhdGVPdXRwdXQoXG4gICAgICAgICAgICBnZW5lcmF0ZWRUZW1wbGF0ZVN1bW1hcnksXG4gICAgICAgICAgICB0ZW1wbGF0ZUJvZHksXG4gICAgICAgICAgICBnZW5lcmF0ZWRUZW1wbGF0ZVN1bW1hcnkuR2VuZXJhdGVkVGVtcGxhdGVJZCEsXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBnZW5lcmF0ZVRlbXBsYXRlT3V0cHV0ID0ge1xuICAgICAgICAgICAgbWlncmF0ZUpzb246IHtcbiAgICAgICAgICAgICAgdGVtcGxhdGVCb2R5OiB0ZW1wbGF0ZUJvZHksXG4gICAgICAgICAgICAgIHNvdXJjZTogJ2xvY2FsZmlsZScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoc2NhblR5cGUgPT0gVGVtcGxhdGVTb3VyY2VPcHRpb25zLlNUQUNLKSB7XG4gICAgICAgIGNvbnN0IHRlbXBsYXRlID0gYXdhaXQgcmVhZEZyb21TdGFjayhvcHRpb25zLnN0YWNrTmFtZSwgdGhpcy5wcm9wcy5zZGtQcm92aWRlciwgZW52aXJvbm1lbnQpO1xuICAgICAgICBpZiAoIXRlbXBsYXRlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFRvb2xraXRFcnJvcihgTm8gdGVtcGxhdGUgZm91bmQgZm9yIHN0YWNrLW5hbWU6ICR7b3B0aW9ucy5zdGFja05hbWV9YCk7XG4gICAgICAgIH1cbiAgICAgICAgZ2VuZXJhdGVUZW1wbGF0ZU91dHB1dCA9IHtcbiAgICAgICAgICBtaWdyYXRlSnNvbjoge1xuICAgICAgICAgICAgdGVtcGxhdGVCb2R5OiB0ZW1wbGF0ZSxcbiAgICAgICAgICAgIHNvdXJjZTogb3B0aW9ucy5zdGFja05hbWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFdlIHNob3VsZG4ndCBldmVyIGdldCBoZXJlLCBidXQganVzdCBpbiBjYXNlLlxuICAgICAgICB0aHJvdyBuZXcgVG9vbGtpdEVycm9yKGBJbnZhbGlkIHNvdXJjZSBvcHRpb24gcHJvdmlkZWQ6ICR7c2NhblR5cGV9YCk7XG4gICAgICB9XG4gICAgICBjb25zdCBzdGFjayA9IGdlbmVyYXRlU3RhY2soZ2VuZXJhdGVUZW1wbGF0ZU91dHB1dC5taWdyYXRlSnNvbi50ZW1wbGF0ZUJvZHksIG9wdGlvbnMuc3RhY2tOYW1lLCBsYW5ndWFnZSk7XG4gICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuaW5mbyhjaGFsay5ncmVlbignIOKPsyAgR2VuZXJhdGluZyBDREsgYXBwIGZvciAlcy4uLicpLCBjaGFsay5ibHVlKG9wdGlvbnMuc3RhY2tOYW1lKSk7XG4gICAgICBhd2FpdCBnZW5lcmF0ZUNka0FwcCh0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCksIG9wdGlvbnMuc3RhY2tOYW1lLCBzdGFjayEsIGxhbmd1YWdlLCBvcHRpb25zLm91dHB1dFBhdGgsIG9wdGlvbnMuY29tcHJlc3MpO1xuICAgICAgaWYgKGdlbmVyYXRlVGVtcGxhdGVPdXRwdXQpIHtcbiAgICAgICAgd3JpdGVNaWdyYXRlSnNvbkZpbGUob3B0aW9ucy5vdXRwdXRQYXRoLCBvcHRpb25zLnN0YWNrTmFtZSwgZ2VuZXJhdGVUZW1wbGF0ZU91dHB1dC5taWdyYXRlSnNvbik7XG4gICAgICB9XG4gICAgICBpZiAoaXNUaGVyZUFXYXJuaW5nKGdlbmVyYXRlVGVtcGxhdGVPdXRwdXQpKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKS5kZWZhdWx0cy53YXJuKFxuICAgICAgICAgICcg4pqg77iPICBTb21lIHJlc291cmNlcyBjb3VsZCBub3QgYmUgbWlncmF0ZWQgY29tcGxldGVseS4gUGxlYXNlIHJldmlldyB0aGUgUkVBRE1FLm1kIGZpbGUgZm9yIG1vcmUgaW5mb3JtYXRpb24uJyxcbiAgICAgICAgKTtcbiAgICAgICAgYXBwZW5kV2FybmluZ3NUb1JlYWRtZShcbiAgICAgICAgICBgJHtwYXRoLmpvaW4ob3B0aW9ucy5vdXRwdXRQYXRoID8/IHByb2Nlc3MuY3dkKCksIG9wdGlvbnMuc3RhY2tOYW1lKX0vUkVBRE1FLm1kYCxcbiAgICAgICAgICBnZW5lcmF0ZVRlbXBsYXRlT3V0cHV0LnJlc291cmNlcyEsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgYXdhaXQgdGhpcy5pb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLmVycm9yKCcg4p2MICBNaWdyYXRlIGZhaWxlZCBmb3IgYCVzYDogJXMnLCBvcHRpb25zLnN0YWNrTmFtZSwgKGUgYXMgRXJyb3IpLm1lc3NhZ2UpO1xuICAgICAgdGhyb3cgZTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgaWYgKHRlbXBsYXRlVG9EZWxldGUpIHtcbiAgICAgICAgaWYgKCFjZm4pIHtcbiAgICAgICAgICBjZm4gPSBuZXcgQ2ZuVGVtcGxhdGVHZW5lcmF0b3JQcm92aWRlcihhd2FpdCBidWlsZENmbkNsaWVudCh0aGlzLnByb3BzLnNka1Byb3ZpZGVyLCBlbnZpcm9ubWVudCksIHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFwcm9jZXNzLmVudi5NSUdSQVRFX0lOVEVHX1RFU1QpIHtcbiAgICAgICAgICBhd2FpdCBjZm4uZGVsZXRlR2VuZXJhdGVkVGVtcGxhdGUodGVtcGxhdGVUb0RlbGV0ZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcmVmYWN0b3Iob3B0aW9uczogUmVmYWN0b3JPcHRpb25zKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICBpZiAob3B0aW9ucy5yZXZlcnQgJiYgIW9wdGlvbnMub3ZlcnJpZGVGaWxlKSB7XG4gICAgICB0aHJvdyBuZXcgVG9vbGtpdEVycm9yKCdUaGUgLS1yZXZlcnQgb3B0aW9uIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCB0aGUgLS1vdmVycmlkZS1maWxlIG9wdGlvbi4nKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgcGF0dGVybnMgPSBvcHRpb25zLnN0YWNrcz8ucGF0dGVybnMgPz8gW107XG4gICAgICBhd2FpdCB0aGlzLnRvb2xraXQucmVmYWN0b3IodGhpcy5wcm9wcy5jbG91ZEV4ZWN1dGFibGUsIHtcbiAgICAgICAgZHJ5UnVuOiBvcHRpb25zLmRyeVJ1bixcbiAgICAgICAgc3RhY2tzOiB7XG4gICAgICAgICAgcGF0dGVybnM6IHBhdHRlcm5zLFxuICAgICAgICAgIHN0cmF0ZWd5OiBwYXR0ZXJucy5sZW5ndGggPiAwID8gU3RhY2tTZWxlY3Rpb25TdHJhdGVneS5QQVRURVJOX01BVENIIDogU3RhY2tTZWxlY3Rpb25TdHJhdGVneS5BTExfU1RBQ0tTLFxuICAgICAgICB9LFxuICAgICAgICBmb3JjZTogb3B0aW9ucy5mb3JjZSxcbiAgICAgICAgYWRkaXRpb25hbFN0YWNrTmFtZXM6IG9wdGlvbnMuYWRkaXRpb25hbFN0YWNrTmFtZXMsXG4gICAgICAgIG92ZXJyaWRlczogcmVhZE92ZXJyaWRlcyhvcHRpb25zLm92ZXJyaWRlRmlsZSwgb3B0aW9ucy5yZXZlcnQpLFxuICAgICAgICByb2xlQXJuOiBvcHRpb25zLnJvbGVBcm4sXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBhd2FpdCB0aGlzLmlvSG9zdC5hc0lvSGVscGVyKCkuZGVmYXVsdHMuZXJyb3IoKGUgYXMgRXJyb3IpLm1lc3NhZ2UpO1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG5cbiAgICByZXR1cm4gMDtcblxuICAgIGZ1bmN0aW9uIHJlYWRPdmVycmlkZXMoZmlsZVBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCwgcmV2ZXJ0OiBib29sZWFuID0gZmFsc2UpIHtcbiAgICAgIGlmIChmaWxlUGF0aCA9PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH1cbiAgICAgIGlmICghZnMucGF0aEV4aXN0c1N5bmMoZmlsZVBhdGgpKSB7XG4gICAgICAgIHRocm93IG5ldyBUb29sa2l0RXJyb3IoYFRoZSBtYXBwaW5nIGZpbGUgJHtmaWxlUGF0aH0gZG9lcyBub3QgZXhpc3RgKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGdyb3VwcyA9IHBhcnNlTWFwcGluZ0dyb3Vwcyhmcy5yZWFkRmlsZVN5bmMoZmlsZVBhdGgpLnRvU3RyaW5nKCd1dGYtOCcpKTtcblxuICAgICAgcmV0dXJuIHJldmVydFxuICAgICAgICA/IGdyb3Vwcy5tYXAoKGdyb3VwKSA9PiAoe1xuICAgICAgICAgIC4uLmdyb3VwLFxuICAgICAgICAgIHJlc291cmNlczogT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5lbnRyaWVzKGdyb3VwLnJlc291cmNlcyA/PyB7fSkubWFwKChbc3JjLCBkc3RdKSA9PiBbZHN0LCBzcmNdKSksXG4gICAgICAgIH0pKVxuICAgICAgICA6IGdyb3VwcztcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHNlbGVjdFN0YWNrc0Zvckxpc3QocGF0dGVybnM6IHN0cmluZ1tdKSB7XG4gICAgY29uc3QgYXNzZW1ibHkgPSBhd2FpdCB0aGlzLmFzc2VtYmx5KCk7XG4gICAgY29uc3Qgc3RhY2tzID0gYXdhaXQgYXNzZW1ibHkuc2VsZWN0U3RhY2tzKHsgcGF0dGVybnMgfSwgeyBkZWZhdWx0QmVoYXZpb3I6IERlZmF1bHRTZWxlY3Rpb24uQWxsU3RhY2tzIH0pO1xuXG4gICAgLy8gTm8gdmFsaWRhdGlvblxuXG4gICAgcmV0dXJuIHN0YWNrcztcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2VsZWN0U3RhY2tzRm9yRGVwbG95KFxuICAgIHNlbGVjdG9yOiBTdGFja1NlbGVjdG9yLFxuICAgIGV4Y2x1c2l2ZWx5PzogYm9vbGVhbixcbiAgICBjYWNoZUNsb3VkQXNzZW1ibHk/OiBib29sZWFuLFxuICAgIGlnbm9yZU5vU3RhY2tzPzogYm9vbGVhbixcbiAgKTogUHJvbWlzZTxTdGFja0NvbGxlY3Rpb24+IHtcbiAgICBjb25zdCBhc3NlbWJseSA9IGF3YWl0IHRoaXMuYXNzZW1ibHkoY2FjaGVDbG91ZEFzc2VtYmx5KTtcbiAgICBjb25zdCBzdGFja3MgPSBhd2FpdCBhc3NlbWJseS5zZWxlY3RTdGFja3Moc2VsZWN0b3IsIHtcbiAgICAgIGV4dGVuZDogZXhjbHVzaXZlbHkgPyBFeHRlbmRlZFN0YWNrU2VsZWN0aW9uLk5vbmUgOiBFeHRlbmRlZFN0YWNrU2VsZWN0aW9uLlVwc3RyZWFtLFxuICAgICAgZGVmYXVsdEJlaGF2aW9yOiBEZWZhdWx0U2VsZWN0aW9uLk9ubHlTaW5nbGUsXG4gICAgICBpZ25vcmVOb1N0YWNrcyxcbiAgICB9KTtcblxuICAgIHRoaXMudmFsaWRhdGVTdGFja3NTZWxlY3RlZChzdGFja3MsIHNlbGVjdG9yLnBhdHRlcm5zKTtcbiAgICBhd2FpdCB0aGlzLnZhbGlkYXRlU3RhY2tzKHN0YWNrcyk7XG5cbiAgICByZXR1cm4gc3RhY2tzO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzZWxlY3RTdGFja3NGb3JEaWZmKFxuICAgIHN0YWNrTmFtZXM6IHN0cmluZ1tdLFxuICAgIGV4Y2x1c2l2ZWx5PzogYm9vbGVhbixcbiAgICBhdXRvVmFsaWRhdGU/OiBib29sZWFuLFxuICApOiBQcm9taXNlPFN0YWNrQ29sbGVjdGlvbj4ge1xuICAgIGNvbnN0IGFzc2VtYmx5ID0gYXdhaXQgdGhpcy5hc3NlbWJseSgpO1xuXG4gICAgY29uc3Qgc2VsZWN0ZWRGb3JEaWZmID0gYXdhaXQgYXNzZW1ibHkuc2VsZWN0U3RhY2tzKFxuICAgICAgeyBwYXR0ZXJuczogc3RhY2tOYW1lcyB9LFxuICAgICAge1xuICAgICAgICBleHRlbmQ6IGV4Y2x1c2l2ZWx5ID8gRXh0ZW5kZWRTdGFja1NlbGVjdGlvbi5Ob25lIDogRXh0ZW5kZWRTdGFja1NlbGVjdGlvbi5VcHN0cmVhbSxcbiAgICAgICAgZGVmYXVsdEJlaGF2aW9yOiBEZWZhdWx0U2VsZWN0aW9uLk1haW5Bc3NlbWJseSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIGNvbnN0IGFsbFN0YWNrcyA9IGF3YWl0IHRoaXMuc2VsZWN0U3RhY2tzRm9yTGlzdChbXSk7XG4gICAgY29uc3QgYXV0b1ZhbGlkYXRlU3RhY2tzID0gYXV0b1ZhbGlkYXRlXG4gICAgICA/IGFsbFN0YWNrcy5maWx0ZXIoKGFydCkgPT4gYXJ0LnZhbGlkYXRlT25TeW50aCA/PyBmYWxzZSlcbiAgICAgIDogbmV3IFN0YWNrQ29sbGVjdGlvbihhc3NlbWJseSwgW10pO1xuXG4gICAgdGhpcy52YWxpZGF0ZVN0YWNrc1NlbGVjdGVkKHNlbGVjdGVkRm9yRGlmZi5jb25jYXQoYXV0b1ZhbGlkYXRlU3RhY2tzKSwgc3RhY2tOYW1lcyk7XG4gICAgYXdhaXQgdGhpcy52YWxpZGF0ZVN0YWNrcyhzZWxlY3RlZEZvckRpZmYuY29uY2F0KGF1dG9WYWxpZGF0ZVN0YWNrcykpO1xuXG4gICAgcmV0dXJuIHNlbGVjdGVkRm9yRGlmZjtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc2VsZWN0U3RhY2tzRm9yRGVzdHJveShzZWxlY3RvcjogU3RhY2tTZWxlY3RvciwgZXhjbHVzaXZlbHk/OiBib29sZWFuKSB7XG4gICAgY29uc3QgYXNzZW1ibHkgPSBhd2FpdCB0aGlzLmFzc2VtYmx5KCk7XG4gICAgY29uc3Qgc3RhY2tzID0gYXdhaXQgYXNzZW1ibHkuc2VsZWN0U3RhY2tzKHNlbGVjdG9yLCB7XG4gICAgICBleHRlbmQ6IGV4Y2x1c2l2ZWx5ID8gRXh0ZW5kZWRTdGFja1NlbGVjdGlvbi5Ob25lIDogRXh0ZW5kZWRTdGFja1NlbGVjdGlvbi5Eb3duc3RyZWFtLFxuICAgICAgZGVmYXVsdEJlaGF2aW9yOiBEZWZhdWx0U2VsZWN0aW9uLk9ubHlTaW5nbGUsXG4gICAgfSk7XG5cbiAgICAvLyBObyB2YWxpZGF0aW9uXG5cbiAgICByZXR1cm4gc3RhY2tzO1xuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlIHRoZSBzdGFja3MgZm9yIGVycm9ycyBhbmQgd2FybmluZ3MgYWNjb3JkaW5nIHRvIHRoZSBDTEkncyBjdXJyZW50IHNldHRpbmdzXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlU3RhY2tzKHN0YWNrczogU3RhY2tDb2xsZWN0aW9uKSB7XG4gICAgY29uc3QgZmFpbEF0ID0gdGhpcy52YWxpZGF0ZU1ldGFkYXRhRmFpbEF0KCk7XG4gICAgYXdhaXQgc3RhY2tzLnZhbGlkYXRlTWV0YWRhdGEoZmFpbEF0LCBzdGFja01ldGFkYXRhTG9nZ2VyKHRoaXMuaW9Ib3N0LmFzSW9IZWxwZXIoKSwgdGhpcy5wcm9wcy52ZXJib3NlKSk7XG4gIH1cblxuICBwcml2YXRlIHZhbGlkYXRlTWV0YWRhdGFGYWlsQXQoKTogJ3dhcm4nIHwgJ2Vycm9yJyB8ICdub25lJyB7XG4gICAgbGV0IGZhaWxBdDogJ3dhcm4nIHwgJ2Vycm9yJyB8ICdub25lJyA9ICdlcnJvcic7XG4gICAgaWYgKHRoaXMucHJvcHMuaWdub3JlRXJyb3JzKSB7XG4gICAgICBmYWlsQXQgPSAnbm9uZSc7XG4gICAgfVxuICAgIGlmICh0aGlzLnByb3BzLnN0cmljdCkge1xuICAgICAgZmFpbEF0ID0gJ3dhcm4nO1xuICAgIH1cblxuICAgIHJldHVybiBmYWlsQXQ7XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGUgdGhhdCBpZiBhIHVzZXIgc3BlY2lmaWVkIGEgc3RhY2sgbmFtZSB0aGVyZSBleGlzdHMgYXQgbGVhc3QgMSBzdGFjayBzZWxlY3RlZFxuICAgKi9cbiAgcHJpdmF0ZSB2YWxpZGF0ZVN0YWNrc1NlbGVjdGVkKHN0YWNrczogU3RhY2tDb2xsZWN0aW9uLCBzdGFja05hbWVzOiBzdHJpbmdbXSkge1xuICAgIGlmIChzdGFja05hbWVzLmxlbmd0aCAhPSAwICYmIHN0YWNrcy5zdGFja0NvdW50ID09IDApIHtcbiAgICAgIHRocm93IG5ldyBUb29sa2l0RXJyb3IoYE5vIHN0YWNrcyBtYXRjaCB0aGUgbmFtZShzKSAke3N0YWNrTmFtZXN9YCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFNlbGVjdCBhIHNpbmdsZSBzdGFjayBieSBpdHMgbmFtZVxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBzZWxlY3RTaW5nbGVTdGFja0J5TmFtZShzdGFja05hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IGFzc2VtYmx5ID0gYXdhaXQgdGhpcy5hc3NlbWJseSgpO1xuXG4gICAgY29uc3Qgc3RhY2tzID0gYXdhaXQgYXNzZW1ibHkuc2VsZWN0U3RhY2tzKFxuICAgICAgeyBwYXR0ZXJuczogW3N0YWNrTmFtZV0gfSxcbiAgICAgIHtcbiAgICAgICAgZXh0ZW5kOiBFeHRlbmRlZFN0YWNrU2VsZWN0aW9uLk5vbmUsXG4gICAgICAgIGRlZmF1bHRCZWhhdmlvcjogRGVmYXVsdFNlbGVjdGlvbi5Ob25lLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gQ291bGQgaGF2ZSBiZWVuIGEgZ2xvYiBzbyBjaGVjayB0aGF0IHdlIGV2YWx1YXRlZCB0byBleGFjdGx5IG9uZVxuICAgIGlmIChzdGFja3Muc3RhY2tDb3VudCA+IDEpIHtcbiAgICAgIHRocm93IG5ldyBUb29sa2l0RXJyb3IoYFRoaXMgY29tbWFuZCByZXF1aXJlcyBleGFjdGx5IG9uZSBzdGFjayBhbmQgd2UgbWF0Y2hlZCBtb3JlIHRoYW4gb25lOiAke3N0YWNrcy5zdGFja0lkc31gKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYXNzZW1ibHkuc3RhY2tCeUlkKHN0YWNrcy5maXJzdFN0YWNrLmlkKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3NlbWJseShjYWNoZUNsb3VkQXNzZW1ibHk/OiBib29sZWFuKTogUHJvbWlzZTxDbG91ZEFzc2VtYmx5PiB7XG4gICAgcmV0dXJuIHRoaXMucHJvcHMuY2xvdWRFeGVjdXRhYmxlLnN5bnRoZXNpemUoY2FjaGVDbG91ZEFzc2VtYmx5KTtcbiAgfVxuXG4gIHByaXZhdGUgcGF0dGVybnNBcnJheUZvcldhdGNoKFxuICAgIHBhdHRlcm5zOiBzdHJpbmcgfCBzdHJpbmdbXSB8IHVuZGVmaW5lZCxcbiAgICBvcHRpb25zOiB7IHJvb3REaXI6IHN0cmluZzsgcmV0dXJuUm9vdERpcklmRW1wdHk6IGJvb2xlYW4gfSxcbiAgKTogc3RyaW5nW10ge1xuICAgIGNvbnN0IHBhdHRlcm5zQXJyYXk6IHN0cmluZ1tdID0gcGF0dGVybnMgIT09IHVuZGVmaW5lZCA/IChBcnJheS5pc0FycmF5KHBhdHRlcm5zKSA/IHBhdHRlcm5zIDogW3BhdHRlcm5zXSkgOiBbXTtcbiAgICByZXR1cm4gcGF0dGVybnNBcnJheS5sZW5ndGggPiAwID8gcGF0dGVybnNBcnJheSA6IG9wdGlvbnMucmV0dXJuUm9vdERpcklmRW1wdHkgPyBbb3B0aW9ucy5yb290RGlyXSA6IFtdO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBpbnZva2VEZXBsb3lGcm9tV2F0Y2goXG4gICAgb3B0aW9uczogV2F0Y2hPcHRpb25zLFxuICAgIGNsb3VkV2F0Y2hMb2dNb25pdG9yPzogQ2xvdWRXYXRjaExvZ0V2ZW50TW9uaXRvcixcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgZGVwbG95T3B0aW9uczogRGVwbG95T3B0aW9ucyA9IHtcbiAgICAgIC4uLm9wdGlvbnMsXG4gICAgICByZXF1aXJlQXBwcm92YWw6IFJlcXVpcmVBcHByb3ZhbC5ORVZFUixcbiAgICAgIC8vIGlmICd3YXRjaCcgaXMgY2FsbGVkIGJ5IGludm9raW5nICdjZGsgZGVwbG95IC0td2F0Y2gnLFxuICAgICAgLy8gd2UgbmVlZCB0byBtYWtlIHN1cmUgdG8gbm90IGNhbGwgJ2RlcGxveScgd2l0aCAnd2F0Y2gnIGFnYWluLFxuICAgICAgLy8gYXMgdGhhdCB3b3VsZCBsZWFkIHRvIGEgY3ljbGVcbiAgICAgIHdhdGNoOiBmYWxzZSxcbiAgICAgIGNsb3VkV2F0Y2hMb2dNb25pdG9yLFxuICAgICAgY2FjaGVDbG91ZEFzc2VtYmx5OiBmYWxzZSxcbiAgICAgIGV4dHJhVXNlckFnZW50OiBgY2RrLXdhdGNoL2hvdHN3YXAtJHtvcHRpb25zLmRlcGxveW1lbnRNZXRob2Q/Lm1ldGhvZCA9PT0gJ2hvdHN3YXAnID8gJ29uJyA6ICdvZmYnfWAsXG4gICAgICBjb25jdXJyZW5jeTogb3B0aW9ucy5jb25jdXJyZW5jeSxcbiAgICB9O1xuXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuZGVwbG95KGRlcGxveU9wdGlvbnMpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgLy8ganVzdCBjb250aW51ZSAtIGRlcGxveSB3aWxsIHNob3cgdGhlIGVycm9yXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZSB0aGUgYXNzZXQgcHVibGlzaGluZyBhbmQgYnVpbGRpbmcgZnJvbSB0aGUgd29yayBncmFwaCBmb3IgYXNzZXRzIHRoYXQgYXJlIGFscmVhZHkgaW4gcGxhY2VcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgcmVtb3ZlUHVibGlzaGVkQXNzZXRzKGdyYXBoOiBXb3JrR3JhcGgsIG9wdGlvbnM6IERlcGxveU9wdGlvbnMpIHtcbiAgICBhd2FpdCBncmFwaC5yZW1vdmVVbm5lY2Vzc2FyeUFzc2V0cyhhc3NldE5vZGUgPT4gdGhpcy5wcm9wcy5kZXBsb3ltZW50cy5pc1NpbmdsZUFzc2V0UHVibGlzaGVkKGFzc2V0Tm9kZS5hc3NldE1hbmlmZXN0LCBhc3NldE5vZGUuYXNzZXQsIHtcbiAgICAgIHN0YWNrOiBhc3NldE5vZGUucGFyZW50U3RhY2ssXG4gICAgICByb2xlQXJuOiBvcHRpb25zLnJvbGVBcm4sXG4gICAgICBzdGFja05hbWU6IGFzc2V0Tm9kZS5wYXJlbnRTdGFjay5zdGFja05hbWUsXG4gICAgfSkpO1xuICB9XG59XG5cbi8qKlxuICogUHJpbnQgYSBzZXJpYWxpemVkIG9iamVjdCAoWUFNTCBvciBKU09OKSB0byBzdGRvdXQuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHByaW50U2VyaWFsaXplZE9iamVjdChpb0hlbHBlcjogSW9IZWxwZXIsIG9iajogYW55LCBqc29uOiBib29sZWFuKSB7XG4gIGF3YWl0IGlvSGVscGVyLmRlZmF1bHRzLnJlc3VsdChzZXJpYWxpemVTdHJ1Y3R1cmUob2JqLCBqc29uKSk7XG59XG5cbi8qKlxuICogT3B0aW9ucyBmb3IgdGhlIGRpZmYgY29tbWFuZFxuICovXG5leHBvcnQgaW50ZXJmYWNlIERpZmZPcHRpb25zIHtcbiAgLyoqXG4gICAqIFN0YWNrIG5hbWVzIHRvIGRpZmZcbiAgICovXG4gIHJlYWRvbmx5IHN0YWNrTmFtZXM6IHN0cmluZ1tdO1xuXG4gIC8qKlxuICAgKiBOYW1lIG9mIHRoZSB0b29sa2l0IHN0YWNrLCBpZiBub3QgdGhlIGRlZmF1bHQgbmFtZVxuICAgKlxuICAgKiBAZGVmYXVsdCAnQ0RLVG9vbGtpdCdcbiAgICovXG4gIHJlYWRvbmx5IHRvb2xraXRTdGFja05hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIE9ubHkgc2VsZWN0IHRoZSBnaXZlbiBzdGFja1xuICAgKlxuICAgKiBAZGVmYXVsdCBmYWxzZVxuICAgKi9cbiAgcmVhZG9ubHkgZXhjbHVzaXZlbHk/OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBVc2VkIGEgdGVtcGxhdGUgZnJvbSBkaXNrIGluc3RlYWQgb2YgZnJvbSB0aGUgc2VydmVyXG4gICAqXG4gICAqIEBkZWZhdWx0IFVzZSBmcm9tIHRoZSBzZXJ2ZXJcbiAgICovXG4gIHJlYWRvbmx5IHRlbXBsYXRlUGF0aD86IHN0cmluZztcblxuICAvKipcbiAgICogU3RyaWN0IGRpZmYgbW9kZVxuICAgKlxuICAgKiBAZGVmYXVsdCBmYWxzZVxuICAgKi9cbiAgcmVhZG9ubHkgc3RyaWN0PzogYm9vbGVhbjtcblxuICAvKipcbiAgICogSG93IG1hbnkgbGluZXMgb2YgY29udGV4dCB0byBzaG93IGluIHRoZSBkaWZmXG4gICAqXG4gICAqIEBkZWZhdWx0IDNcbiAgICovXG4gIHJlYWRvbmx5IGNvbnRleHRMaW5lcz86IG51bWJlcjtcblxuICAvKipcbiAgICogV2hldGhlciB0byBmYWlsIHdpdGggZXhpdCBjb2RlIDEgaW4gY2FzZSBvZiBkaWZmXG4gICAqXG4gICAqIEBkZWZhdWx0IGZhbHNlXG4gICAqL1xuICByZWFkb25seSBmYWlsPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogT25seSBydW4gZGlmZiBvbiBicm9hZGVuZWQgc2VjdXJpdHkgY2hhbmdlc1xuICAgKlxuICAgKiBAZGVmYXVsdCBmYWxzZVxuICAgKi9cbiAgcmVhZG9ubHkgc2VjdXJpdHlPbmx5PzogYm9vbGVhbjtcblxuICAvKipcbiAgICogV2hldGhlciB0byBydW4gdGhlIGRpZmYgYWdhaW5zdCB0aGUgdGVtcGxhdGUgYWZ0ZXIgdGhlIENsb3VkRm9ybWF0aW9uIFRyYW5zZm9ybXMgaW5zaWRlIGl0IGhhdmUgYmVlbiBleGVjdXRlZFxuICAgKiAoYXMgb3Bwb3NlZCB0byB0aGUgb3JpZ2luYWwgdGVtcGxhdGUsIHRoZSBkZWZhdWx0LCB3aGljaCBjb250YWlucyB0aGUgdW5wcm9jZXNzZWQgVHJhbnNmb3JtcykuXG4gICAqXG4gICAqIEBkZWZhdWx0IGZhbHNlXG4gICAqL1xuICByZWFkb25seSBjb21wYXJlQWdhaW5zdFByb2Nlc3NlZFRlbXBsYXRlPzogYm9vbGVhbjtcblxuICAvKlxuICAgKiBSdW4gZGlmZiBpbiBxdWlldCBtb2RlIHdpdGhvdXQgcHJpbnRpbmcgdGhlIGRpZmYgc3RhdHVzZXNcbiAgICpcbiAgICogQGRlZmF1bHQgZmFsc2VcbiAgICovXG4gIHJlYWRvbmx5IHF1aWV0PzogYm9vbGVhbjtcblxuICAvKipcbiAgICogQWRkaXRpb25hbCBwYXJhbWV0ZXJzIGZvciBDbG91ZEZvcm1hdGlvbiBhdCBkaWZmIHRpbWUsIHVzZWQgdG8gY3JlYXRlIGEgY2hhbmdlIHNldFxuICAgKiBAZGVmYXVsdCB7fVxuICAgKi9cbiAgcmVhZG9ubHkgcGFyYW1ldGVycz86IHsgW25hbWU6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXG4gIC8qKlxuICAgKiBXaGV0aGVyIG9yIG5vdCB0byBjcmVhdGUsIGFuYWx5emUsIGFuZCBzdWJzZXF1ZW50bHkgZGVsZXRlIGEgY2hhbmdlc2V0XG4gICAqXG4gICAqIEBkZWZhdWx0IHRydWVcbiAgICovXG4gIHJlYWRvbmx5IGNoYW5nZVNldD86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgb3Igbm90IHRoZSBjaGFuZ2Ugc2V0IGltcG9ydHMgcmVzb3VyY2VzIHRoYXQgYWxyZWFkeSBleGlzdC5cbiAgICpcbiAgICogQGRlZmF1bHQgZmFsc2VcbiAgICovXG4gIHJlYWRvbmx5IGltcG9ydEV4aXN0aW5nUmVzb3VyY2VzPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogV2hldGhlciB0byBpbmNsdWRlIHJlc291cmNlIG1vdmVzIGluIHRoZSBkaWZmXG4gICAqXG4gICAqIEBkZWZhdWx0IGZhbHNlXG4gICAqL1xuICByZWFkb25seSBpbmNsdWRlTW92ZXM/OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgQ2ZuRGVwbG95T3B0aW9ucyB7XG4gIC8qKlxuICAgKiBDcml0ZXJpYSBmb3Igc2VsZWN0aW5nIHN0YWNrcyB0byBkZXBsb3lcbiAgICovXG4gIHNlbGVjdG9yOiBTdGFja1NlbGVjdG9yO1xuXG4gIC8qKlxuICAgKiBOYW1lIG9mIHRoZSB0b29sa2l0IHN0YWNrIHRvIHVzZS9kZXBsb3lcbiAgICpcbiAgICogQGRlZmF1bHQgQ0RLVG9vbGtpdFxuICAgKi9cbiAgdG9vbGtpdFN0YWNrTmFtZT86IHN0cmluZztcblxuICAvKipcbiAgICogUm9sZSB0byBwYXNzIHRvIENsb3VkRm9ybWF0aW9uIGZvciBkZXBsb3ltZW50XG4gICAqL1xuICByb2xlQXJuPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBPcHRpb25hbCBuYW1lIHRvIHVzZSBmb3IgdGhlIENsb3VkRm9ybWF0aW9uIGNoYW5nZSBzZXQuXG4gICAqIElmIG5vdCBwcm92aWRlZCwgYSBuYW1lIHdpbGwgYmUgZ2VuZXJhdGVkIGF1dG9tYXRpY2FsbHkuXG4gICAqXG4gICAqIEBkZXByZWNhdGVkIFVzZSAnZGVwbG95bWVudE1ldGhvZCcgaW5zdGVhZFxuICAgKi9cbiAgY2hhbmdlU2V0TmFtZT86IHN0cmluZztcblxuICAvKipcbiAgICogV2hldGhlciB0byBleGVjdXRlIHRoZSBDaGFuZ2VTZXRcbiAgICogTm90IHByb3ZpZGluZyBgZXhlY3V0ZWAgcGFyYW1ldGVyIHdpbGwgcmVzdWx0IGluIGV4ZWN1dGlvbiBvZiBDaGFuZ2VTZXRcbiAgICpcbiAgICogQGRlZmF1bHQgdHJ1ZVxuICAgKiBAZGVwcmVjYXRlZCBVc2UgJ2RlcGxveW1lbnRNZXRob2QnIGluc3RlYWRcbiAgICovXG4gIGV4ZWN1dGU/OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBEZXBsb3ltZW50IG1ldGhvZFxuICAgKi9cbiAgcmVhZG9ubHkgZGVwbG95bWVudE1ldGhvZD86IERlcGxveW1lbnRNZXRob2Q7XG5cbiAgLyoqXG4gICAqIERpc3BsYXkgbW9kZSBmb3Igc3RhY2sgZGVwbG95bWVudCBwcm9ncmVzcy5cbiAgICpcbiAgICogQGRlZmF1bHQgLSBTdGFja0FjdGl2aXR5UHJvZ3Jlc3MuQmFyIC0gc3RhY2sgZXZlbnRzIHdpbGwgYmUgZGlzcGxheWVkIGZvclxuICAgKiAgIHRoZSByZXNvdXJjZSBjdXJyZW50bHkgYmVpbmcgZGVwbG95ZWQuXG4gICAqL1xuICBwcm9ncmVzcz86IFN0YWNrQWN0aXZpdHlQcm9ncmVzcztcblxuICAvKipcbiAgICogUm9sbGJhY2sgZmFpbGVkIGRlcGxveW1lbnRzXG4gICAqXG4gICAqIEBkZWZhdWx0IHRydWVcbiAgICovXG4gIHJlYWRvbmx5IHJvbGxiYWNrPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIFdhdGNoT3B0aW9ucyBleHRlbmRzIE9taXQ8Q2ZuRGVwbG95T3B0aW9ucywgJ2V4ZWN1dGUnPiB7XG4gIC8qKlxuICAgKiBPbmx5IHNlbGVjdCB0aGUgZ2l2ZW4gc3RhY2tcbiAgICpcbiAgICogQGRlZmF1bHQgZmFsc2VcbiAgICovXG4gIGV4Y2x1c2l2ZWx5PzogYm9vbGVhbjtcblxuICAvKipcbiAgICogUmV1c2UgdGhlIGFzc2V0cyB3aXRoIHRoZSBnaXZlbiBhc3NldCBJRHNcbiAgICovXG4gIHJldXNlQXNzZXRzPzogc3RyaW5nW107XG5cbiAgLyoqXG4gICAqIEFsd2F5cyBkZXBsb3ksIGV2ZW4gaWYgdGVtcGxhdGVzIGFyZSBpZGVudGljYWwuXG4gICAqIEBkZWZhdWx0IGZhbHNlXG4gICAqL1xuICBmb3JjZT86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIFRoZSBleHRyYSBzdHJpbmcgdG8gYXBwZW5kIHRvIHRoZSBVc2VyLUFnZW50IGhlYWRlciB3aGVuIHBlcmZvcm1pbmcgQVdTIFNESyBjYWxscy5cbiAgICpcbiAgICogQGRlZmF1bHQgLSBub3RoaW5nIGV4dHJhIGlzIGFwcGVuZGVkIHRvIHRoZSBVc2VyLUFnZW50IGhlYWRlclxuICAgKi9cbiAgcmVhZG9ubHkgZXh0cmFVc2VyQWdlbnQ/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgdG8gc2hvdyBDbG91ZFdhdGNoIGxvZ3MgZm9yIGhvdHN3YXBwZWQgcmVzb3VyY2VzXG4gICAqIGxvY2FsbHkgaW4gdGhlIHVzZXJzIHRlcm1pbmFsXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gZmFsc2VcbiAgICovXG4gIHJlYWRvbmx5IHRyYWNlTG9ncz86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIE1heGltdW0gbnVtYmVyIG9mIHNpbXVsdGFuZW91cyBkZXBsb3ltZW50cyAoZGVwZW5kZW5jeSBwZXJtaXR0aW5nKSB0byBleGVjdXRlLlxuICAgKiBUaGUgZGVmYXVsdCBpcyAnMScsIHdoaWNoIGV4ZWN1dGVzIGFsbCBkZXBsb3ltZW50cyBzZXJpYWxseS5cbiAgICpcbiAgICogQGRlZmF1bHQgMVxuICAgKi9cbiAgcmVhZG9ubHkgY29uY3VycmVuY3k/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGVwbG95T3B0aW9ucyBleHRlbmRzIENmbkRlcGxveU9wdGlvbnMsIFdhdGNoT3B0aW9ucyB7XG4gIC8qKlxuICAgKiBBUk5zIG9mIFNOUyB0b3BpY3MgdGhhdCBDbG91ZEZvcm1hdGlvbiB3aWxsIG5vdGlmeSB3aXRoIHN0YWNrIHJlbGF0ZWQgZXZlbnRzXG4gICAqL1xuICBub3RpZmljYXRpb25Bcm5zPzogc3RyaW5nW107XG5cbiAgLyoqXG4gICAqIFdoYXQga2luZCBvZiBzZWN1cml0eSBjaGFuZ2VzIHJlcXVpcmUgYXBwcm92YWxcbiAgICpcbiAgICogQGRlZmF1bHQgUmVxdWlyZUFwcHJvdmFsLkJyb2FkZW5pbmdcbiAgICovXG4gIHJlcXVpcmVBcHByb3ZhbD86IFJlcXVpcmVBcHByb3ZhbDtcblxuICAvKipcbiAgICogVGFncyB0byBwYXNzIHRvIENsb3VkRm9ybWF0aW9uIGZvciBkZXBsb3ltZW50XG4gICAqL1xuICB0YWdzPzogVGFnW107XG5cbiAgLyoqXG4gICAqIEFkZGl0aW9uYWwgcGFyYW1ldGVycyBmb3IgQ2xvdWRGb3JtYXRpb24gYXQgZGVwbG95IHRpbWVcbiAgICogQGRlZmF1bHQge31cbiAgICovXG4gIHBhcmFtZXRlcnM/OiB7IFtuYW1lOiBzdHJpbmddOiBzdHJpbmcgfCB1bmRlZmluZWQgfTtcblxuICAvKipcbiAgICogVXNlIHByZXZpb3VzIHZhbHVlcyBmb3IgdW5zcGVjaWZpZWQgcGFyYW1ldGVyc1xuICAgKlxuICAgKiBJZiBub3Qgc2V0LCBhbGwgcGFyYW1ldGVycyBtdXN0IGJlIHNwZWNpZmllZCBmb3IgZXZlcnkgZGVwbG95bWVudC5cbiAgICpcbiAgICogQGRlZmF1bHQgdHJ1ZVxuICAgKi9cbiAgdXNlUHJldmlvdXNQYXJhbWV0ZXJzPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogUGF0aCB0byBmaWxlIHdoZXJlIHN0YWNrIG91dHB1dHMgd2lsbCBiZSB3cml0dGVuIGFmdGVyIGEgc3VjY2Vzc2Z1bCBkZXBsb3kgYXMgSlNPTlxuICAgKiBAZGVmYXVsdCAtIE91dHB1dHMgYXJlIG5vdCB3cml0dGVuIHRvIGFueSBmaWxlXG4gICAqL1xuICBvdXRwdXRzRmlsZT86IHN0cmluZztcblxuICAvKipcbiAgICogV2hldGhlciB3ZSBhcmUgb24gYSBDSSBzeXN0ZW1cbiAgICpcbiAgICogQGRlZmF1bHQgZmFsc2VcbiAgICovXG4gIHJlYWRvbmx5IGNpPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogV2hldGhlciB0aGlzICdkZXBsb3knIGNvbW1hbmQgc2hvdWxkIGFjdHVhbGx5IGRlbGVnYXRlIHRvIHRoZSAnd2F0Y2gnIGNvbW1hbmQuXG4gICAqXG4gICAqIEBkZWZhdWx0IGZhbHNlXG4gICAqL1xuICByZWFkb25seSB3YXRjaD86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgd2Ugc2hvdWxkIGNhY2hlIHRoZSBDbG91ZCBBc3NlbWJseSBhZnRlciB0aGUgZmlyc3QgdGltZSBpdCBoYXMgYmVlbiBzeW50aGVzaXplZC5cbiAgICogVGhlIGRlZmF1bHQgaXMgJ3RydWUnLCB3ZSBvbmx5IGRvbid0IHdhbnQgdG8gZG8gaXQgaW4gY2FzZSB0aGUgZGVwbG95bWVudCBpcyB0cmlnZ2VyZWQgYnlcbiAgICogJ2NkayB3YXRjaCcuXG4gICAqXG4gICAqIEBkZWZhdWx0IHRydWVcbiAgICovXG4gIHJlYWRvbmx5IGNhY2hlQ2xvdWRBc3NlbWJseT86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIEFsbG93cyBhZGRpbmcgQ2xvdWRXYXRjaCBsb2cgZ3JvdXBzIHRvIHRoZSBsb2cgbW9uaXRvciB2aWFcbiAgICogY2xvdWRXYXRjaExvZ01vbml0b3Iuc2V0TG9nR3JvdXBzKCk7XG4gICAqXG4gICAqIEBkZWZhdWx0IC0gbm90IG1vbml0b3JpbmcgQ2xvdWRXYXRjaCBsb2dzXG4gICAqL1xuICByZWFkb25seSBjbG91ZFdhdGNoTG9nTW9uaXRvcj86IENsb3VkV2F0Y2hMb2dFdmVudE1vbml0b3I7XG5cbiAgLyoqXG4gICAqIE1heGltdW0gbnVtYmVyIG9mIHNpbXVsdGFuZW91cyBkZXBsb3ltZW50cyAoZGVwZW5kZW5jeSBwZXJtaXR0aW5nKSB0byBleGVjdXRlLlxuICAgKiBUaGUgZGVmYXVsdCBpcyAnMScsIHdoaWNoIGV4ZWN1dGVzIGFsbCBkZXBsb3ltZW50cyBzZXJpYWxseS5cbiAgICpcbiAgICogQGRlZmF1bHQgMVxuICAgKi9cbiAgcmVhZG9ubHkgY29uY3VycmVuY3k/OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEJ1aWxkL3B1Ymxpc2ggYXNzZXRzIGZvciBhIHNpbmdsZSBzdGFjayBpbiBwYXJhbGxlbFxuICAgKlxuICAgKiBJbmRlcGVuZGVudCBvZiB3aGV0aGVyIHN0YWNrcyBhcmUgYmVpbmcgZG9uZSBpbiBwYXJhbGxlbCBvciBuby5cbiAgICpcbiAgICogQGRlZmF1bHQgdHJ1ZVxuICAgKi9cbiAgcmVhZG9ubHkgYXNzZXRQYXJhbGxlbGlzbT86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIFdoZW4gdG8gYnVpbGQgYXNzZXRzXG4gICAqXG4gICAqIFRoZSBkZWZhdWx0IGlzIHRoZSBEb2NrZXItZnJpZW5kbHkgZGVmYXVsdC5cbiAgICpcbiAgICogQGRlZmF1bHQgQXNzZXRCdWlsZFRpbWUuQUxMX0JFRk9SRV9ERVBMT1lcbiAgICovXG4gIHJlYWRvbmx5IGFzc2V0QnVpbGRUaW1lPzogQXNzZXRCdWlsZFRpbWU7XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgdG8gZGVwbG95IGlmIHRoZSBhcHAgY29udGFpbnMgbm8gc3RhY2tzLlxuICAgKlxuICAgKiBAZGVmYXVsdCBmYWxzZVxuICAgKi9cbiAgcmVhZG9ubHkgaWdub3JlTm9TdGFja3M/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJvbGxiYWNrT3B0aW9ucyB7XG4gIC8qKlxuICAgKiBDcml0ZXJpYSBmb3Igc2VsZWN0aW5nIHN0YWNrcyB0byBkZXBsb3lcbiAgICovXG4gIHJlYWRvbmx5IHNlbGVjdG9yOiBTdGFja1NlbGVjdG9yO1xuXG4gIC8qKlxuICAgKiBOYW1lIG9mIHRoZSB0b29sa2l0IHN0YWNrIHRvIHVzZS9kZXBsb3lcbiAgICpcbiAgICogQGRlZmF1bHQgQ0RLVG9vbGtpdFxuICAgKi9cbiAgcmVhZG9ubHkgdG9vbGtpdFN0YWNrTmFtZT86IHN0cmluZztcblxuICAvKipcbiAgICogUm9sZSB0byBwYXNzIHRvIENsb3VkRm9ybWF0aW9uIGZvciBkZXBsb3ltZW50XG4gICAqXG4gICAqIEBkZWZhdWx0IC0gRGVmYXVsdCBzdGFjayByb2xlXG4gICAqL1xuICByZWFkb25seSByb2xlQXJuPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBXaGV0aGVyIHRvIGZvcmNlIHRoZSByb2xsYmFjayBvciBub3RcbiAgICpcbiAgICogQGRlZmF1bHQgZmFsc2VcbiAgICovXG4gIHJlYWRvbmx5IGZvcmNlPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogTG9naWNhbCBJRHMgb2YgcmVzb3VyY2VzIHRvIG9ycGhhblxuICAgKlxuICAgKiBAZGVmYXVsdCAtIE5vIG9ycGhhbmluZ1xuICAgKi9cbiAgcmVhZG9ubHkgb3JwaGFuTG9naWNhbElkcz86IHN0cmluZ1tdO1xuXG4gIC8qKlxuICAgKiBXaGV0aGVyIHRvIHZhbGlkYXRlIHRoZSB2ZXJzaW9uIG9mIHRoZSBib290c3RyYXAgc3RhY2sgcGVybWlzc2lvbnNcbiAgICpcbiAgICogQGRlZmF1bHQgdHJ1ZVxuICAgKi9cbiAgcmVhZG9ubHkgdmFsaWRhdGVCb290c3RyYXBTdGFja1ZlcnNpb24/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEltcG9ydE9wdGlvbnMgZXh0ZW5kcyBDZm5EZXBsb3lPcHRpb25zIHtcbiAgLyoqXG4gICAqIEJ1aWxkIGEgcGh5c2ljYWwgcmVzb3VyY2UgbWFwcGluZyBhbmQgd3JpdGUgaXQgdG8gdGhlIGdpdmVuIGZpbGUsIHdpdGhvdXQgcGVyZm9ybWluZyB0aGUgYWN0dWFsIGltcG9ydCBvcGVyYXRpb25cbiAgICpcbiAgICogQGRlZmF1bHQgLSBObyBmaWxlXG4gICAqL1xuXG4gIHJlYWRvbmx5IHJlY29yZFJlc291cmNlTWFwcGluZz86IHN0cmluZztcblxuICAvKipcbiAgICogUGF0aCB0byBhIGZpbGUgd2l0aCB0aGUgcGh5c2ljYWwgcmVzb3VyY2UgbWFwcGluZyB0byBDREsgY29uc3RydWN0cyBpbiBKU09OIGZvcm1hdFxuICAgKlxuICAgKiBAZGVmYXVsdCAtIE5vIG1hcHBpbmcgZmlsZVxuICAgKi9cbiAgcmVhZG9ubHkgcmVzb3VyY2VNYXBwaW5nRmlsZT86IHN0cmluZztcblxuICAvKipcbiAgICogQWxsb3cgbm9uLWFkZGl0aW9uIGNoYW5nZXMgdG8gdGhlIHRlbXBsYXRlXG4gICAqXG4gICAqIEBkZWZhdWx0IGZhbHNlXG4gICAqL1xuICByZWFkb25seSBmb3JjZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGVzdHJveU9wdGlvbnMge1xuICAvKipcbiAgICogQ3JpdGVyaWEgZm9yIHNlbGVjdGluZyBzdGFja3MgdG8gZGVwbG95XG4gICAqL1xuICBzZWxlY3RvcjogU3RhY2tTZWxlY3RvcjtcblxuICAvKipcbiAgICogV2hldGhlciB0byBleGNsdWRlIHN0YWNrcyB0aGF0IGRlcGVuZCBvbiB0aGUgc3RhY2tzIHRvIGJlIGRlbGV0ZWRcbiAgICovXG4gIGV4Y2x1c2l2ZWx5OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBXaGV0aGVyIHRvIHNraXAgcHJvbXB0aW5nIGZvciBjb25maXJtYXRpb25cbiAgICovXG4gIGZvcmNlOiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBUaGUgYXJuIG9mIHRoZSBJQU0gcm9sZSB0byB1c2VcbiAgICovXG4gIHJvbGVBcm4/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgdGhlIGRlc3Ryb3kgcmVxdWVzdCBjYW1lIGZyb20gYSBkZXBsb3kuXG4gICAqL1xuICBmcm9tRGVwbG95PzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBPcHRpb25zIGZvciB0aGUgZ2FyYmFnZSBjb2xsZWN0aW9uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgR2FyYmFnZUNvbGxlY3Rpb25PcHRpb25zIHtcbiAgLyoqXG4gICAqIFRoZSBhY3Rpb24gdG8gcGVyZm9ybS5cbiAgICpcbiAgICogQGRlZmF1bHQgJ2Z1bGwnXG4gICAqL1xuICByZWFkb25seSBhY3Rpb246ICdwcmludCcgfCAndGFnJyB8ICdkZWxldGUtdGFnZ2VkJyB8ICdmdWxsJztcblxuICAvKipcbiAgICogVGhlIHR5cGUgb2YgdGhlIGFzc2V0cyB0byBiZSBnYXJiYWdlIGNvbGxlY3RlZC5cbiAgICpcbiAgICogQGRlZmF1bHQgJ2FsbCdcbiAgICovXG4gIHJlYWRvbmx5IHR5cGU6ICdzMycgfCAnZWNyJyB8ICdhbGwnO1xuXG4gIC8qKlxuICAgKiBFbGFwc2VkIHRpbWUgYmV0d2VlbiBhbiBhc3NldCBiZWluZyBtYXJrZWQgYXMgaXNvbGF0ZWQgYW5kIGFjdHVhbGx5IGRlbGV0ZWQuXG4gICAqXG4gICAqIEBkZWZhdWx0IDBcbiAgICovXG4gIHJlYWRvbmx5IHJvbGxiYWNrQnVmZmVyRGF5czogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBSZWZ1c2UgZGVsZXRpb24gb2YgYW55IGFzc2V0cyB5b3VuZ2VyIHRoYW4gdGhpcyBudW1iZXIgb2YgZGF5cy5cbiAgICovXG4gIHJlYWRvbmx5IGNyZWF0ZWRCdWZmZXJEYXlzOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIFRoZSBzdGFjayBuYW1lIG9mIHRoZSBib290c3RyYXAgc3RhY2suXG4gICAqXG4gICAqIEBkZWZhdWx0IERFRkFVTFRfVE9PTEtJVF9TVEFDS19OQU1FXG4gICAqL1xuICByZWFkb25seSBib290c3RyYXBTdGFja05hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFNraXBzIHRoZSBwcm9tcHQgYmVmb3JlIGFjdHVhbCBkZWxldGlvbiBiZWdpbnNcbiAgICpcbiAgICogQGRlZmF1bHQgZmFsc2VcbiAgICovXG4gIHJlYWRvbmx5IGNvbmZpcm0/OiBib29sZWFuO1xufVxuZXhwb3J0IGludGVyZmFjZSBNaWdyYXRlT3B0aW9ucyB7XG4gIC8qKlxuICAgKiBUaGUgbmFtZSBhc3NpZ25lZCB0byB0aGUgZ2VuZXJhdGVkIHN0YWNrLiBUaGlzIGlzIGFsc28gdXNlZCB0byBnZXRcbiAgICogdGhlIHN0YWNrIGZyb20gdGhlIHVzZXIncyBhY2NvdW50IGlmIGAtLWZyb20tc3RhY2tgIGlzIHVzZWQuXG4gICAqL1xuICByZWFkb25seSBzdGFja05hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIHRhcmdldCBsYW5ndWFnZSBmb3IgdGhlIGdlbmVyYXRlZCB0aGUgQ0RLIGFwcC5cbiAgICpcbiAgICogQGRlZmF1bHQgdHlwZXNjcmlwdFxuICAgKi9cbiAgcmVhZG9ubHkgbGFuZ3VhZ2U/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBsb2NhbCBwYXRoIG9mIHRoZSB0ZW1wbGF0ZSB1c2VkIHRvIGdlbmVyYXRlIHRoZSBDREsgYXBwLlxuICAgKlxuICAgKiBAZGVmYXVsdCAtIExvY2FsIHBhdGggaXMgbm90IHVzZWQgZm9yIHRoZSB0ZW1wbGF0ZSBzb3VyY2UuXG4gICAqL1xuICByZWFkb25seSBmcm9tUGF0aD86IHN0cmluZztcblxuICAvKipcbiAgICogV2hldGhlciB0byBnZXQgdGhlIHRlbXBsYXRlIGZyb20gYW4gZXhpc3RpbmcgQ2xvdWRGb3JtYXRpb24gc3RhY2suXG4gICAqXG4gICAqIEBkZWZhdWx0IGZhbHNlXG4gICAqL1xuICByZWFkb25seSBmcm9tU3RhY2s/OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBUaGUgb3V0cHV0IHBhdGggYXQgd2hpY2ggdG8gY3JlYXRlIHRoZSBDREsgYXBwLlxuICAgKlxuICAgKiBAZGVmYXVsdCAtIFRoZSBjdXJyZW50IGRpcmVjdG9yeVxuICAgKi9cbiAgcmVhZG9ubHkgb3V0cHV0UGF0aD86IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIGFjY291bnQgZnJvbSB3aGljaCB0byByZXRyaWV2ZSB0aGUgdGVtcGxhdGUgb2YgdGhlIENsb3VkRm9ybWF0aW9uIHN0YWNrLlxuICAgKlxuICAgKiBAZGVmYXVsdCAtIFVzZXMgdGhlIGFjY291bnQgZm9yIHRoZSBjcmVkZW50aWFscyBpbiB1c2UgYnkgdGhlIHVzZXIuXG4gICAqL1xuICByZWFkb25seSBhY2NvdW50Pzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgcmVnaW9uIGZyb20gd2hpY2ggdG8gcmV0cmlldmUgdGhlIHRlbXBsYXRlIG9mIHRoZSBDbG91ZEZvcm1hdGlvbiBzdGFjay5cbiAgICpcbiAgICogQGRlZmF1bHQgLSBVc2VzIHRoZSBkZWZhdWx0IHJlZ2lvbiBmb3IgdGhlIGNyZWRlbnRpYWxzIGluIHVzZSBieSB0aGUgdXNlci5cbiAgICovXG4gIHJlYWRvbmx5IHJlZ2lvbj86IHN0cmluZztcblxuICAvKipcbiAgICogRmlsdGVyaW5nIGNyaXRlcmlhIHVzZWQgdG8gc2VsZWN0IHRoZSByZXNvdXJjZXMgdG8gYmUgaW5jbHVkZWQgaW4gdGhlIGdlbmVyYXRlZCBDREsgYXBwLlxuICAgKlxuICAgKiBAZGVmYXVsdCAtIEluY2x1ZGUgYWxsIHJlc291cmNlc1xuICAgKi9cbiAgcmVhZG9ubHkgZmlsdGVyPzogc3RyaW5nW107XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgdG8gaW5pdGlhdGUgYSBuZXcgYWNjb3VudCBzY2FuIGZvciBnZW5lcmF0aW5nIHRoZSBDREsgYXBwLlxuICAgKlxuICAgKiBAZGVmYXVsdCBmYWxzZVxuICAgKi9cbiAgcmVhZG9ubHkgZnJvbVNjYW4/OiBGcm9tU2NhbjtcblxuICAvKipcbiAgICogV2hldGhlciB0byB6aXAgdGhlIGdlbmVyYXRlZCBjZGsgYXBwIGZvbGRlci5cbiAgICpcbiAgICogQGRlZmF1bHQgZmFsc2VcbiAgICovXG4gIHJlYWRvbmx5IGNvbXByZXNzPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWZhY3Rvck9wdGlvbnMge1xuICAvKipcbiAgICogV2hldGhlciB0byBvbmx5IHNob3cgdGhlIHByb3Bvc2VkIHJlZmFjdG9yLCB3aXRob3V0IGFwcGx5aW5nIGl0XG4gICAqL1xuICByZWFkb25seSBkcnlSdW46IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIFRoZSBhYnNvbHV0ZSBwYXRoIHRvIGEgZmlsZSB0aGF0IGNvbnRhaW5zIG92ZXJyaWRlcyB0byB0aGUgbWFwcGluZ3NcbiAgICogY29tcHV0ZWQgYnkgdGhlIENMSS4gVGhpcyBmaWxlIHNob3VsZCBjb250YWluIGEgSlNPTiBvYmplY3Qgd2l0aFxuICAgKiB0aGUgZm9sbG93aW5nIGZvcm1hdDpcbiAgICpcbiAgICogICAgIHtcbiAgICogICAgICAgXCJlbnZpcm9ubWVudHNcIjogW1xuICAgKiAgICAgICAgIHtcbiAgICogICAgICAgICAgIFwiYWNjb3VudFwiOiBcIjEyMzQ1Njc4OTAxMlwiLFxuICAgKiAgICAgICAgICAgXCJyZWdpb25cIjogXCJ1cy1lYXN0LTFcIixcbiAgICogICAgICAgICAgIFwicmVzb3VyY2VzXCI6IHtcbiAgICogICAgICAgICAgICAgXCJGb28uT2xkTmFtZVwiOiBcIkJhci5OZXdOYW1lXCIsXG4gICAqICAgICAgICAgICB9XG4gICAqICAgICAgICAgfSxcbiAgICogICAgICAgXVxuICAgKiAgICAgfVxuICAgKlxuICAgKiB3aGVyZSBtYXBwaW5ncyBhcmUgZ3JvdXBlZCBieSBlbnZpcm9ubWVudC4gVGhlIGByZXNvdXJjZXNgIG9iamVjdCBjb250YWluc1xuICAgKiBhIG1hcHBpbmcgd2hlcmUgZWFjaCBrZXkgaXMgdGhlIHNvdXJjZSBsb2NhdGlvbiBhbmQgdGhlIHZhbHVlIGlzIHRoZVxuICAgKiBkZXN0aW5hdGlvbiBsb2NhdGlvbi4gTG9jYXRpb25zIG11c3QgYmUgaW4gdGhlIGZvcm1hdCBgU3RhY2tOYW1lLkxvZ2ljYWxJZGAuXG4gICAqIFRoZSBzb3VyY2UgbXVzdCByZWZlciB0byBhIGxvY2F0aW9uIHdoZXJlIHRoZXJlIGlzIGEgcmVzb3VyY2UgY3VycmVudGx5XG4gICAqIGRlcGxveWVkLCB3aGlsZSB0aGUgZGVzdGluYXRpb24gbXVzdCByZWZlciB0byBhIGxvY2F0aW9uIHRoYXQgaXMgbm90IGFscmVhZHlcbiAgICogb2NjdXBpZWQgYnkgYW55IHJlc291cmNlLlxuICAgKi9cbiAgb3ZlcnJpZGVGaWxlPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBNb2RpZmllcyB0aGUgYmVoYXZpb3Igb2YgdGhlIGBvdmVycmlkZUZpbGVgIG9wdGlvbiBieSBzd2FwcGluZyBzb3VyY2UgYW5kXG4gICAqIGRlc3RpbmF0aW9uIGxvY2F0aW9ucy4gVGhpcyBpcyB1c2VmdWwgd2hlbiB5b3Ugd2FudCB0byB1bmRvIGEgcmVmYWN0b3JcbiAgICogdGhhdCB3YXMgcHJldmlvdXNseSBhcHBsaWVkLlxuICAgKi9cbiAgcmV2ZXJ0PzogYm9vbGVhbjtcblxuICAvKipcbiAgICogV2hldGhlciB0byBkbyB0aGUgcmVmYWN0b3Igd2l0aG91dCBwcm9tcHRpbmcgdGhlIHVzZXIgZm9yIGNvbmZpcm1hdGlvbi5cbiAgICovXG4gIGZvcmNlPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogQ3JpdGVyaWEgZm9yIHNlbGVjdGluZyBzdGFja3MgdG8gY29tcGFyZSB3aXRoIHRoZSBkZXBsb3llZCBzdGFja3MgaW4gdGhlXG4gICAqIHRhcmdldCBlbnZpcm9ubWVudC5cbiAgICovXG4gIHN0YWNrcz86IFN0YWNrU2VsZWN0b3I7XG5cbiAgLyoqXG4gICAqIEEgbGlzdCBvZiBuYW1lcyBvZiBhZGRpdGlvbmFsIGRlcGxveWVkIHN0YWNrcyB0byBiZSBpbmNsdWRlZCBpbiB0aGUgY29tcGFyaXNvbi5cbiAgICovXG4gIGFkZGl0aW9uYWxTdGFja05hbWVzPzogc3RyaW5nW107XG5cbiAgLyoqXG4gICAqIFJvbGUgdG8gYXNzdW1lIGluIHRoZSB0YXJnZXQgZW52aXJvbm1lbnQgYmVmb3JlIHBlcmZvcm1pbmcgdGhlIHJlZmFjdG9yLlxuICAgKi9cbiAgcm9sZUFybj86IHN0cmluZztcbn1cblxuLyoqXG4gKiBPcHRpb25zIGZvciB0aGUgZHJpZnQgY29tbWFuZFxuICovXG5leHBvcnQgaW50ZXJmYWNlIERyaWZ0T3B0aW9ucyB7XG4gIC8qKlxuICAgKiBDcml0ZXJpYSBmb3Igc2VsZWN0aW5nIHN0YWNrcyB0byBkZXRlY3QgZHJpZnQgb25cbiAgICovXG4gIHJlYWRvbmx5IHNlbGVjdG9yOiBTdGFja1NlbGVjdG9yO1xuXG4gIC8qKlxuICAgKiBXaGV0aGVyIHRvIGZhaWwgd2l0aCBleGl0IGNvZGUgMSBpZiBkcmlmdCBpcyBkZXRlY3RlZFxuICAgKlxuICAgKiBAZGVmYXVsdCBmYWxzZVxuICAgKi9cbiAgcmVhZG9ubHkgZmFpbD86IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIGJ1aWxkUGFyYW1ldGVyTWFwKFxuICBwYXJhbWV0ZXJzOlxuICAgIHwge1xuICAgICAgW25hbWU6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgfCB1bmRlZmluZWQsXG4pOiB7IFtuYW1lOiBzdHJpbmddOiB7IFtuYW1lOiBzdHJpbmddOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB9IHtcbiAgY29uc3QgcGFyYW1ldGVyTWFwOiB7XG4gICAgW25hbWU6IHN0cmluZ106IHsgW25hbWU6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuICB9ID0geyAnKic6IHt9IH07XG4gIGZvciAoY29uc3Qga2V5IGluIHBhcmFtZXRlcnMpIHtcbiAgICBpZiAocGFyYW1ldGVycy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICBjb25zdCBbc3RhY2ssIHBhcmFtZXRlcl0gPSBrZXkuc3BsaXQoJzonLCAyKTtcbiAgICAgIGlmICghcGFyYW1ldGVyKSB7XG4gICAgICAgIHBhcmFtZXRlck1hcFsnKiddW3N0YWNrXSA9IHBhcmFtZXRlcnNba2V5XTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICghcGFyYW1ldGVyTWFwW3N0YWNrXSkge1xuICAgICAgICAgIHBhcmFtZXRlck1hcFtzdGFja10gPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBwYXJhbWV0ZXJNYXBbc3RhY2tdW3BhcmFtZXRlcl0gPSBwYXJhbWV0ZXJzW2tleV07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHBhcmFtZXRlck1hcDtcbn1cblxuLyoqXG4gKiBBc2sgdGhlIHVzZXIgZm9yIGEgeWVzL25vIGNvbmZpcm1hdGlvblxuICpcbiAqIEF1dG9tYXRpY2FsbHkgZmFpbCB0aGUgY29uZmlybWF0aW9uIGluIGNhc2Ugd2UncmUgaW4gYSBzaXR1YXRpb24gd2hlcmUgdGhlIGNvbmZpcm1hdGlvblxuICogY2Fubm90IGJlIGludGVyYWN0aXZlbHkgb2J0YWluZWQgZnJvbSBhIGh1bWFuIGF0IHRoZSBrZXlib2FyZC5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gYXNrVXNlckNvbmZpcm1hdGlvbihcbiAgaW9Ib3N0OiBDbGlJb0hvc3QsXG4gIHJlcTogQWN0aW9uTGVzc1JlcXVlc3Q8Q29uZmlybWF0aW9uUmVxdWVzdCwgYm9vbGVhbj4sXG4pIHtcbiAgYXdhaXQgaW9Ib3N0LndpdGhDb3JrZWRMb2dnaW5nKGFzeW5jICgpID0+IHtcbiAgICBhd2FpdCBpb0hvc3QuYXNJb0hlbHBlcigpLnJlcXVlc3RSZXNwb25zZShyZXEpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBEaXNwbGF5IGEgd2FybmluZyBpZiB0aGVyZSBhcmUgZmxhZ3MgdGhhdCBhcmUgZGlmZmVyZW50IGZyb20gdGhlIHJlY29tbWVuZGVkIHZhbHVlXG4gKlxuICogVGhpcyBoYXBwZW5zIGlmIGJvdGggb2YgdGhlIGZvbGxvd2luZyBhcmUgdHJ1ZTpcbiAqXG4gKiAtIFRoZSB1c2VyIGRpZG4ndCBjb25maWd1cmUgdGhlIHZhbHVlXG4gKiAtIFRoZSBkZWZhdWx0IHZhbHVlIGZvciB0aGUgZmxhZyAodW5jb25maWd1cmVkQmVoYXZlc0xpa2UpIGlzIGRpZmZlcmVudCBmcm9tIHRoZSByZWNvbW1lbmRlZCB2YWx1ZVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZGlzcGxheUZsYWdzTWVzc2FnZShpb0hvc3Q6IElvSGVscGVyLCB0b29sa2l0OiBJbnRlcm5hbFRvb2xraXQsIGNsb3VkRXhlY3V0YWJsZTogQ2xvdWRFeGVjdXRhYmxlKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IGZsYWdzID0gYXdhaXQgdG9vbGtpdC5mbGFncyhjbG91ZEV4ZWN1dGFibGUpO1xuXG4gIC8vIFRoZSBcInVuY29uZmlndXJlZEJlaGF2ZXNMaWtlXCIgaW5mb3JtYXRpb24gZ290IGFkZGVkIGxhdGVyLiBJZiBub25lIG9mIHRoZSBmbGFncyBoYXZlIHRoaXMgaW5mb3JtYXRpb24sXG4gIC8vIHdlIGRvbid0IGhhdmUgZW5vdWdoIGluZm9ybWF0aW9uIHRvIHJlbGlhYmx5IGRpc3BsYXkgdGhpcyBpbmZvcm1hdGlvbiB3aXRob3V0IHNjYXJpbmcgdXNlcnMsIHNvIGRvbid0IGRvIGFueXRoaW5nLlxuICBpZiAoZmxhZ3MuZXZlcnkoZmxhZyA9PiBmbGFnLnVuY29uZmlndXJlZEJlaGF2ZXNMaWtlID09PSB1bmRlZmluZWQpKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgdW5jb25maWd1cmVkRmxhZ3MgPSBmbGFnc1xuICAgIC5maWx0ZXIoZmxhZyA9PiAhT0JTT0xFVEVfRkxBR1MuaW5jbHVkZXMoZmxhZy5uYW1lKSlcbiAgICAuZmlsdGVyKGZsYWcgPT4gKGZsYWcudW5jb25maWd1cmVkQmVoYXZlc0xpa2U/LnYyID8/IGZhbHNlKSAhPT0gZmxhZy5yZWNvbW1lbmRlZFZhbHVlKVxuICAgIC5maWx0ZXIoZmxhZyA9PiBmbGFnLnVzZXJWYWx1ZSA9PT0gdW5kZWZpbmVkKTtcblxuICBjb25zdCBudW1VbmNvbmZpZ3VyZWQgPSB1bmNvbmZpZ3VyZWRGbGFncy5sZW5ndGg7XG4gIGlmIChudW1VbmNvbmZpZ3VyZWQgPiAwKSB7XG4gICAgYXdhaXQgaW9Ib3N0LmRlZmF1bHRzLndhcm4oYCR7bnVtVW5jb25maWd1cmVkfSBmZWF0dXJlIGZsYWdzIGFyZSBub3QgY29uZmlndXJlZC4gUnVuICdjZGsgZmxhZ3MgLS11bnN0YWJsZT1mbGFncycgdG8gbGVhcm4gbW9yZS5gKTtcbiAgfVxufVxuXG4vKipcbiAqIExvZ2dlciBmb3IgcHJvY2Vzc2luZyBzdGFjayBtZXRhZGF0YVxuICovXG5mdW5jdGlvbiBzdGFja01ldGFkYXRhTG9nZ2VyKGlvSGVscGVyOiBJb0hlbHBlciwgdmVyYm9zZT86IGJvb2xlYW4pOiAobGV2ZWw6ICdpbmZvJyB8ICdlcnJvcicgfCAnd2FybicsIG1zZzogY3hhcGkuU3ludGhlc2lzTWVzc2FnZSkgPT4gUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IG1ha2VMb2dnZXIgPSAobGV2ZWw6IHN0cmluZyk6IFtsb2dnZXI6IChtOiBzdHJpbmcpID0+IHZvaWQsIHByZWZpeDogc3RyaW5nXSA9PiB7XG4gICAgc3dpdGNoIChsZXZlbCkge1xuICAgICAgY2FzZSAnZXJyb3InOlxuICAgICAgICByZXR1cm4gWyhtKSA9PiBpb0hlbHBlci5kZWZhdWx0cy5lcnJvcihtKSwgJ0Vycm9yJ107XG4gICAgICBjYXNlICd3YXJuJzpcbiAgICAgICAgcmV0dXJuIFsobSkgPT4gaW9IZWxwZXIuZGVmYXVsdHMud2FybihtKSwgJ1dhcm5pbmcnXTtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiBbKG0pID0+IGlvSGVscGVyLmRlZmF1bHRzLmluZm8obSksICdJbmZvJ107XG4gICAgfVxuICB9O1xuXG4gIHJldHVybiBhc3luYyAobGV2ZWwsIG1zZykgPT4ge1xuICAgIGNvbnN0IFtsb2dGbiwgcHJlZml4XSA9IG1ha2VMb2dnZXIobGV2ZWwpO1xuICAgIGF3YWl0IGxvZ0ZuKGBbJHtwcmVmaXh9IGF0ICR7bXNnLmlkfV0gJHttc2cuZW50cnkuZGF0YX1gKTtcblxuICAgIGlmICh2ZXJib3NlICYmIG1zZy5lbnRyeS50cmFjZSkge1xuICAgICAgbG9nRm4oYCAgJHttc2cuZW50cnkudHJhY2Uuam9pbignXFxuICAnKX1gKTtcbiAgICB9XG4gIH07XG59XG5cbi8qKlxuICogRGV0ZXJtaW5lIGlmIG1hbnVhbCBhcHByb3ZhbCBpcyByZXF1aXJlZCBvciBub3QuIFJlcXVpcmVzIGFwcHJvdmFsIGZvclxuICogLSBSZXF1aXJlQXBwcm92YWwuQU5ZX0NIQU5HRVxuICogLSBSZXF1aXJlQXBwcm92YWwuQlJPQURFTklORyBhbmQgdGhlIGNoYW5nZXMgYXJlIGluZGVlZCBicm9hZGVuaW5nIHBlcm1pc3Npb25zXG4gKi9cbmZ1bmN0aW9uIHJlcXVpcmVzQXBwcm92YWwocmVxdWlyZUFwcHJvdmFsOiBSZXF1aXJlQXBwcm92YWwsIHBlcm1pc3Npb25DaGFuZ2VUeXBlOiBQZXJtaXNzaW9uQ2hhbmdlVHlwZSkge1xuICByZXR1cm4gcmVxdWlyZUFwcHJvdmFsID09PSBSZXF1aXJlQXBwcm92YWwuQU5ZQ0hBTkdFIHx8XG4gICAgcmVxdWlyZUFwcHJvdmFsID09PSBSZXF1aXJlQXBwcm92YWwuQlJPQURFTklORyAmJiBwZXJtaXNzaW9uQ2hhbmdlVHlwZSA9PT0gUGVybWlzc2lvbkNoYW5nZVR5cGUuQlJPQURFTklORztcbn1cbiJdfQ==