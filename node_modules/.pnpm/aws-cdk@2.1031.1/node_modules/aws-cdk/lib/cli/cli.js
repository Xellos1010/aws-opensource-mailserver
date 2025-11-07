"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exec = exec;
exports.cli = cli;
/* eslint-disable @typescript-eslint/no-shadow */ // yargs
const cxapi = require("@aws-cdk/cx-api");
const toolkit_lib_1 = require("@aws-cdk/toolkit-lib");
const chalk = require("chalk");
const cdk_toolkit_1 = require("./cdk-toolkit");
const ci_systems_1 = require("./ci-systems");
const display_version_1 = require("./display-version");
const io_host_1 = require("./io-host");
const parse_command_line_arguments_1 = require("./parse-command-line-arguments");
const platform_warnings_1 = require("./platform-warnings");
const pretty_print_error_1 = require("./pretty-print-error");
const singleton_plugin_host_1 = require("./singleton-plugin-host");
const user_configuration_1 = require("./user-configuration");
const api_private_1 = require("../../lib/api-private");
const api_1 = require("../api");
const aws_auth_1 = require("../api/aws-auth");
const bootstrap_1 = require("../api/bootstrap");
const deployments_1 = require("../api/deployments");
const hotswap_1 = require("../api/hotswap");
const context_1 = require("../commands/context");
const docs_1 = require("../commands/docs");
const doctor_1 = require("../commands/doctor");
const flags_1 = require("../commands/flags/flags");
const init_1 = require("../commands/init");
const migrate_1 = require("../commands/migrate");
const cxapp_1 = require("../cxapp");
const proxy_agent_1 = require("./proxy-agent");
const error_1 = require("./telemetry/error");
const ci_1 = require("./util/ci");
const version_1 = require("./version");
const language_1 = require("../commands/language");
if (!process.stdout.isTTY) {
    // Disable chalk color highlighting
    process.env.FORCE_COLOR = '0';
}
async function exec(args, synthesizer) {
    const argv = await (0, parse_command_line_arguments_1.parseCommandLineArguments)(args);
    argv.language = (0, language_1.getLanguageFromAlias)(argv.language) ?? argv.language;
    const cmd = argv._[0];
    // if one -v, log at a DEBUG level
    // if 2 -v, log at a TRACE level
    let ioMessageLevel = 'info';
    if (argv.verbose) {
        switch (argv.verbose) {
            case 1:
                ioMessageLevel = 'debug';
                break;
            case 2:
            default:
                ioMessageLevel = 'trace';
                break;
        }
    }
    const ioHost = io_host_1.CliIoHost.instance({
        logLevel: ioMessageLevel,
        isTTY: process.stdout.isTTY,
        isCI: Boolean(argv.ci),
        currentAction: cmd,
        stackProgress: argv.progress,
    }, true);
    const ioHelper = (0, api_private_1.asIoHelper)(ioHost, ioHost.currentAction);
    // Debug should always imply tracing
    (0, aws_auth_1.setSdkTracing)(argv.debug || argv.verbose > 2);
    try {
        await (0, platform_warnings_1.checkForPlatformWarnings)(ioHelper);
    }
    catch (e) {
        await ioHost.defaults.debug(`Error while checking for platform warnings: ${e}`);
    }
    await ioHost.defaults.debug('CDK Toolkit CLI version:', (0, version_1.versionWithBuild)());
    await ioHost.defaults.debug('Command line arguments:', argv);
    const configuration = await user_configuration_1.Configuration.fromArgsAndFiles(ioHelper, {
        commandLineArguments: {
            ...argv,
            _: argv._, // TypeScript at its best
        },
    });
    // Always create and use ProxyAgent to support configuration via env vars
    const proxyAgent = await new proxy_agent_1.ProxyAgentProvider(ioHelper).create({
        proxyAddress: configuration.settings.get(['proxy']),
        caBundlePath: configuration.settings.get(['caBundlePath']),
    });
    if (argv['telemetry-file'] && !configuration.settings.get(['unstable']).includes('telemetry')) {
        throw new toolkit_lib_1.ToolkitError('Unstable feature use: \'telemetry-file\' is unstable. It must be opted in via \'--unstable\', e.g. \'cdk deploy --unstable=telemetry --telemetry-file=my/file/path\'');
    }
    try {
        await ioHost.startTelemetry(argv, configuration.context);
    }
    catch (e) {
        await ioHost.asIoHelper().defaults.trace(`Telemetry instantiation failed: ${e.message}`);
    }
    /**
     * The default value for displaying (and refreshing) notices on all commands.
     *
     * If the user didn't supply either `--notices` or `--no-notices`, we do
     * autodetection. The autodetection currently is: do write notices if we are
     * not on CI, or are on a CI system where we know that writing to stderr is
     * safe. We fail "closed"; that is, we decide to NOT print for unknown CI
     * systems, even though technically we maybe could.
     */
    const isSafeToWriteNotices = !(0, ci_1.isCI)() || Boolean((0, ci_systems_1.ciSystemIsStdErrSafe)());
    // Determine if notices should be displayed based on CLI args and configuration
    let shouldDisplayNotices;
    if (argv.notices !== undefined) {
        // CLI argument takes precedence
        shouldDisplayNotices = argv.notices;
    }
    else {
        // Fall back to configuration file setting, then autodetection
        const configNotices = configuration.settings.get(['notices']);
        if (configNotices !== undefined) {
            // Consider string "false" to be falsy in this context
            shouldDisplayNotices = configNotices !== 'false' && Boolean(configNotices);
        }
        else {
            // Default autodetection behavior
            shouldDisplayNotices = isSafeToWriteNotices;
        }
    }
    // Notices either go to stderr, or nowhere
    ioHost.noticesDestination = shouldDisplayNotices ? 'stderr' : 'drop';
    const notices = api_1.Notices.create({
        ioHost,
        context: configuration.context,
        output: configuration.settings.get(['outdir']),
        httpOptions: { agent: proxyAgent },
        cliVersion: (0, version_1.versionNumber)(),
    });
    const refreshNotices = (async () => {
        // the cdk notices command has it's own refresh
        if (shouldDisplayNotices && cmd !== 'notices') {
            try {
                return await notices.refresh();
            }
            catch (e) {
                await ioHelper.defaults.debug(`Could not refresh notices: ${e}`);
            }
        }
    })();
    const sdkProvider = await aws_auth_1.SdkProvider.withAwsCliCompatibleDefaults({
        ioHelper,
        requestHandler: (0, aws_auth_1.sdkRequestHandler)(proxyAgent),
        logger: new aws_auth_1.IoHostSdkLogger((0, api_private_1.asIoHelper)(ioHost, ioHost.currentAction)),
        pluginHost: singleton_plugin_host_1.GLOBAL_PLUGIN_HOST,
    }, configuration.settings.get(['profile']));
    try {
        await ioHost.telemetry?.attachRegion(sdkProvider.defaultRegion);
    }
    catch (e) {
        await ioHost.asIoHelper().defaults.trace(`Telemetry attach region failed: ${e.message}`);
    }
    let outDirLock;
    const cloudExecutable = new cxapp_1.CloudExecutable({
        configuration,
        sdkProvider,
        synthesizer: synthesizer ??
            (async (aws, config) => {
                // Invoke 'execProgram', and copy the lock for the directory in the global
                // variable here. It will be released when the CLI exits. Locks are not re-entrant
                // so release it if we have to synthesize more than once (because of context lookups).
                await outDirLock?.release();
                const { assembly, lock } = await (0, cxapp_1.execProgram)(aws, ioHost.asIoHelper(), config);
                outDirLock = lock;
                return assembly;
            }),
        ioHelper: ioHost.asIoHelper(),
    });
    /** Function to load plug-ins, using configurations additively. */
    async function loadPlugins(...settings) {
        for (const source of settings) {
            const plugins = source.get(['plugin']) || [];
            for (const plugin of plugins) {
                await singleton_plugin_host_1.GLOBAL_PLUGIN_HOST.load(plugin, ioHost);
            }
        }
    }
    await loadPlugins(configuration.settings);
    if ((typeof cmd) !== 'string') {
        throw new toolkit_lib_1.ToolkitError(`First argument should be a string. Got: ${cmd} (${typeof cmd})`);
    }
    try {
        return await main(cmd, argv);
    }
    finally {
        // If we locked the 'cdk.out' directory, release it here.
        await outDirLock?.release();
        // Do PSAs here
        await (0, display_version_1.displayVersionMessage)(ioHelper);
        await refreshNotices;
        if (cmd === 'notices') {
            await notices.refresh({ force: true });
            await notices.display({
                includeAcknowledged: !argv.unacknowledged,
                showTotal: argv.unacknowledged,
            });
        }
        else if (shouldDisplayNotices && cmd !== 'version') {
            await notices.display();
        }
    }
    async function main(command, args) {
        ioHost.currentAction = command;
        const toolkitStackName = api_1.ToolkitInfo.determineName(configuration.settings.get(['toolkitStackName']));
        await ioHost.defaults.debug(`Toolkit stack: ${chalk.bold(toolkitStackName)}`);
        const cloudFormation = new deployments_1.Deployments({
            sdkProvider,
            toolkitStackName,
            ioHelper: (0, api_private_1.asIoHelper)(ioHost, ioHost.currentAction),
        });
        if (args.all && args.STACKS) {
            throw new toolkit_lib_1.ToolkitError('You must either specify a list of Stacks or the `--all` argument');
        }
        args.STACKS = args.STACKS ?? (args.STACK ? [args.STACK] : []);
        args.ENVIRONMENTS = args.ENVIRONMENTS ?? [];
        const selector = {
            allTopLevel: args.all,
            patterns: args.STACKS,
        };
        const cli = new cdk_toolkit_1.CdkToolkit({
            ioHost,
            cloudExecutable,
            toolkitStackName,
            deployments: cloudFormation,
            verbose: argv.trace || argv.verbose > 0,
            ignoreErrors: argv['ignore-errors'],
            strict: argv.strict,
            configuration,
            sdkProvider,
        });
        switch (command) {
            case 'context':
                ioHost.currentAction = 'context';
                return (0, context_1.contextHandler)({
                    ioHelper,
                    context: configuration.context,
                    clear: argv.clear,
                    json: argv.json,
                    force: argv.force,
                    reset: argv.reset,
                });
            case 'docs':
            case 'doc':
                ioHost.currentAction = 'docs';
                return (0, docs_1.docs)({
                    ioHelper,
                    browser: configuration.settings.get(['browser']),
                });
            case 'doctor':
                ioHost.currentAction = 'doctor';
                return (0, doctor_1.doctor)({
                    ioHelper,
                });
            case 'ls':
            case 'list':
                ioHost.currentAction = 'list';
                return cli.list(args.STACKS, {
                    long: args.long,
                    json: argv.json,
                    showDeps: args.showDependencies,
                });
            case 'diff':
                ioHost.currentAction = 'diff';
                const enableDiffNoFail = isFeatureEnabled(configuration, cxapi.ENABLE_DIFF_NO_FAIL_CONTEXT);
                return cli.diff({
                    stackNames: args.STACKS,
                    exclusively: args.exclusively,
                    templatePath: args.template,
                    strict: args.strict,
                    contextLines: args.contextLines,
                    securityOnly: args.securityOnly,
                    fail: args.fail != null ? args.fail : !enableDiffNoFail,
                    compareAgainstProcessedTemplate: args.processed,
                    quiet: args.quiet,
                    changeSet: args['change-set'],
                    toolkitStackName: toolkitStackName,
                    importExistingResources: args.importExistingResources,
                    includeMoves: args['include-moves'],
                });
            case 'drift':
                ioHost.currentAction = 'drift';
                return cli.drift({
                    selector,
                    fail: args.fail,
                });
            case 'refactor':
                if (!configuration.settings.get(['unstable']).includes('refactor')) {
                    throw new toolkit_lib_1.ToolkitError('Unstable feature use: \'refactor\' is unstable. It must be opted in via \'--unstable\', e.g. \'cdk refactor --unstable=refactor\'');
                }
                ioHost.currentAction = 'refactor';
                return cli.refactor({
                    dryRun: args.dryRun,
                    overrideFile: args.overrideFile,
                    revert: args.revert,
                    stacks: selector,
                    additionalStackNames: arrayFromYargs(args.additionalStackName ?? []),
                    force: args.force ?? false,
                    roleArn: args.roleArn,
                });
            case 'bootstrap':
                ioHost.currentAction = 'bootstrap';
                const source = await determineBootstrapVersion(ioHost, args);
                if (args.showTemplate) {
                    const bootstrapper = new bootstrap_1.Bootstrapper(source, (0, api_private_1.asIoHelper)(ioHost, ioHost.currentAction));
                    return bootstrapper.showTemplate(args.json);
                }
                return cli.bootstrap(args.ENVIRONMENTS, {
                    source,
                    roleArn: args.roleArn,
                    forceDeployment: argv.force,
                    toolkitStackName: toolkitStackName,
                    execute: args.execute,
                    tags: configuration.settings.get(['tags']),
                    terminationProtection: args.terminationProtection,
                    usePreviousParameters: args['previous-parameters'],
                    parameters: {
                        bucketName: configuration.settings.get(['toolkitBucket', 'bucketName']),
                        kmsKeyId: configuration.settings.get(['toolkitBucket', 'kmsKeyId']),
                        createCustomerMasterKey: args.bootstrapCustomerKey,
                        qualifier: args.qualifier ?? configuration.context.get('@aws-cdk/core:bootstrapQualifier'),
                        publicAccessBlockConfiguration: args.publicAccessBlockConfiguration,
                        examplePermissionsBoundary: argv.examplePermissionsBoundary,
                        customPermissionsBoundary: argv.customPermissionsBoundary,
                        trustedAccounts: arrayFromYargs(args.trust),
                        trustedAccountsForLookup: arrayFromYargs(args.trustForLookup),
                        untrustedAccounts: arrayFromYargs(args.untrust),
                        cloudFormationExecutionPolicies: arrayFromYargs(args.cloudformationExecutionPolicies),
                        denyExternalId: args.denyExternalId,
                    },
                });
            case 'deploy':
                ioHost.currentAction = 'deploy';
                const parameterMap = {};
                for (const parameter of args.parameters) {
                    if (typeof parameter === 'string') {
                        const keyValue = parameter.split('=');
                        parameterMap[keyValue[0]] = keyValue.slice(1).join('=');
                    }
                }
                if (args.execute !== undefined && args.method !== undefined) {
                    throw new toolkit_lib_1.ToolkitError('Can not supply both --[no-]execute and --method at the same time');
                }
                return cli.deploy({
                    selector,
                    exclusively: args.exclusively,
                    toolkitStackName,
                    roleArn: args.roleArn,
                    notificationArns: args.notificationArns,
                    requireApproval: configuration.settings.get(['requireApproval']),
                    reuseAssets: args['build-exclude'],
                    tags: configuration.settings.get(['tags']),
                    deploymentMethod: determineDeploymentMethod(args, configuration),
                    force: args.force,
                    parameters: parameterMap,
                    usePreviousParameters: args['previous-parameters'],
                    outputsFile: configuration.settings.get(['outputsFile']),
                    progress: configuration.settings.get(['progress']),
                    ci: args.ci,
                    rollback: configuration.settings.get(['rollback']),
                    watch: args.watch,
                    traceLogs: args.logs,
                    concurrency: args.concurrency,
                    assetParallelism: configuration.settings.get(['assetParallelism']),
                    assetBuildTime: configuration.settings.get(['assetPrebuild'])
                        ? cdk_toolkit_1.AssetBuildTime.ALL_BEFORE_DEPLOY
                        : cdk_toolkit_1.AssetBuildTime.JUST_IN_TIME,
                    ignoreNoStacks: args.ignoreNoStacks,
                });
            case 'rollback':
                ioHost.currentAction = 'rollback';
                return cli.rollback({
                    selector,
                    toolkitStackName,
                    roleArn: args.roleArn,
                    force: args.force,
                    validateBootstrapStackVersion: args['validate-bootstrap-version'],
                    orphanLogicalIds: args.orphan,
                });
            case 'import':
                ioHost.currentAction = 'import';
                return cli.import({
                    selector,
                    toolkitStackName,
                    roleArn: args.roleArn,
                    deploymentMethod: {
                        method: 'change-set',
                        execute: args.execute,
                        changeSetName: args.changeSetName,
                    },
                    progress: configuration.settings.get(['progress']),
                    rollback: configuration.settings.get(['rollback']),
                    recordResourceMapping: args['record-resource-mapping'],
                    resourceMappingFile: args['resource-mapping'],
                    force: args.force,
                });
            case 'watch':
                ioHost.currentAction = 'watch';
                await cli.watch({
                    selector,
                    exclusively: args.exclusively,
                    toolkitStackName,
                    roleArn: args.roleArn,
                    reuseAssets: args['build-exclude'],
                    deploymentMethod: determineDeploymentMethod(args, configuration, true),
                    force: args.force,
                    progress: configuration.settings.get(['progress']),
                    rollback: configuration.settings.get(['rollback']),
                    traceLogs: args.logs,
                    concurrency: args.concurrency,
                });
                return;
            case 'destroy':
                ioHost.currentAction = 'destroy';
                return cli.destroy({
                    selector,
                    exclusively: args.exclusively,
                    force: args.force,
                    roleArn: args.roleArn,
                });
            case 'gc':
                ioHost.currentAction = 'gc';
                if (!configuration.settings.get(['unstable']).includes('gc')) {
                    throw new toolkit_lib_1.ToolkitError('Unstable feature use: \'gc\' is unstable. It must be opted in via \'--unstable\', e.g. \'cdk gc --unstable=gc\'');
                }
                if (args.bootstrapStackName) {
                    await ioHost.defaults.warn('--bootstrap-stack-name is deprecated and will be removed when gc is GA. Use --toolkit-stack-name.');
                }
                // roleArn is defined for when cloudformation is invoked
                // This conflicts with direct sdk calls existing in the gc command to s3 and ecr
                if (args.roleArn) {
                    await ioHost.defaults.warn('The --role-arn option is not supported for the gc command and will be ignored.');
                }
                return cli.garbageCollect(args.ENVIRONMENTS, {
                    action: args.action,
                    type: args.type,
                    rollbackBufferDays: args['rollback-buffer-days'],
                    createdBufferDays: args['created-buffer-days'],
                    bootstrapStackName: args.toolkitStackName ?? args.bootstrapStackName,
                    confirm: args.confirm,
                });
            case 'flags':
                ioHost.currentAction = 'flags';
                if (!configuration.settings.get(['unstable']).includes('flags')) {
                    throw new toolkit_lib_1.ToolkitError('Unstable feature use: \'flags\' is unstable. It must be opted in via \'--unstable\', e.g. \'cdk flags --unstable=flags\'');
                }
                const toolkit = new toolkit_lib_1.Toolkit({
                    ioHost,
                    toolkitStackName,
                    unstableFeatures: configuration.settings.get(['unstable']),
                });
                const flagsData = await toolkit.flags(cloudExecutable);
                const handler = new flags_1.FlagCommandHandler(flagsData, ioHelper, args, toolkit);
                return handler.processFlagsCommand();
            case 'synthesize':
            case 'synth':
                ioHost.currentAction = 'synth';
                const quiet = configuration.settings.get(['quiet']) ?? args.quiet;
                if (args.exclusively) {
                    return cli.synth(args.STACKS, args.exclusively, quiet, args.validation, argv.json);
                }
                else {
                    return cli.synth(args.STACKS, true, quiet, args.validation, argv.json);
                }
            case 'notices':
                ioHost.currentAction = 'notices';
                // If the user explicitly asks for notices, they are now the primary output
                // of the command and they should go to stdout.
                ioHost.noticesDestination = 'stdout';
                // This is a valid command, but we're postponing its execution because displaying
                // notices automatically happens after every command.
                return;
            case 'metadata':
                ioHost.currentAction = 'metadata';
                return cli.metadata(args.STACK, argv.json);
            case 'acknowledge':
            case 'ack':
                ioHost.currentAction = 'notices';
                return cli.acknowledge(args.ID);
            case 'cli-telemetry':
                ioHost.currentAction = 'cli-telemetry';
                if (args.enable === undefined && args.disable === undefined && args.status === undefined) {
                    throw new toolkit_lib_1.ToolkitError('Must specify \'--enable\', \'--disable\', or \'--status\'');
                }
                if (args.status) {
                    return cli.cliTelemetryStatus(args['version-reporting']);
                }
                else {
                    const enable = args.enable ?? !args.disable;
                    return cli.cliTelemetry(enable);
                }
            case 'init':
                ioHost.currentAction = 'init';
                const language = configuration.settings.get(['language']);
                if (args.list) {
                    return (0, init_1.printAvailableTemplates)(ioHelper, language);
                }
                else {
                    // Gate custom template support with unstable flag
                    if (args['from-path'] && !configuration.settings.get(['unstable']).includes('init')) {
                        throw new toolkit_lib_1.ToolkitError('Unstable feature use: \'init\' with custom templates is unstable. It must be opted in via \'--unstable\', e.g. \'cdk init --from-path=./my-template --unstable=init\'');
                    }
                    return (0, init_1.cliInit)({
                        ioHelper,
                        type: args.TEMPLATE,
                        language,
                        canUseNetwork: undefined,
                        generateOnly: args.generateOnly,
                        libVersion: args.libVersion,
                        fromPath: args['from-path'],
                        templatePath: args['template-path'],
                    });
                }
            case 'migrate':
                ioHost.currentAction = 'migrate';
                return cli.migrate({
                    stackName: args['stack-name'],
                    fromPath: args['from-path'],
                    fromStack: args['from-stack'],
                    language: args.language,
                    outputPath: args['output-path'],
                    fromScan: (0, migrate_1.getMigrateScanType)(args['from-scan']),
                    filter: args.filter,
                    account: args.account,
                    region: args.region,
                    compress: args.compress,
                });
            case 'version':
                ioHost.currentAction = 'version';
                return ioHost.defaults.result((0, version_1.versionWithBuild)());
            default:
                throw new toolkit_lib_1.ToolkitError('Unknown command: ' + command);
        }
    }
}
/**
 * Determine which version of bootstrapping
 */
async function determineBootstrapVersion(ioHost, args) {
    let source;
    if (args.template) {
        await ioHost.defaults.info(`Using bootstrapping template from ${args.template}`);
        source = { source: 'custom', templateFile: args.template };
    }
    else if (process.env.CDK_LEGACY_BOOTSTRAP) {
        await ioHost.defaults.info('CDK_LEGACY_BOOTSTRAP set, using legacy-style bootstrapping');
        source = { source: 'legacy' };
    }
    else {
        // in V2, the "new" bootstrapping is the default
        source = { source: 'default' };
    }
    return source;
}
function isFeatureEnabled(configuration, featureFlag) {
    return configuration.context.get(featureFlag) ?? cxapi.futureFlagDefault(featureFlag);
}
/**
 * Translate a Yargs input array to something that makes more sense in a programming language
 * model (telling the difference between absence and an empty array)
 *
 * - An empty array is the default case, meaning the user didn't pass any arguments. We return
 *   undefined.
 * - If the user passed a single empty string, they did something like `--array=`, which we'll
 *   take to mean they passed an empty array.
 */
function arrayFromYargs(xs) {
    if (xs.length === 0) {
        return undefined;
    }
    return xs.filter((x) => x !== '');
}
function determineDeploymentMethod(args, configuration, watch) {
    let deploymentMethod;
    switch (args.method) {
        case 'direct':
            if (args.changeSetName) {
                throw new toolkit_lib_1.ToolkitError('--change-set-name cannot be used with method=direct');
            }
            if (args.importExistingResources) {
                throw new toolkit_lib_1.ToolkitError('--import-existing-resources cannot be enabled with method=direct');
            }
            deploymentMethod = { method: 'direct' };
            break;
        case 'change-set':
            deploymentMethod = {
                method: 'change-set',
                execute: true,
                changeSetName: args.changeSetName,
                importExistingResources: args.importExistingResources,
            };
            break;
        case 'prepare-change-set':
            deploymentMethod = {
                method: 'change-set',
                execute: false,
                changeSetName: args.changeSetName,
                importExistingResources: args.importExistingResources,
            };
            break;
        case undefined:
        default:
            deploymentMethod = {
                method: 'change-set',
                execute: watch ? true : args.execute ?? true,
                changeSetName: args.changeSetName,
                importExistingResources: args.importExistingResources,
            };
            break;
    }
    const hotswapMode = determineHotswapMode(args.hotswap, args.hotswapFallback, watch);
    const hotswapProperties = configuration.settings.get(['hotswap']) || {};
    switch (hotswapMode) {
        case hotswap_1.HotswapMode.FALL_BACK:
            return {
                method: 'hotswap',
                properties: hotswapProperties,
                fallback: deploymentMethod,
            };
        case hotswap_1.HotswapMode.HOTSWAP_ONLY:
            return {
                method: 'hotswap',
                properties: hotswapProperties,
            };
        default:
        case hotswap_1.HotswapMode.FULL_DEPLOYMENT:
            return deploymentMethod;
    }
}
function determineHotswapMode(hotswap, hotswapFallback, watch) {
    if (hotswap && hotswapFallback) {
        throw new toolkit_lib_1.ToolkitError('Can not supply both --hotswap and --hotswap-fallback at the same time');
    }
    else if (!hotswap && !hotswapFallback) {
        if (hotswap === undefined && hotswapFallback === undefined) {
            return watch ? hotswap_1.HotswapMode.HOTSWAP_ONLY : hotswap_1.HotswapMode.FULL_DEPLOYMENT;
        }
        else if (hotswap === false || hotswapFallback === false) {
            return hotswap_1.HotswapMode.FULL_DEPLOYMENT;
        }
    }
    let hotswapMode;
    if (hotswap) {
        hotswapMode = hotswap_1.HotswapMode.HOTSWAP_ONLY;
        /* if (hotswapFallback)*/
    }
    else {
        hotswapMode = hotswap_1.HotswapMode.FALL_BACK;
    }
    return hotswapMode;
}
/* c8 ignore start */ // we never call this in unit tests
function cli(args = process.argv.slice(2)) {
    let error;
    exec(args)
        .then(async (value) => {
        if (typeof value === 'number') {
            process.exitCode = value;
        }
    })
        .catch(async (err) => {
        // Log the stack trace if we're on a developer workstation. Otherwise this will be into a minified
        // file and the printed code line and stack trace are huge and useless.
        (0, pretty_print_error_1.prettyPrintError)(err, (0, version_1.isDeveloperBuildVersion)());
        error = {
            name: (0, error_1.cdkCliErrorName)(err.name),
        };
        process.exitCode = 1;
    })
        .finally(async () => {
        try {
            await io_host_1.CliIoHost.get()?.telemetry?.end(error);
        }
        catch (e) {
            await io_host_1.CliIoHost.get()?.asIoHelper().defaults.trace(`Ending Telemetry failed: ${e.message}`);
        }
    });
}
/* c8 ignore stop */
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2xpLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBNkNBLG9CQWlpQkM7QUEwSEQsa0JBd0JDO0FBaHVCRCxpREFBaUQsQ0FBQyxRQUFRO0FBQzFELHlDQUF5QztBQUV6QyxzREFBNkQ7QUFDN0QsK0JBQStCO0FBQy9CLCtDQUEyRDtBQUMzRCw2Q0FBb0Q7QUFDcEQsdURBQTBEO0FBRTFELHVDQUFzQztBQUN0QyxpRkFBMkU7QUFDM0UsMkRBQStEO0FBQy9ELDZEQUF3RDtBQUN4RCxtRUFBNkQ7QUFFN0QsNkRBQXFEO0FBQ3JELHVEQUFtRDtBQUVuRCxnQ0FBOEM7QUFDOUMsOENBQWlHO0FBRWpHLGdEQUFnRDtBQUNoRCxvREFBaUQ7QUFDakQsNENBQTZDO0FBRTdDLGlEQUFnRTtBQUNoRSwyQ0FBd0M7QUFDeEMsK0NBQTRDO0FBQzVDLG1EQUE2RDtBQUM3RCwyQ0FBb0U7QUFDcEUsaURBQXlEO0FBQ3pELG9DQUF3RDtBQUV4RCwrQ0FBbUQ7QUFDbkQsNkNBQW9EO0FBRXBELGtDQUFpQztBQUNqQyx1Q0FBcUY7QUFDckYsbURBQTREO0FBRTVELElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQzFCLG1DQUFtQztJQUNuQyxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsR0FBRyxHQUFHLENBQUM7QUFDaEMsQ0FBQztBQUVNLEtBQUssVUFBVSxJQUFJLENBQUMsSUFBYyxFQUFFLFdBQXlCO0lBQ2xFLE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBQSx3REFBeUIsRUFBQyxJQUFJLENBQUMsQ0FBQztJQUNuRCxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUEsK0JBQW9CLEVBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUM7SUFFckUsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUV0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QyxLQUFLLEVBQUUsR0FBRyxFQUFFLEVBQUU7UUFDbkIsa0dBQWtHO1FBQ2xHLHVFQUF1RTtRQUN2RSxJQUFBLHFDQUFnQixFQUFDLEdBQUcsRUFBRSxJQUFBLGlDQUF1QixHQUFFLENBQUMsQ0FBQztRQUNqRCxLQUFLLEdBQUc7WUFDTixJQUFJLEVBQUUsSUFBQSx1QkFBZSxFQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUM7U0FDaEMsQ0FBQztRQUNGLE9BQU8sQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDO0lBQ3ZCLENBQUMsQ0FBQztTQUNELE9BQU8sQ0FBQyxLQUFLLElBQUksRUFBRTtRQUNsQixJQUFJLENBQUM7WUFDSCxNQUFNLG1CQUFTLENBQUMsR0FBRyxFQUFFLEVBQUUsU0FBUyxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMvQyxDQUFDO1FBQUMsT0FBTyxDQUFNLEVBQUUsQ0FBQztZQUNoQixNQUFNLG1CQUFTLENBQUMsR0FBRyxFQUFFLEVBQUUsVUFBVSxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDOUYsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQztBQUNELG9CQUFvQiIsInNvdXJjZXNDb250ZW50IjpbIi8qIGVzbGludC1kaXNhYmxlIEB0eXBlc2NyaXB0LWVzbGludC9uby1zaGFkb3cgKi8gLy8geWFyZ3NcbmltcG9ydCAqIGFzIGN4YXBpIGZyb20gJ0Bhd3MtY2RrL2N4LWFwaSc7XG5pbXBvcnQgdHlwZSB7IENoYW5nZVNldERlcGxveW1lbnQsIERlcGxveW1lbnRNZXRob2QsIERpcmVjdERlcGxveW1lbnQgfSBmcm9tICdAYXdzLWNkay90b29sa2l0LWxpYic7XG5pbXBvcnQgeyBUb29sa2l0RXJyb3IsIFRvb2xraXQgfSBmcm9tICdAYXdzLWNkay90b29sa2l0LWxpYic7XG5pbXBvcnQgKiBhcyBjaGFsayBmcm9tICdjaGFsayc7XG5pbXBvcnQgeyBDZGtUb29sa2l0LCBBc3NldEJ1aWxkVGltZSB9IGZyb20gJy4vY2RrLXRvb2xraXQnO1xuaW1wb3J0IHsgY2lTeXN0ZW1Jc1N0ZEVyclNhZmUgfSBmcm9tICcuL2NpLXN5c3RlbXMnO1xuaW1wb3J0IHsgZGlzcGxheVZlcnNpb25NZXNzYWdlIH0gZnJvbSAnLi9kaXNwbGF5LXZlcnNpb24nO1xuaW1wb3J0IHR5cGUgeyBJb01lc3NhZ2VMZXZlbCB9IGZyb20gJy4vaW8taG9zdCc7XG5pbXBvcnQgeyBDbGlJb0hvc3QgfSBmcm9tICcuL2lvLWhvc3QnO1xuaW1wb3J0IHsgcGFyc2VDb21tYW5kTGluZUFyZ3VtZW50cyB9IGZyb20gJy4vcGFyc2UtY29tbWFuZC1saW5lLWFyZ3VtZW50cyc7XG5pbXBvcnQgeyBjaGVja0ZvclBsYXRmb3JtV2FybmluZ3MgfSBmcm9tICcuL3BsYXRmb3JtLXdhcm5pbmdzJztcbmltcG9ydCB7IHByZXR0eVByaW50RXJyb3IgfSBmcm9tICcuL3ByZXR0eS1wcmludC1lcnJvcic7XG5pbXBvcnQgeyBHTE9CQUxfUExVR0lOX0hPU1QgfSBmcm9tICcuL3NpbmdsZXRvbi1wbHVnaW4taG9zdCc7XG5pbXBvcnQgdHlwZSB7IENvbW1hbmQgfSBmcm9tICcuL3VzZXItY29uZmlndXJhdGlvbic7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uIH0gZnJvbSAnLi91c2VyLWNvbmZpZ3VyYXRpb24nO1xuaW1wb3J0IHsgYXNJb0hlbHBlciB9IGZyb20gJy4uLy4uL2xpYi9hcGktcHJpdmF0ZSc7XG5pbXBvcnQgdHlwZSB7IElSZWFkTG9jayB9IGZyb20gJy4uL2FwaSc7XG5pbXBvcnQgeyBUb29sa2l0SW5mbywgTm90aWNlcyB9IGZyb20gJy4uL2FwaSc7XG5pbXBvcnQgeyBTZGtQcm92aWRlciwgSW9Ib3N0U2RrTG9nZ2VyLCBzZXRTZGtUcmFjaW5nLCBzZGtSZXF1ZXN0SGFuZGxlciB9IGZyb20gJy4uL2FwaS9hd3MtYXV0aCc7XG5pbXBvcnQgdHlwZSB7IEJvb3RzdHJhcFNvdXJjZSB9IGZyb20gJy4uL2FwaS9ib290c3RyYXAnO1xuaW1wb3J0IHsgQm9vdHN0cmFwcGVyIH0gZnJvbSAnLi4vYXBpL2Jvb3RzdHJhcCc7XG5pbXBvcnQgeyBEZXBsb3ltZW50cyB9IGZyb20gJy4uL2FwaS9kZXBsb3ltZW50cyc7XG5pbXBvcnQgeyBIb3Rzd2FwTW9kZSB9IGZyb20gJy4uL2FwaS9ob3Rzd2FwJztcbmltcG9ydCB0eXBlIHsgU2V0dGluZ3MgfSBmcm9tICcuLi9hcGkvc2V0dGluZ3MnO1xuaW1wb3J0IHsgY29udGV4dEhhbmRsZXIgYXMgY29udGV4dCB9IGZyb20gJy4uL2NvbW1hbmRzL2NvbnRleHQnO1xuaW1wb3J0IHsgZG9jcyB9IGZyb20gJy4uL2NvbW1hbmRzL2RvY3MnO1xuaW1wb3J0IHsgZG9jdG9yIH0gZnJvbSAnLi4vY29tbWFuZHMvZG9jdG9yJztcbmltcG9ydCB7IEZsYWdDb21tYW5kSGFuZGxlciB9IGZyb20gJy4uL2NvbW1hbmRzL2ZsYWdzL2ZsYWdzJztcbmltcG9ydCB7IGNsaUluaXQsIHByaW50QXZhaWxhYmxlVGVtcGxhdGVzIH0gZnJvbSAnLi4vY29tbWFuZHMvaW5pdCc7XG5pbXBvcnQgeyBnZXRNaWdyYXRlU2NhblR5cGUgfSBmcm9tICcuLi9jb21tYW5kcy9taWdyYXRlJztcbmltcG9ydCB7IGV4ZWNQcm9ncmFtLCBDbG91ZEV4ZWN1dGFibGUgfSBmcm9tICcuLi9jeGFwcCc7XG5pbXBvcnQgdHlwZSB7IFN0YWNrU2VsZWN0b3IsIFN5bnRoZXNpemVyIH0gZnJvbSAnLi4vY3hhcHAnO1xuaW1wb3J0IHsgUHJveHlBZ2VudFByb3ZpZGVyIH0gZnJvbSAnLi9wcm94eS1hZ2VudCc7XG5pbXBvcnQgeyBjZGtDbGlFcnJvck5hbWUgfSBmcm9tICcuL3RlbGVtZXRyeS9lcnJvcic7XG5pbXBvcnQgdHlwZSB7IEVycm9yRGV0YWlscyB9IGZyb20gJy4vdGVsZW1ldHJ5L3NjaGVtYSc7XG5pbXBvcnQgeyBpc0NJIH0gZnJvbSAnLi91dGlsL2NpJztcbmltcG9ydCB7IGlzRGV2ZWxvcGVyQnVpbGRWZXJzaW9uLCB2ZXJzaW9uV2l0aEJ1aWxkLCB2ZXJzaW9uTnVtYmVyIH0gZnJvbSAnLi92ZXJzaW9uJztcbmltcG9ydCB7IGdldExhbmd1YWdlRnJvbUFsaWFzIH0gZnJvbSAnLi4vY29tbWFuZHMvbGFuZ3VhZ2UnO1xuXG5pZiAoIXByb2Nlc3Muc3Rkb3V0LmlzVFRZKSB7XG4gIC8vIERpc2FibGUgY2hhbGsgY29sb3IgaGlnaGxpZ2h0aW5nXG4gIHByb2Nlc3MuZW52LkZPUkNFX0NPTE9SID0gJzAnO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZXhlYyhhcmdzOiBzdHJpbmdbXSwgc3ludGhlc2l6ZXI/OiBTeW50aGVzaXplcik6IFByb21pc2U8bnVtYmVyIHwgdm9pZD4ge1xuICBjb25zdCBhcmd2ID0gYXdhaXQgcGFyc2VDb21tYW5kTGluZUFyZ3VtZW50cyhhcmdzKTtcbiAgYXJndi5sYW5ndWFnZSA9IGdldExhbmd1YWdlRnJvbUFsaWFzKGFyZ3YubGFuZ3VhZ2UpID8/IGFyZ3YubGFuZ3VhZ2U7XG5cbiAgY29uc3QgY21kID0gYXJndi5fWzBdO1xuXG4gIC8vIGlmIG9uZSAtdiwgbG9nIGF0IGEgREVCVUcgbGV2ZWxcbiAgLy8gaWYgMiAtdiwgbG9nIGF0IGEgVFJBQ0UgbGV2ZWxcbiAgbGV0IGlvTWVzc2FnZUxldmVsOiBJb01lc3NhZ2VMZXZlbCA9ICdpbmZvJztcbiAgaWYgKGFyZ3YudmVyYm9zZSkge1xuICAgIHN3aXRjaCAoYXJndi52ZXJib3NlKSB7XG4gICAgICBjYXNlIDE6XG4gICAgICAgIGlvTWVzc2FnZUxldmVsID0gJ2RlYnVnJztcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDI6XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBpb01lc3NhZ2VMZXZlbCA9ICd0cmFjZSc7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGlvSG9zdCA9IENsaUlvSG9zdC5pbnN0YW5jZSh7XG4gICAgbG9nTGV2ZWw6IGlvTWVzc2FnZUxldmVsLFxuICAgIGlzVFRZOiBwcm9jZXNzLnN0ZG91dC5pc1RUWSxcbiAgICBpc0NJOiBCb29sZWFuKGFyZ3YuY2kpLFxuICAgIGN1cnJlbnRBY3Rpb246IGNtZCxcbiAgICBzdGFja1Byb2dyZXNzOiBhcmd2LnByb2dyZXNzLFxuICB9LCB0cnVlKTtcbiAgY29uc3QgaW9IZWxwZXIgPSBhc0lvSGVscGVyKGlvSG9zdCwgaW9Ib3N0LmN1cnJlbnRBY3Rpb24gYXMgYW55KTtcblxuICAvLyBEZWJ1ZyBzaG91bGQgYWx3YXlzIGltcGx5IHRyYWNpbmdcbiAgc2V0U2RrVHJhY2luZyhhcmd2LmRlYnVnIHx8IGFyZ3YudmVyYm9zZSA+IDIpO1xuXG4gIHRyeSB7XG4gICAgYXdhaXQgY2hlY2tGb3JQbGF0Zm9ybVdhcm5pbmdzKGlvSGVscGVyKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGF3YWl0IGlvSG9zdC5kZWZhdWx0cy5kZWJ1ZyhgRXJyb3Igd2hpbGUgY2hlY2tpbmcgZm9yIHBsYXRmb3JtIHdhcm5pbmdzOiAke2V9YCk7XG4gIH1cblxuICBhd2FpdCBpb0hvc3QuZGVmYXVsdHMuZGVidWcoJ0NESyBUb29sa2l0IENMSSB2ZXJzaW9uOicsIHZlcnNpb25XaXRoQnVpbGQoKSk7XG4gIGF3YWl0IGlvSG9zdC5kZWZhdWx0cy5kZWJ1ZygnQ29tbWFuZCBsaW5lIGFyZ3VtZW50czonLCBhcmd2KTtcblxuICBjb25zdCBjb25maWd1cmF0aW9uID0gYXdhaXQgQ29uZmlndXJhdGlvbi5mcm9tQXJnc0FuZEZpbGVzKGlvSGVscGVyLFxuICAgIHtcbiAgICAgIGNvbW1hbmRMaW5lQXJndW1lbnRzOiB7XG4gICAgICAgIC4uLmFyZ3YsXG4gICAgICAgIF86IGFyZ3YuXyBhcyBbQ29tbWFuZCwgLi4uc3RyaW5nW11dLCAvLyBUeXBlU2NyaXB0IGF0IGl0cyBiZXN0XG4gICAgICB9LFxuICAgIH0pO1xuXG4gIC8vIEFsd2F5cyBjcmVhdGUgYW5kIHVzZSBQcm94eUFnZW50IHRvIHN1cHBvcnQgY29uZmlndXJhdGlvbiB2aWEgZW52IHZhcnNcbiAgY29uc3QgcHJveHlBZ2VudCA9IGF3YWl0IG5ldyBQcm94eUFnZW50UHJvdmlkZXIoaW9IZWxwZXIpLmNyZWF0ZSh7XG4gICAgcHJveHlBZGRyZXNzOiBjb25maWd1cmF0aW9uLnNldHRpbmdzLmdldChbJ3Byb3h5J10pLFxuICAgIGNhQnVuZGxlUGF0aDogY29uZmlndXJhdGlvbi5zZXR0aW5ncy5nZXQoWydjYUJ1bmRsZVBhdGgnXSksXG4gIH0pO1xuXG4gIGlmIChhcmd2Wyd0ZWxlbWV0cnktZmlsZSddICYmICFjb25maWd1cmF0aW9uLnNldHRpbmdzLmdldChbJ3Vuc3RhYmxlJ10pLmluY2x1ZGVzKCd0ZWxlbWV0cnknKSkge1xuICAgIHRocm93IG5ldyBUb29sa2l0RXJyb3IoJ1Vuc3RhYmxlIGZlYXR1cmUgdXNlOiBcXCd0ZWxlbWV0cnktZmlsZVxcJyBpcyB1bnN0YWJsZS4gSXQgbXVzdCBiZSBvcHRlZCBpbiB2aWEgXFwnLS11bnN0YWJsZVxcJywgZS5nLiBcXCdjZGsgZGVwbG95IC0tdW5zdGFibGU9dGVsZW1ldHJ5IC0tdGVsZW1ldHJ5LWZpbGU9bXkvZmlsZS9wYXRoXFwnJyk7XG4gIH1cblxuICB0cnkge1xuICAgIGF3YWl0IGlvSG9zdC5zdGFydFRlbGVtZXRyeShhcmd2LCBjb25maWd1cmF0aW9uLmNvbnRleHQpO1xuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBhd2FpdCBpb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLnRyYWNlKGBUZWxlbWV0cnkgaW5zdGFudGlhdGlvbiBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWApO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoZSBkZWZhdWx0IHZhbHVlIGZvciBkaXNwbGF5aW5nIChhbmQgcmVmcmVzaGluZykgbm90aWNlcyBvbiBhbGwgY29tbWFuZHMuXG4gICAqXG4gICAqIElmIHRoZSB1c2VyIGRpZG4ndCBzdXBwbHkgZWl0aGVyIGAtLW5vdGljZXNgIG9yIGAtLW5vLW5vdGljZXNgLCB3ZSBkb1xuICAgKiBhdXRvZGV0ZWN0aW9uLiBUaGUgYXV0b2RldGVjdGlvbiBjdXJyZW50bHkgaXM6IGRvIHdyaXRlIG5vdGljZXMgaWYgd2UgYXJlXG4gICAqIG5vdCBvbiBDSSwgb3IgYXJlIG9uIGEgQ0kgc3lzdGVtIHdoZXJlIHdlIGtub3cgdGhhdCB3cml0aW5nIHRvIHN0ZGVyciBpc1xuICAgKiBzYWZlLiBXZSBmYWlsIFwiY2xvc2VkXCI7IHRoYXQgaXMsIHdlIGRlY2lkZSB0byBOT1QgcHJpbnQgZm9yIHVua25vd24gQ0lcbiAgICogc3lzdGVtcywgZXZlbiB0aG91Z2ggdGVjaG5pY2FsbHkgd2UgbWF5YmUgY291bGQuXG4gICAqL1xuICBjb25zdCBpc1NhZmVUb1dyaXRlTm90aWNlcyA9ICFpc0NJKCkgfHwgQm9vbGVhbihjaVN5c3RlbUlzU3RkRXJyU2FmZSgpKTtcblxuICAvLyBEZXRlcm1pbmUgaWYgbm90aWNlcyBzaG91bGQgYmUgZGlzcGxheWVkIGJhc2VkIG9uIENMSSBhcmdzIGFuZCBjb25maWd1cmF0aW9uXG4gIGxldCBzaG91bGREaXNwbGF5Tm90aWNlczogYm9vbGVhbjtcbiAgaWYgKGFyZ3Yubm90aWNlcyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgLy8gQ0xJIGFyZ3VtZW50IHRha2VzIHByZWNlZGVuY2VcbiAgICBzaG91bGREaXNwbGF5Tm90aWNlcyA9IGFyZ3Yubm90aWNlcztcbiAgfSBlbHNlIHtcbiAgICAvLyBGYWxsIGJhY2sgdG8gY29uZmlndXJhdGlvbiBmaWxlIHNldHRpbmcsIHRoZW4gYXV0b2RldGVjdGlvblxuICAgIGNvbnN0IGNvbmZpZ05vdGljZXMgPSBjb25maWd1cmF0aW9uLnNldHRpbmdzLmdldChbJ25vdGljZXMnXSk7XG4gICAgaWYgKGNvbmZpZ05vdGljZXMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgLy8gQ29uc2lkZXIgc3RyaW5nIFwiZmFsc2VcIiB0byBiZSBmYWxzeSBpbiB0aGlzIGNvbnRleHRcbiAgICAgIHNob3VsZERpc3BsYXlOb3RpY2VzID0gY29uZmlnTm90aWNlcyAhPT0gJ2ZhbHNlJyAmJiBCb29sZWFuKGNvbmZpZ05vdGljZXMpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBEZWZhdWx0IGF1dG9kZXRlY3Rpb24gYmVoYXZpb3JcbiAgICAgIHNob3VsZERpc3BsYXlOb3RpY2VzID0gaXNTYWZlVG9Xcml0ZU5vdGljZXM7XG4gICAgfVxuICB9XG5cbiAgLy8gTm90aWNlcyBlaXRoZXIgZ28gdG8gc3RkZXJyLCBvciBub3doZXJlXG4gIGlvSG9zdC5ub3RpY2VzRGVzdGluYXRpb24gPSBzaG91bGREaXNwbGF5Tm90aWNlcyA/ICdzdGRlcnInIDogJ2Ryb3AnO1xuICBjb25zdCBub3RpY2VzID0gTm90aWNlcy5jcmVhdGUoe1xuICAgIGlvSG9zdCxcbiAgICBjb250ZXh0OiBjb25maWd1cmF0aW9uLmNvbnRleHQsXG4gICAgb3V0cHV0OiBjb25maWd1cmF0aW9uLnNldHRpbmdzLmdldChbJ291dGRpciddKSxcbiAgICBodHRwT3B0aW9uczogeyBhZ2VudDogcHJveHlBZ2VudCB9LFxuICAgIGNsaVZlcnNpb246IHZlcnNpb25OdW1iZXIoKSxcbiAgfSk7XG4gIGNvbnN0IHJlZnJlc2hOb3RpY2VzID0gKGFzeW5jICgpID0+IHtcbiAgICAvLyB0aGUgY2RrIG5vdGljZXMgY29tbWFuZCBoYXMgaXQncyBvd24gcmVmcmVzaFxuICAgIGlmIChzaG91bGREaXNwbGF5Tm90aWNlcyAmJiBjbWQgIT09ICdub3RpY2VzJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IG5vdGljZXMucmVmcmVzaCgpO1xuICAgICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICAgIGF3YWl0IGlvSGVscGVyLmRlZmF1bHRzLmRlYnVnKGBDb3VsZCBub3QgcmVmcmVzaCBub3RpY2VzOiAke2V9YCk7XG4gICAgICB9XG4gICAgfVxuICB9KSgpO1xuXG4gIGNvbnN0IHNka1Byb3ZpZGVyID0gYXdhaXQgU2RrUHJvdmlkZXIud2l0aEF3c0NsaUNvbXBhdGlibGVEZWZhdWx0cyh7XG4gICAgaW9IZWxwZXIsXG4gICAgcmVxdWVzdEhhbmRsZXI6IHNka1JlcXVlc3RIYW5kbGVyKHByb3h5QWdlbnQpLFxuICAgIGxvZ2dlcjogbmV3IElvSG9zdFNka0xvZ2dlcihhc0lvSGVscGVyKGlvSG9zdCwgaW9Ib3N0LmN1cnJlbnRBY3Rpb24gYXMgYW55KSksXG4gICAgcGx1Z2luSG9zdDogR0xPQkFMX1BMVUdJTl9IT1NULFxuICB9LCBjb25maWd1cmF0aW9uLnNldHRpbmdzLmdldChbJ3Byb2ZpbGUnXSkpO1xuXG4gIHRyeSB7XG4gICAgYXdhaXQgaW9Ib3N0LnRlbGVtZXRyeT8uYXR0YWNoUmVnaW9uKHNka1Byb3ZpZGVyLmRlZmF1bHRSZWdpb24pO1xuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBhd2FpdCBpb0hvc3QuYXNJb0hlbHBlcigpLmRlZmF1bHRzLnRyYWNlKGBUZWxlbWV0cnkgYXR0YWNoIHJlZ2lvbiBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWApO1xuICB9XG5cbiAgbGV0IG91dERpckxvY2s6IElSZWFkTG9jayB8IHVuZGVmaW5lZDtcbiAgY29uc3QgY2xvdWRFeGVjdXRhYmxlID0gbmV3IENsb3VkRXhlY3V0YWJsZSh7XG4gICAgY29uZmlndXJhdGlvbixcbiAgICBzZGtQcm92aWRlcixcbiAgICBzeW50aGVzaXplcjpcbiAgICAgIHN5bnRoZXNpemVyID8/XG4gICAgICAoYXN5bmMgKGF3cywgY29uZmlnKSA9PiB7XG4gICAgICAgIC8vIEludm9rZSAnZXhlY1Byb2dyYW0nLCBhbmQgY29weSB0aGUgbG9jayBmb3IgdGhlIGRpcmVjdG9yeSBpbiB0aGUgZ2xvYmFsXG4gICAgICAgIC8vIHZhcmlhYmxlIGhlcmUuIEl0IHdpbGwgYmUgcmVsZWFzZWQgd2hlbiB0aGUgQ0xJIGV4aXRzLiBMb2NrcyBhcmUgbm90IHJlLWVudHJhbnRcbiAgICAgICAgLy8gc28gcmVsZWFzZSBpdCBpZiB3ZSBoYXZlIHRvIHN5bnRoZXNpemUgbW9yZSB0aGFuIG9uY2UgKGJlY2F1c2Ugb2YgY29udGV4dCBsb29rdXBzKS5cbiAgICAgICAgYXdhaXQgb3V0RGlyTG9jaz8ucmVsZWFzZSgpO1xuICAgICAgICBjb25zdCB7IGFzc2VtYmx5LCBsb2NrIH0gPSBhd2FpdCBleGVjUHJvZ3JhbShhd3MsIGlvSG9zdC5hc0lvSGVscGVyKCksIGNvbmZpZyk7XG4gICAgICAgIG91dERpckxvY2sgPSBsb2NrO1xuICAgICAgICByZXR1cm4gYXNzZW1ibHk7XG4gICAgICB9KSxcbiAgICBpb0hlbHBlcjogaW9Ib3N0LmFzSW9IZWxwZXIoKSxcbiAgfSk7XG5cbiAgLyoqIEZ1bmN0aW9uIHRvIGxvYWQgcGx1Zy1pbnMsIHVzaW5nIGNvbmZpZ3VyYXRpb25zIGFkZGl0aXZlbHkuICovXG4gIGFzeW5jIGZ1bmN0aW9uIGxvYWRQbHVnaW5zKC4uLnNldHRpbmdzOiBTZXR0aW5nc1tdKSB7XG4gICAgZm9yIChjb25zdCBzb3VyY2Ugb2Ygc2V0dGluZ3MpIHtcbiAgICAgIGNvbnN0IHBsdWdpbnM6IHN0cmluZ1tdID0gc291cmNlLmdldChbJ3BsdWdpbiddKSB8fCBbXTtcbiAgICAgIGZvciAoY29uc3QgcGx1Z2luIG9mIHBsdWdpbnMpIHtcbiAgICAgICAgYXdhaXQgR0xPQkFMX1BMVUdJTl9IT1NULmxvYWQocGx1Z2luLCBpb0hvc3QpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGF3YWl0IGxvYWRQbHVnaW5zKGNvbmZpZ3VyYXRpb24uc2V0dGluZ3MpO1xuXG4gIGlmICgodHlwZW9mIGNtZCkgIT09ICdzdHJpbmcnKSB7XG4gICAgdGhyb3cgbmV3IFRvb2xraXRFcnJvcihgRmlyc3QgYXJndW1lbnQgc2hvdWxkIGJlIGEgc3RyaW5nLiBHb3Q6ICR7Y21kfSAoJHt0eXBlb2YgY21kfSlgKTtcbiAgfVxuXG4gIHRyeSB7XG4gICAgcmV0dXJuIGF3YWl0IG1haW4oY21kLCBhcmd2KTtcbiAgfSBmaW5hbGx5IHtcbiAgICAvLyBJZiB3ZSBsb2NrZWQgdGhlICdjZGsub3V0JyBkaXJlY3RvcnksIHJlbGVhc2UgaXQgaGVyZS5cbiAgICBhd2FpdCBvdXREaXJMb2NrPy5yZWxlYXNlKCk7XG5cbiAgICAvLyBEbyBQU0FzIGhlcmVcbiAgICBhd2FpdCBkaXNwbGF5VmVyc2lvbk1lc3NhZ2UoaW9IZWxwZXIpO1xuXG4gICAgYXdhaXQgcmVmcmVzaE5vdGljZXM7XG4gICAgaWYgKGNtZCA9PT0gJ25vdGljZXMnKSB7XG4gICAgICBhd2FpdCBub3RpY2VzLnJlZnJlc2goeyBmb3JjZTogdHJ1ZSB9KTtcbiAgICAgIGF3YWl0IG5vdGljZXMuZGlzcGxheSh7XG4gICAgICAgIGluY2x1ZGVBY2tub3dsZWRnZWQ6ICFhcmd2LnVuYWNrbm93bGVkZ2VkLFxuICAgICAgICBzaG93VG90YWw6IGFyZ3YudW5hY2tub3dsZWRnZWQsXG4gICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKHNob3VsZERpc3BsYXlOb3RpY2VzICYmIGNtZCAhPT0gJ3ZlcnNpb24nKSB7XG4gICAgICBhd2FpdCBub3RpY2VzLmRpc3BsYXkoKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBtYWluKGNvbW1hbmQ6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxudW1iZXIgfCB2b2lkPiB7XG4gICAgaW9Ib3N0LmN1cnJlbnRBY3Rpb24gPSBjb21tYW5kIGFzIGFueTtcbiAgICBjb25zdCB0b29sa2l0U3RhY2tOYW1lOiBzdHJpbmcgPSBUb29sa2l0SW5mby5kZXRlcm1pbmVOYW1lKGNvbmZpZ3VyYXRpb24uc2V0dGluZ3MuZ2V0KFsndG9vbGtpdFN0YWNrTmFtZSddKSk7XG4gICAgYXdhaXQgaW9Ib3N0LmRlZmF1bHRzLmRlYnVnKGBUb29sa2l0IHN0YWNrOiAke2NoYWxrLmJvbGQodG9vbGtpdFN0YWNrTmFtZSl9YCk7XG5cbiAgICBjb25zdCBjbG91ZEZvcm1hdGlvbiA9IG5ldyBEZXBsb3ltZW50cyh7XG4gICAgICBzZGtQcm92aWRlcixcbiAgICAgIHRvb2xraXRTdGFja05hbWUsXG4gICAgICBpb0hlbHBlcjogYXNJb0hlbHBlcihpb0hvc3QsIGlvSG9zdC5jdXJyZW50QWN0aW9uIGFzIGFueSksXG4gICAgfSk7XG5cbiAgICBpZiAoYXJncy5hbGwgJiYgYXJncy5TVEFDS1MpIHtcbiAgICAgIHRocm93IG5ldyBUb29sa2l0RXJyb3IoJ1lvdSBtdXN0IGVpdGhlciBzcGVjaWZ5IGEgbGlzdCBvZiBTdGFja3Mgb3IgdGhlIGAtLWFsbGAgYXJndW1lbnQnKTtcbiAgICB9XG5cbiAgICBhcmdzLlNUQUNLUyA9IGFyZ3MuU1RBQ0tTID8/IChhcmdzLlNUQUNLID8gW2FyZ3MuU1RBQ0tdIDogW10pO1xuICAgIGFyZ3MuRU5WSVJPTk1FTlRTID0gYXJncy5FTlZJUk9OTUVOVFMgPz8gW107XG5cbiAgICBjb25zdCBzZWxlY3RvcjogU3RhY2tTZWxlY3RvciA9IHtcbiAgICAgIGFsbFRvcExldmVsOiBhcmdzLmFsbCxcbiAgICAgIHBhdHRlcm5zOiBhcmdzLlNUQUNLUyxcbiAgICB9O1xuXG4gICAgY29uc3QgY2xpID0gbmV3IENka1Rvb2xraXQoe1xuICAgICAgaW9Ib3N0LFxuICAgICAgY2xvdWRFeGVjdXRhYmxlLFxuICAgICAgdG9vbGtpdFN0YWNrTmFtZSxcbiAgICAgIGRlcGxveW1lbnRzOiBjbG91ZEZvcm1hdGlvbixcbiAgICAgIHZlcmJvc2U6IGFyZ3YudHJhY2UgfHwgYXJndi52ZXJib3NlID4gMCxcbiAgICAgIGlnbm9yZUVycm9yczogYXJndlsnaWdub3JlLWVycm9ycyddLFxuICAgICAgc3RyaWN0OiBhcmd2LnN0cmljdCxcbiAgICAgIGNvbmZpZ3VyYXRpb24sXG4gICAgICBzZGtQcm92aWRlcixcbiAgICB9KTtcblxuICAgIHN3aXRjaCAoY29tbWFuZCkge1xuICAgICAgY2FzZSAnY29udGV4dCc6XG4gICAgICAgIGlvSG9zdC5jdXJyZW50QWN0aW9uID0gJ2NvbnRleHQnO1xuICAgICAgICByZXR1cm4gY29udGV4dCh7XG4gICAgICAgICAgaW9IZWxwZXIsXG4gICAgICAgICAgY29udGV4dDogY29uZmlndXJhdGlvbi5jb250ZXh0LFxuICAgICAgICAgIGNsZWFyOiBhcmd2LmNsZWFyLFxuICAgICAgICAgIGpzb246IGFyZ3YuanNvbixcbiAgICAgICAgICBmb3JjZTogYXJndi5mb3JjZSxcbiAgICAgICAgICByZXNldDogYXJndi5yZXNldCxcbiAgICAgICAgfSk7XG5cbiAgICAgIGNhc2UgJ2RvY3MnOlxuICAgICAgY2FzZSAnZG9jJzpcbiAgICAgICAgaW9Ib3N0LmN1cnJlbnRBY3Rpb24gPSAnZG9jcyc7XG4gICAgICAgIHJldHVybiBkb2NzKHtcbiAgICAgICAgICBpb0hlbHBlcixcbiAgICAgICAgICBicm93c2VyOiBjb25maWd1cmF0aW9uLnNldHRpbmdzLmdldChbJ2Jyb3dzZXInXSksXG4gICAgICAgIH0pO1xuXG4gICAgICBjYXNlICdkb2N0b3InOlxuICAgICAgICBpb0hvc3QuY3VycmVudEFjdGlvbiA9ICdkb2N0b3InO1xuICAgICAgICByZXR1cm4gZG9jdG9yKHtcbiAgICAgICAgICBpb0hlbHBlcixcbiAgICAgICAgfSk7XG5cbiAgICAgIGNhc2UgJ2xzJzpcbiAgICAgIGNhc2UgJ2xpc3QnOlxuICAgICAgICBpb0hvc3QuY3VycmVudEFjdGlvbiA9ICdsaXN0JztcbiAgICAgICAgcmV0dXJuIGNsaS5saXN0KGFyZ3MuU1RBQ0tTLCB7XG4gICAgICAgICAgbG9uZzogYXJncy5sb25nLFxuICAgICAgICAgIGpzb246IGFyZ3YuanNvbixcbiAgICAgICAgICBzaG93RGVwczogYXJncy5zaG93RGVwZW5kZW5jaWVzLFxuICAgICAgICB9KTtcblxuICAgICAgY2FzZSAnZGlmZic6XG4gICAgICAgIGlvSG9zdC5jdXJyZW50QWN0aW9uID0gJ2RpZmYnO1xuICAgICAgICBjb25zdCBlbmFibGVEaWZmTm9GYWlsID0gaXNGZWF0dXJlRW5hYmxlZChjb25maWd1cmF0aW9uLCBjeGFwaS5FTkFCTEVfRElGRl9OT19GQUlMX0NPTlRFWFQpO1xuICAgICAgICByZXR1cm4gY2xpLmRpZmYoe1xuICAgICAgICAgIHN0YWNrTmFtZXM6IGFyZ3MuU1RBQ0tTLFxuICAgICAgICAgIGV4Y2x1c2l2ZWx5OiBhcmdzLmV4Y2x1c2l2ZWx5LFxuICAgICAgICAgIHRlbXBsYXRlUGF0aDogYXJncy50ZW1wbGF0ZSxcbiAgICAgICAgICBzdHJpY3Q6IGFyZ3Muc3RyaWN0LFxuICAgICAgICAgIGNvbnRleHRMaW5lczogYXJncy5jb250ZXh0TGluZXMsXG4gICAgICAgICAgc2VjdXJpdHlPbmx5OiBhcmdzLnNlY3VyaXR5T25seSxcbiAgICAgICAgICBmYWlsOiBhcmdzLmZhaWwgIT0gbnVsbCA/IGFyZ3MuZmFpbCA6ICFlbmFibGVEaWZmTm9GYWlsLFxuICAgICAgICAgIGNvbXBhcmVBZ2FpbnN0UHJvY2Vzc2VkVGVtcGxhdGU6IGFyZ3MucHJvY2Vzc2VkLFxuICAgICAgICAgIHF1aWV0OiBhcmdzLnF1aWV0LFxuICAgICAgICAgIGNoYW5nZVNldDogYXJnc1snY2hhbmdlLXNldCddLFxuICAgICAgICAgIHRvb2xraXRTdGFja05hbWU6IHRvb2xraXRTdGFja05hbWUsXG4gICAgICAgICAgaW1wb3J0RXhpc3RpbmdSZXNvdXJjZXM6IGFyZ3MuaW1wb3J0RXhpc3RpbmdSZXNvdXJjZXMsXG4gICAgICAgICAgaW5jbHVkZU1vdmVzOiBhcmdzWydpbmNsdWRlLW1vdmVzJ10sXG4gICAgICAgIH0pO1xuXG4gICAgICBjYXNlICdkcmlmdCc6XG4gICAgICAgIGlvSG9zdC5jdXJyZW50QWN0aW9uID0gJ2RyaWZ0JztcbiAgICAgICAgcmV0dXJuIGNsaS5kcmlmdCh7XG4gICAgICAgICAgc2VsZWN0b3IsXG4gICAgICAgICAgZmFpbDogYXJncy5mYWlsLFxuICAgICAgICB9KTtcblxuICAgICAgY2FzZSAncmVmYWN0b3InOlxuICAgICAgICBpZiAoIWNvbmZpZ3VyYXRpb24uc2V0dGluZ3MuZ2V0KFsndW5zdGFibGUnXSkuaW5jbHVkZXMoJ3JlZmFjdG9yJykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVG9vbGtpdEVycm9yKCdVbnN0YWJsZSBmZWF0dXJlIHVzZTogXFwncmVmYWN0b3JcXCcgaXMgdW5zdGFibGUuIEl0IG11c3QgYmUgb3B0ZWQgaW4gdmlhIFxcJy0tdW5zdGFibGVcXCcsIGUuZy4gXFwnY2RrIHJlZmFjdG9yIC0tdW5zdGFibGU9cmVmYWN0b3JcXCcnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlvSG9zdC5jdXJyZW50QWN0aW9uID0gJ3JlZmFjdG9yJztcbiAgICAgICAgcmV0dXJuIGNsaS5yZWZhY3Rvcih7XG4gICAgICAgICAgZHJ5UnVuOiBhcmdzLmRyeVJ1bixcbiAgICAgICAgICBvdmVycmlkZUZpbGU6IGFyZ3Mub3ZlcnJpZGVGaWxlLFxuICAgICAgICAgIHJldmVydDogYXJncy5yZXZlcnQsXG4gICAgICAgICAgc3RhY2tzOiBzZWxlY3RvcixcbiAgICAgICAgICBhZGRpdGlvbmFsU3RhY2tOYW1lczogYXJyYXlGcm9tWWFyZ3MoYXJncy5hZGRpdGlvbmFsU3RhY2tOYW1lID8/IFtdKSxcbiAgICAgICAgICBmb3JjZTogYXJncy5mb3JjZSA/PyBmYWxzZSxcbiAgICAgICAgICByb2xlQXJuOiBhcmdzLnJvbGVBcm4sXG4gICAgICAgIH0pO1xuXG4gICAgICBjYXNlICdib290c3RyYXAnOlxuICAgICAgICBpb0hvc3QuY3VycmVudEFjdGlvbiA9ICdib290c3RyYXAnO1xuICAgICAgICBjb25zdCBzb3VyY2U6IEJvb3RzdHJhcFNvdXJjZSA9IGF3YWl0IGRldGVybWluZUJvb3RzdHJhcFZlcnNpb24oaW9Ib3N0LCBhcmdzKTtcblxuICAgICAgICBpZiAoYXJncy5zaG93VGVtcGxhdGUpIHtcbiAgICAgICAgICBjb25zdCBib290c3RyYXBwZXIgPSBuZXcgQm9vdHN0cmFwcGVyKHNvdXJjZSwgYXNJb0hlbHBlcihpb0hvc3QsIGlvSG9zdC5jdXJyZW50QWN0aW9uKSk7XG4gICAgICAgICAgcmV0dXJuIGJvb3RzdHJhcHBlci5zaG93VGVtcGxhdGUoYXJncy5qc29uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBjbGkuYm9vdHN0cmFwKGFyZ3MuRU5WSVJPTk1FTlRTLCB7XG4gICAgICAgICAgc291cmNlLFxuICAgICAgICAgIHJvbGVBcm46IGFyZ3Mucm9sZUFybixcbiAgICAgICAgICBmb3JjZURlcGxveW1lbnQ6IGFyZ3YuZm9yY2UsXG4gICAgICAgICAgdG9vbGtpdFN0YWNrTmFtZTogdG9vbGtpdFN0YWNrTmFtZSxcbiAgICAgICAgICBleGVjdXRlOiBhcmdzLmV4ZWN1dGUsXG4gICAgICAgICAgdGFnczogY29uZmlndXJhdGlvbi5zZXR0aW5ncy5nZXQoWyd0YWdzJ10pLFxuICAgICAgICAgIHRlcm1pbmF0aW9uUHJvdGVjdGlvbjogYXJncy50ZXJtaW5hdGlvblByb3RlY3Rpb24sXG4gICAgICAgICAgdXNlUHJldmlvdXNQYXJhbWV0ZXJzOiBhcmdzWydwcmV2aW91cy1wYXJhbWV0ZXJzJ10sXG4gICAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgICAgYnVja2V0TmFtZTogY29uZmlndXJhdGlvbi5zZXR0aW5ncy5nZXQoWyd0b29sa2l0QnVja2V0JywgJ2J1Y2tldE5hbWUnXSksXG4gICAgICAgICAgICBrbXNLZXlJZDogY29uZmlndXJhdGlvbi5zZXR0aW5ncy5nZXQoWyd0b29sa2l0QnVja2V0JywgJ2ttc0tleUlkJ10pLFxuICAgICAgICAgICAgY3JlYXRlQ3VzdG9tZXJNYXN0ZXJLZXk6IGFyZ3MuYm9vdHN0cmFwQ3VzdG9tZXJLZXksXG4gICAgICAgICAgICBxdWFsaWZpZXI6IGFyZ3MucXVhbGlmaWVyID8/IGNvbmZpZ3VyYXRpb24uY29udGV4dC5nZXQoJ0Bhd3MtY2RrL2NvcmU6Ym9vdHN0cmFwUXVhbGlmaWVyJyksXG4gICAgICAgICAgICBwdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb246IGFyZ3MucHVibGljQWNjZXNzQmxvY2tDb25maWd1cmF0aW9uLFxuICAgICAgICAgICAgZXhhbXBsZVBlcm1pc3Npb25zQm91bmRhcnk6IGFyZ3YuZXhhbXBsZVBlcm1pc3Npb25zQm91bmRhcnksXG4gICAgICAgICAgICBjdXN0b21QZXJtaXNzaW9uc0JvdW5kYXJ5OiBhcmd2LmN1c3RvbVBlcm1pc3Npb25zQm91bmRhcnksXG4gICAgICAgICAgICB0cnVzdGVkQWNjb3VudHM6IGFycmF5RnJvbVlhcmdzKGFyZ3MudHJ1c3QpLFxuICAgICAgICAgICAgdHJ1c3RlZEFjY291bnRzRm9yTG9va3VwOiBhcnJheUZyb21ZYXJncyhhcmdzLnRydXN0Rm9yTG9va3VwKSxcbiAgICAgICAgICAgIHVudHJ1c3RlZEFjY291bnRzOiBhcnJheUZyb21ZYXJncyhhcmdzLnVudHJ1c3QpLFxuICAgICAgICAgICAgY2xvdWRGb3JtYXRpb25FeGVjdXRpb25Qb2xpY2llczogYXJyYXlGcm9tWWFyZ3MoYXJncy5jbG91ZGZvcm1hdGlvbkV4ZWN1dGlvblBvbGljaWVzKSxcbiAgICAgICAgICAgIGRlbnlFeHRlcm5hbElkOiBhcmdzLmRlbnlFeHRlcm5hbElkLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBjYXNlICdkZXBsb3knOlxuICAgICAgICBpb0hvc3QuY3VycmVudEFjdGlvbiA9ICdkZXBsb3knO1xuICAgICAgICBjb25zdCBwYXJhbWV0ZXJNYXA6IHsgW25hbWU6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZCB9ID0ge307XG4gICAgICAgIGZvciAoY29uc3QgcGFyYW1ldGVyIG9mIGFyZ3MucGFyYW1ldGVycykge1xuICAgICAgICAgIGlmICh0eXBlb2YgcGFyYW1ldGVyID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgY29uc3Qga2V5VmFsdWUgPSAocGFyYW1ldGVyIGFzIHN0cmluZykuc3BsaXQoJz0nKTtcbiAgICAgICAgICAgIHBhcmFtZXRlck1hcFtrZXlWYWx1ZVswXV0gPSBrZXlWYWx1ZS5zbGljZSgxKS5qb2luKCc9Jyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGFyZ3MuZXhlY3V0ZSAhPT0gdW5kZWZpbmVkICYmIGFyZ3MubWV0aG9kICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVG9vbGtpdEVycm9yKCdDYW4gbm90IHN1cHBseSBib3RoIC0tW25vLV1leGVjdXRlIGFuZCAtLW1ldGhvZCBhdCB0aGUgc2FtZSB0aW1lJyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY2xpLmRlcGxveSh7XG4gICAgICAgICAgc2VsZWN0b3IsXG4gICAgICAgICAgZXhjbHVzaXZlbHk6IGFyZ3MuZXhjbHVzaXZlbHksXG4gICAgICAgICAgdG9vbGtpdFN0YWNrTmFtZSxcbiAgICAgICAgICByb2xlQXJuOiBhcmdzLnJvbGVBcm4sXG4gICAgICAgICAgbm90aWZpY2F0aW9uQXJuczogYXJncy5ub3RpZmljYXRpb25Bcm5zLFxuICAgICAgICAgIHJlcXVpcmVBcHByb3ZhbDogY29uZmlndXJhdGlvbi5zZXR0aW5ncy5nZXQoWydyZXF1aXJlQXBwcm92YWwnXSksXG4gICAgICAgICAgcmV1c2VBc3NldHM6IGFyZ3NbJ2J1aWxkLWV4Y2x1ZGUnXSxcbiAgICAgICAgICB0YWdzOiBjb25maWd1cmF0aW9uLnNldHRpbmdzLmdldChbJ3RhZ3MnXSksXG4gICAgICAgICAgZGVwbG95bWVudE1ldGhvZDogZGV0ZXJtaW5lRGVwbG95bWVudE1ldGhvZChhcmdzLCBjb25maWd1cmF0aW9uKSxcbiAgICAgICAgICBmb3JjZTogYXJncy5mb3JjZSxcbiAgICAgICAgICBwYXJhbWV0ZXJzOiBwYXJhbWV0ZXJNYXAsXG4gICAgICAgICAgdXNlUHJldmlvdXNQYXJhbWV0ZXJzOiBhcmdzWydwcmV2aW91cy1wYXJhbWV0ZXJzJ10sXG4gICAgICAgICAgb3V0cHV0c0ZpbGU6IGNvbmZpZ3VyYXRpb24uc2V0dGluZ3MuZ2V0KFsnb3V0cHV0c0ZpbGUnXSksXG4gICAgICAgICAgcHJvZ3Jlc3M6IGNvbmZpZ3VyYXRpb24uc2V0dGluZ3MuZ2V0KFsncHJvZ3Jlc3MnXSksXG4gICAgICAgICAgY2k6IGFyZ3MuY2ksXG4gICAgICAgICAgcm9sbGJhY2s6IGNvbmZpZ3VyYXRpb24uc2V0dGluZ3MuZ2V0KFsncm9sbGJhY2snXSksXG4gICAgICAgICAgd2F0Y2g6IGFyZ3Mud2F0Y2gsXG4gICAgICAgICAgdHJhY2VMb2dzOiBhcmdzLmxvZ3MsXG4gICAgICAgICAgY29uY3VycmVuY3k6IGFyZ3MuY29uY3VycmVuY3ksXG4gICAgICAgICAgYXNzZXRQYXJhbGxlbGlzbTogY29uZmlndXJhdGlvbi5zZXR0aW5ncy5nZXQoWydhc3NldFBhcmFsbGVsaXNtJ10pLFxuICAgICAgICAgIGFzc2V0QnVpbGRUaW1lOiBjb25maWd1cmF0aW9uLnNldHRpbmdzLmdldChbJ2Fzc2V0UHJlYnVpbGQnXSlcbiAgICAgICAgICAgID8gQXNzZXRCdWlsZFRpbWUuQUxMX0JFRk9SRV9ERVBMT1lcbiAgICAgICAgICAgIDogQXNzZXRCdWlsZFRpbWUuSlVTVF9JTl9USU1FLFxuICAgICAgICAgIGlnbm9yZU5vU3RhY2tzOiBhcmdzLmlnbm9yZU5vU3RhY2tzLFxuICAgICAgICB9KTtcblxuICAgICAgY2FzZSAncm9sbGJhY2snOlxuICAgICAgICBpb0hvc3QuY3VycmVudEFjdGlvbiA9ICdyb2xsYmFjayc7XG4gICAgICAgIHJldHVybiBjbGkucm9sbGJhY2soe1xuICAgICAgICAgIHNlbGVjdG9yLFxuICAgICAgICAgIHRvb2xraXRTdGFja05hbWUsXG4gICAgICAgICAgcm9sZUFybjogYXJncy5yb2xlQXJuLFxuICAgICAgICAgIGZvcmNlOiBhcmdzLmZvcmNlLFxuICAgICAgICAgIHZhbGlkYXRlQm9vdHN0cmFwU3RhY2tWZXJzaW9uOiBhcmdzWyd2YWxpZGF0ZS1ib290c3RyYXAtdmVyc2lvbiddLFxuICAgICAgICAgIG9ycGhhbkxvZ2ljYWxJZHM6IGFyZ3Mub3JwaGFuLFxuICAgICAgICB9KTtcblxuICAgICAgY2FzZSAnaW1wb3J0JzpcbiAgICAgICAgaW9Ib3N0LmN1cnJlbnRBY3Rpb24gPSAnaW1wb3J0JztcbiAgICAgICAgcmV0dXJuIGNsaS5pbXBvcnQoe1xuICAgICAgICAgIHNlbGVjdG9yLFxuICAgICAgICAgIHRvb2xraXRTdGFja05hbWUsXG4gICAgICAgICAgcm9sZUFybjogYXJncy5yb2xlQXJuLFxuICAgICAgICAgIGRlcGxveW1lbnRNZXRob2Q6IHtcbiAgICAgICAgICAgIG1ldGhvZDogJ2NoYW5nZS1zZXQnLFxuICAgICAgICAgICAgZXhlY3V0ZTogYXJncy5leGVjdXRlLFxuICAgICAgICAgICAgY2hhbmdlU2V0TmFtZTogYXJncy5jaGFuZ2VTZXROYW1lLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgcHJvZ3Jlc3M6IGNvbmZpZ3VyYXRpb24uc2V0dGluZ3MuZ2V0KFsncHJvZ3Jlc3MnXSksXG4gICAgICAgICAgcm9sbGJhY2s6IGNvbmZpZ3VyYXRpb24uc2V0dGluZ3MuZ2V0KFsncm9sbGJhY2snXSksXG4gICAgICAgICAgcmVjb3JkUmVzb3VyY2VNYXBwaW5nOiBhcmdzWydyZWNvcmQtcmVzb3VyY2UtbWFwcGluZyddLFxuICAgICAgICAgIHJlc291cmNlTWFwcGluZ0ZpbGU6IGFyZ3NbJ3Jlc291cmNlLW1hcHBpbmcnXSxcbiAgICAgICAgICBmb3JjZTogYXJncy5mb3JjZSxcbiAgICAgICAgfSk7XG5cbiAgICAgIGNhc2UgJ3dhdGNoJzpcbiAgICAgICAgaW9Ib3N0LmN1cnJlbnRBY3Rpb24gPSAnd2F0Y2gnO1xuICAgICAgICBhd2FpdCBjbGkud2F0Y2goe1xuICAgICAgICAgIHNlbGVjdG9yLFxuICAgICAgICAgIGV4Y2x1c2l2ZWx5OiBhcmdzLmV4Y2x1c2l2ZWx5LFxuICAgICAgICAgIHRvb2xraXRTdGFja05hbWUsXG4gICAgICAgICAgcm9sZUFybjogYXJncy5yb2xlQXJuLFxuICAgICAgICAgIHJldXNlQXNzZXRzOiBhcmdzWydidWlsZC1leGNsdWRlJ10sXG4gICAgICAgICAgZGVwbG95bWVudE1ldGhvZDogZGV0ZXJtaW5lRGVwbG95bWVudE1ldGhvZChhcmdzLCBjb25maWd1cmF0aW9uLCB0cnVlKSxcbiAgICAgICAgICBmb3JjZTogYXJncy5mb3JjZSxcbiAgICAgICAgICBwcm9ncmVzczogY29uZmlndXJhdGlvbi5zZXR0aW5ncy5nZXQoWydwcm9ncmVzcyddKSxcbiAgICAgICAgICByb2xsYmFjazogY29uZmlndXJhdGlvbi5zZXR0aW5ncy5nZXQoWydyb2xsYmFjayddKSxcbiAgICAgICAgICB0cmFjZUxvZ3M6IGFyZ3MubG9ncyxcbiAgICAgICAgICBjb25jdXJyZW5jeTogYXJncy5jb25jdXJyZW5jeSxcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybjtcblxuICAgICAgY2FzZSAnZGVzdHJveSc6XG4gICAgICAgIGlvSG9zdC5jdXJyZW50QWN0aW9uID0gJ2Rlc3Ryb3knO1xuICAgICAgICByZXR1cm4gY2xpLmRlc3Ryb3koe1xuICAgICAgICAgIHNlbGVjdG9yLFxuICAgICAgICAgIGV4Y2x1c2l2ZWx5OiBhcmdzLmV4Y2x1c2l2ZWx5LFxuICAgICAgICAgIGZvcmNlOiBhcmdzLmZvcmNlLFxuICAgICAgICAgIHJvbGVBcm46IGFyZ3Mucm9sZUFybixcbiAgICAgICAgfSk7XG5cbiAgICAgIGNhc2UgJ2djJzpcbiAgICAgICAgaW9Ib3N0LmN1cnJlbnRBY3Rpb24gPSAnZ2MnO1xuICAgICAgICBpZiAoIWNvbmZpZ3VyYXRpb24uc2V0dGluZ3MuZ2V0KFsndW5zdGFibGUnXSkuaW5jbHVkZXMoJ2djJykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVG9vbGtpdEVycm9yKCdVbnN0YWJsZSBmZWF0dXJlIHVzZTogXFwnZ2NcXCcgaXMgdW5zdGFibGUuIEl0IG11c3QgYmUgb3B0ZWQgaW4gdmlhIFxcJy0tdW5zdGFibGVcXCcsIGUuZy4gXFwnY2RrIGdjIC0tdW5zdGFibGU9Z2NcXCcnKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYXJncy5ib290c3RyYXBTdGFja05hbWUpIHtcbiAgICAgICAgICBhd2FpdCBpb0hvc3QuZGVmYXVsdHMud2FybignLS1ib290c3RyYXAtc3RhY2stbmFtZSBpcyBkZXByZWNhdGVkIGFuZCB3aWxsIGJlIHJlbW92ZWQgd2hlbiBnYyBpcyBHQS4gVXNlIC0tdG9vbGtpdC1zdGFjay1uYW1lLicpO1xuICAgICAgICB9XG4gICAgICAgIC8vIHJvbGVBcm4gaXMgZGVmaW5lZCBmb3Igd2hlbiBjbG91ZGZvcm1hdGlvbiBpcyBpbnZva2VkXG4gICAgICAgIC8vIFRoaXMgY29uZmxpY3RzIHdpdGggZGlyZWN0IHNkayBjYWxscyBleGlzdGluZyBpbiB0aGUgZ2MgY29tbWFuZCB0byBzMyBhbmQgZWNyXG4gICAgICAgIGlmIChhcmdzLnJvbGVBcm4pIHtcbiAgICAgICAgICBhd2FpdCBpb0hvc3QuZGVmYXVsdHMud2FybignVGhlIC0tcm9sZS1hcm4gb3B0aW9uIGlzIG5vdCBzdXBwb3J0ZWQgZm9yIHRoZSBnYyBjb21tYW5kIGFuZCB3aWxsIGJlIGlnbm9yZWQuJyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNsaS5nYXJiYWdlQ29sbGVjdChhcmdzLkVOVklST05NRU5UUywge1xuICAgICAgICAgIGFjdGlvbjogYXJncy5hY3Rpb24sXG4gICAgICAgICAgdHlwZTogYXJncy50eXBlLFxuICAgICAgICAgIHJvbGxiYWNrQnVmZmVyRGF5czogYXJnc1sncm9sbGJhY2stYnVmZmVyLWRheXMnXSxcbiAgICAgICAgICBjcmVhdGVkQnVmZmVyRGF5czogYXJnc1snY3JlYXRlZC1idWZmZXItZGF5cyddLFxuICAgICAgICAgIGJvb3RzdHJhcFN0YWNrTmFtZTogYXJncy50b29sa2l0U3RhY2tOYW1lID8/IGFyZ3MuYm9vdHN0cmFwU3RhY2tOYW1lLFxuICAgICAgICAgIGNvbmZpcm06IGFyZ3MuY29uZmlybSxcbiAgICAgICAgfSk7XG5cbiAgICAgIGNhc2UgJ2ZsYWdzJzpcbiAgICAgICAgaW9Ib3N0LmN1cnJlbnRBY3Rpb24gPSAnZmxhZ3MnO1xuXG4gICAgICAgIGlmICghY29uZmlndXJhdGlvbi5zZXR0aW5ncy5nZXQoWyd1bnN0YWJsZSddKS5pbmNsdWRlcygnZmxhZ3MnKSkge1xuICAgICAgICAgIHRocm93IG5ldyBUb29sa2l0RXJyb3IoJ1Vuc3RhYmxlIGZlYXR1cmUgdXNlOiBcXCdmbGFnc1xcJyBpcyB1bnN0YWJsZS4gSXQgbXVzdCBiZSBvcHRlZCBpbiB2aWEgXFwnLS11bnN0YWJsZVxcJywgZS5nLiBcXCdjZGsgZmxhZ3MgLS11bnN0YWJsZT1mbGFnc1xcJycpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHRvb2xraXQgPSBuZXcgVG9vbGtpdCh7XG4gICAgICAgICAgaW9Ib3N0LFxuICAgICAgICAgIHRvb2xraXRTdGFja05hbWUsXG4gICAgICAgICAgdW5zdGFibGVGZWF0dXJlczogY29uZmlndXJhdGlvbi5zZXR0aW5ncy5nZXQoWyd1bnN0YWJsZSddKSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGZsYWdzRGF0YSA9IGF3YWl0IHRvb2xraXQuZmxhZ3MoY2xvdWRFeGVjdXRhYmxlKTtcbiAgICAgICAgY29uc3QgaGFuZGxlciA9IG5ldyBGbGFnQ29tbWFuZEhhbmRsZXIoZmxhZ3NEYXRhLCBpb0hlbHBlciwgYXJncywgdG9vbGtpdCk7XG4gICAgICAgIHJldHVybiBoYW5kbGVyLnByb2Nlc3NGbGFnc0NvbW1hbmQoKTtcblxuICAgICAgY2FzZSAnc3ludGhlc2l6ZSc6XG4gICAgICBjYXNlICdzeW50aCc6XG4gICAgICAgIGlvSG9zdC5jdXJyZW50QWN0aW9uID0gJ3N5bnRoJztcbiAgICAgICAgY29uc3QgcXVpZXQgPSBjb25maWd1cmF0aW9uLnNldHRpbmdzLmdldChbJ3F1aWV0J10pID8/IGFyZ3MucXVpZXQ7XG4gICAgICAgIGlmIChhcmdzLmV4Y2x1c2l2ZWx5KSB7XG4gICAgICAgICAgcmV0dXJuIGNsaS5zeW50aChhcmdzLlNUQUNLUywgYXJncy5leGNsdXNpdmVseSwgcXVpZXQsIGFyZ3MudmFsaWRhdGlvbiwgYXJndi5qc29uKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gY2xpLnN5bnRoKGFyZ3MuU1RBQ0tTLCB0cnVlLCBxdWlldCwgYXJncy52YWxpZGF0aW9uLCBhcmd2Lmpzb24pO1xuICAgICAgICB9XG5cbiAgICAgIGNhc2UgJ25vdGljZXMnOlxuICAgICAgICBpb0hvc3QuY3VycmVudEFjdGlvbiA9ICdub3RpY2VzJztcbiAgICAgICAgLy8gSWYgdGhlIHVzZXIgZXhwbGljaXRseSBhc2tzIGZvciBub3RpY2VzLCB0aGV5IGFyZSBub3cgdGhlIHByaW1hcnkgb3V0cHV0XG4gICAgICAgIC8vIG9mIHRoZSBjb21tYW5kIGFuZCB0aGV5IHNob3VsZCBnbyB0byBzdGRvdXQuXG4gICAgICAgIGlvSG9zdC5ub3RpY2VzRGVzdGluYXRpb24gPSAnc3Rkb3V0JztcblxuICAgICAgICAvLyBUaGlzIGlzIGEgdmFsaWQgY29tbWFuZCwgYnV0IHdlJ3JlIHBvc3Rwb25pbmcgaXRzIGV4ZWN1dGlvbiBiZWNhdXNlIGRpc3BsYXlpbmdcbiAgICAgICAgLy8gbm90aWNlcyBhdXRvbWF0aWNhbGx5IGhhcHBlbnMgYWZ0ZXIgZXZlcnkgY29tbWFuZC5cbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBjYXNlICdtZXRhZGF0YSc6XG4gICAgICAgIGlvSG9zdC5jdXJyZW50QWN0aW9uID0gJ21ldGFkYXRhJztcbiAgICAgICAgcmV0dXJuIGNsaS5tZXRhZGF0YShhcmdzLlNUQUNLLCBhcmd2Lmpzb24pO1xuXG4gICAgICBjYXNlICdhY2tub3dsZWRnZSc6XG4gICAgICBjYXNlICdhY2snOlxuICAgICAgICBpb0hvc3QuY3VycmVudEFjdGlvbiA9ICdub3RpY2VzJztcbiAgICAgICAgcmV0dXJuIGNsaS5hY2tub3dsZWRnZShhcmdzLklEKTtcblxuICAgICAgY2FzZSAnY2xpLXRlbGVtZXRyeSc6XG4gICAgICAgIGlvSG9zdC5jdXJyZW50QWN0aW9uID0gJ2NsaS10ZWxlbWV0cnknO1xuICAgICAgICBpZiAoYXJncy5lbmFibGUgPT09IHVuZGVmaW5lZCAmJiBhcmdzLmRpc2FibGUgPT09IHVuZGVmaW5lZCAmJiBhcmdzLnN0YXR1cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFRvb2xraXRFcnJvcignTXVzdCBzcGVjaWZ5IFxcJy0tZW5hYmxlXFwnLCBcXCctLWRpc2FibGVcXCcsIG9yIFxcJy0tc3RhdHVzXFwnJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYXJncy5zdGF0dXMpIHtcbiAgICAgICAgICByZXR1cm4gY2xpLmNsaVRlbGVtZXRyeVN0YXR1cyhhcmdzWyd2ZXJzaW9uLXJlcG9ydGluZyddKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCBlbmFibGUgPSBhcmdzLmVuYWJsZSA/PyAhYXJncy5kaXNhYmxlO1xuICAgICAgICAgIHJldHVybiBjbGkuY2xpVGVsZW1ldHJ5KGVuYWJsZSk7XG4gICAgICAgIH1cbiAgICAgIGNhc2UgJ2luaXQnOlxuICAgICAgICBpb0hvc3QuY3VycmVudEFjdGlvbiA9ICdpbml0JztcbiAgICAgICAgY29uc3QgbGFuZ3VhZ2UgPSBjb25maWd1cmF0aW9uLnNldHRpbmdzLmdldChbJ2xhbmd1YWdlJ10pO1xuICAgICAgICBpZiAoYXJncy5saXN0KSB7XG4gICAgICAgICAgcmV0dXJuIHByaW50QXZhaWxhYmxlVGVtcGxhdGVzKGlvSGVscGVyLCBsYW5ndWFnZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gR2F0ZSBjdXN0b20gdGVtcGxhdGUgc3VwcG9ydCB3aXRoIHVuc3RhYmxlIGZsYWdcbiAgICAgICAgICBpZiAoYXJnc1snZnJvbS1wYXRoJ10gJiYgIWNvbmZpZ3VyYXRpb24uc2V0dGluZ3MuZ2V0KFsndW5zdGFibGUnXSkuaW5jbHVkZXMoJ2luaXQnKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFRvb2xraXRFcnJvcignVW5zdGFibGUgZmVhdHVyZSB1c2U6IFxcJ2luaXRcXCcgd2l0aCBjdXN0b20gdGVtcGxhdGVzIGlzIHVuc3RhYmxlLiBJdCBtdXN0IGJlIG9wdGVkIGluIHZpYSBcXCctLXVuc3RhYmxlXFwnLCBlLmcuIFxcJ2NkayBpbml0IC0tZnJvbS1wYXRoPS4vbXktdGVtcGxhdGUgLS11bnN0YWJsZT1pbml0XFwnJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBjbGlJbml0KHtcbiAgICAgICAgICAgIGlvSGVscGVyLFxuICAgICAgICAgICAgdHlwZTogYXJncy5URU1QTEFURSxcbiAgICAgICAgICAgIGxhbmd1YWdlLFxuICAgICAgICAgICAgY2FuVXNlTmV0d29yazogdW5kZWZpbmVkLFxuICAgICAgICAgICAgZ2VuZXJhdGVPbmx5OiBhcmdzLmdlbmVyYXRlT25seSxcbiAgICAgICAgICAgIGxpYlZlcnNpb246IGFyZ3MubGliVmVyc2lvbixcbiAgICAgICAgICAgIGZyb21QYXRoOiBhcmdzWydmcm9tLXBhdGgnXSxcbiAgICAgICAgICAgIHRlbXBsYXRlUGF0aDogYXJnc1sndGVtcGxhdGUtcGF0aCddLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICBjYXNlICdtaWdyYXRlJzpcbiAgICAgICAgaW9Ib3N0LmN1cnJlbnRBY3Rpb24gPSAnbWlncmF0ZSc7XG4gICAgICAgIHJldHVybiBjbGkubWlncmF0ZSh7XG4gICAgICAgICAgc3RhY2tOYW1lOiBhcmdzWydzdGFjay1uYW1lJ10sXG4gICAgICAgICAgZnJvbVBhdGg6IGFyZ3NbJ2Zyb20tcGF0aCddLFxuICAgICAgICAgIGZyb21TdGFjazogYXJnc1snZnJvbS1zdGFjayddLFxuICAgICAgICAgIGxhbmd1YWdlOiBhcmdzLmxhbmd1YWdlLFxuICAgICAgICAgIG91dHB1dFBhdGg6IGFyZ3NbJ291dHB1dC1wYXRoJ10sXG4gICAgICAgICAgZnJvbVNjYW46IGdldE1pZ3JhdGVTY2FuVHlwZShhcmdzWydmcm9tLXNjYW4nXSksXG4gICAgICAgICAgZmlsdGVyOiBhcmdzLmZpbHRlcixcbiAgICAgICAgICBhY2NvdW50OiBhcmdzLmFjY291bnQsXG4gICAgICAgICAgcmVnaW9uOiBhcmdzLnJlZ2lvbixcbiAgICAgICAgICBjb21wcmVzczogYXJncy5jb21wcmVzcyxcbiAgICAgICAgfSk7XG4gICAgICBjYXNlICd2ZXJzaW9uJzpcbiAgICAgICAgaW9Ib3N0LmN1cnJlbnRBY3Rpb24gPSAndmVyc2lvbic7XG4gICAgICAgIHJldHVybiBpb0hvc3QuZGVmYXVsdHMucmVzdWx0KHZlcnNpb25XaXRoQnVpbGQoKSk7XG5cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBUb29sa2l0RXJyb3IoJ1Vua25vd24gY29tbWFuZDogJyArIGNvbW1hbmQpO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIERldGVybWluZSB3aGljaCB2ZXJzaW9uIG9mIGJvb3RzdHJhcHBpbmdcbiAqL1xuYXN5bmMgZnVuY3Rpb24gZGV0ZXJtaW5lQm9vdHN0cmFwVmVyc2lvbihpb0hvc3Q6IENsaUlvSG9zdCwgYXJnczogeyB0ZW1wbGF0ZT86IHN0cmluZyB9KTogUHJvbWlzZTxCb290c3RyYXBTb3VyY2U+IHtcbiAgbGV0IHNvdXJjZTogQm9vdHN0cmFwU291cmNlO1xuICBpZiAoYXJncy50ZW1wbGF0ZSkge1xuICAgIGF3YWl0IGlvSG9zdC5kZWZhdWx0cy5pbmZvKGBVc2luZyBib290c3RyYXBwaW5nIHRlbXBsYXRlIGZyb20gJHthcmdzLnRlbXBsYXRlfWApO1xuICAgIHNvdXJjZSA9IHsgc291cmNlOiAnY3VzdG9tJywgdGVtcGxhdGVGaWxlOiBhcmdzLnRlbXBsYXRlIH07XG4gIH0gZWxzZSBpZiAocHJvY2Vzcy5lbnYuQ0RLX0xFR0FDWV9CT09UU1RSQVApIHtcbiAgICBhd2FpdCBpb0hvc3QuZGVmYXVsdHMuaW5mbygnQ0RLX0xFR0FDWV9CT09UU1RSQVAgc2V0LCB1c2luZyBsZWdhY3ktc3R5bGUgYm9vdHN0cmFwcGluZycpO1xuICAgIHNvdXJjZSA9IHsgc291cmNlOiAnbGVnYWN5JyB9O1xuICB9IGVsc2Uge1xuICAgIC8vIGluIFYyLCB0aGUgXCJuZXdcIiBib290c3RyYXBwaW5nIGlzIHRoZSBkZWZhdWx0XG4gICAgc291cmNlID0geyBzb3VyY2U6ICdkZWZhdWx0JyB9O1xuICB9XG4gIHJldHVybiBzb3VyY2U7XG59XG5cbmZ1bmN0aW9uIGlzRmVhdHVyZUVuYWJsZWQoY29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbiwgZmVhdHVyZUZsYWc6IHN0cmluZykge1xuICByZXR1cm4gY29uZmlndXJhdGlvbi5jb250ZXh0LmdldChmZWF0dXJlRmxhZykgPz8gY3hhcGkuZnV0dXJlRmxhZ0RlZmF1bHQoZmVhdHVyZUZsYWcpO1xufVxuXG4vKipcbiAqIFRyYW5zbGF0ZSBhIFlhcmdzIGlucHV0IGFycmF5IHRvIHNvbWV0aGluZyB0aGF0IG1ha2VzIG1vcmUgc2Vuc2UgaW4gYSBwcm9ncmFtbWluZyBsYW5ndWFnZVxuICogbW9kZWwgKHRlbGxpbmcgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiBhYnNlbmNlIGFuZCBhbiBlbXB0eSBhcnJheSlcbiAqXG4gKiAtIEFuIGVtcHR5IGFycmF5IGlzIHRoZSBkZWZhdWx0IGNhc2UsIG1lYW5pbmcgdGhlIHVzZXIgZGlkbid0IHBhc3MgYW55IGFyZ3VtZW50cy4gV2UgcmV0dXJuXG4gKiAgIHVuZGVmaW5lZC5cbiAqIC0gSWYgdGhlIHVzZXIgcGFzc2VkIGEgc2luZ2xlIGVtcHR5IHN0cmluZywgdGhleSBkaWQgc29tZXRoaW5nIGxpa2UgYC0tYXJyYXk9YCwgd2hpY2ggd2UnbGxcbiAqICAgdGFrZSB0byBtZWFuIHRoZXkgcGFzc2VkIGFuIGVtcHR5IGFycmF5LlxuICovXG5mdW5jdGlvbiBhcnJheUZyb21ZYXJncyh4czogc3RyaW5nW10pOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7XG4gIGlmICh4cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIHJldHVybiB4cy5maWx0ZXIoKHgpID0+IHggIT09ICcnKTtcbn1cblxuZnVuY3Rpb24gZGV0ZXJtaW5lRGVwbG95bWVudE1ldGhvZChhcmdzOiBhbnksIGNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb24sIHdhdGNoPzogYm9vbGVhbik6IERlcGxveW1lbnRNZXRob2Qge1xuICBsZXQgZGVwbG95bWVudE1ldGhvZDogQ2hhbmdlU2V0RGVwbG95bWVudCB8IERpcmVjdERlcGxveW1lbnQgfCB1bmRlZmluZWQ7XG4gIHN3aXRjaCAoYXJncy5tZXRob2QpIHtcbiAgICBjYXNlICdkaXJlY3QnOlxuICAgICAgaWYgKGFyZ3MuY2hhbmdlU2V0TmFtZSkge1xuICAgICAgICB0aHJvdyBuZXcgVG9vbGtpdEVycm9yKCctLWNoYW5nZS1zZXQtbmFtZSBjYW5ub3QgYmUgdXNlZCB3aXRoIG1ldGhvZD1kaXJlY3QnKTtcbiAgICAgIH1cbiAgICAgIGlmIChhcmdzLmltcG9ydEV4aXN0aW5nUmVzb3VyY2VzKSB7XG4gICAgICAgIHRocm93IG5ldyBUb29sa2l0RXJyb3IoJy0taW1wb3J0LWV4aXN0aW5nLXJlc291cmNlcyBjYW5ub3QgYmUgZW5hYmxlZCB3aXRoIG1ldGhvZD1kaXJlY3QnKTtcbiAgICAgIH1cbiAgICAgIGRlcGxveW1lbnRNZXRob2QgPSB7IG1ldGhvZDogJ2RpcmVjdCcgfTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2NoYW5nZS1zZXQnOlxuICAgICAgZGVwbG95bWVudE1ldGhvZCA9IHtcbiAgICAgICAgbWV0aG9kOiAnY2hhbmdlLXNldCcsXG4gICAgICAgIGV4ZWN1dGU6IHRydWUsXG4gICAgICAgIGNoYW5nZVNldE5hbWU6IGFyZ3MuY2hhbmdlU2V0TmFtZSxcbiAgICAgICAgaW1wb3J0RXhpc3RpbmdSZXNvdXJjZXM6IGFyZ3MuaW1wb3J0RXhpc3RpbmdSZXNvdXJjZXMsXG4gICAgICB9O1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAncHJlcGFyZS1jaGFuZ2Utc2V0JzpcbiAgICAgIGRlcGxveW1lbnRNZXRob2QgPSB7XG4gICAgICAgIG1ldGhvZDogJ2NoYW5nZS1zZXQnLFxuICAgICAgICBleGVjdXRlOiBmYWxzZSxcbiAgICAgICAgY2hhbmdlU2V0TmFtZTogYXJncy5jaGFuZ2VTZXROYW1lLFxuICAgICAgICBpbXBvcnRFeGlzdGluZ1Jlc291cmNlczogYXJncy5pbXBvcnRFeGlzdGluZ1Jlc291cmNlcyxcbiAgICAgIH07XG4gICAgICBicmVhaztcbiAgICBjYXNlIHVuZGVmaW5lZDpcbiAgICBkZWZhdWx0OlxuICAgICAgZGVwbG95bWVudE1ldGhvZCA9IHtcbiAgICAgICAgbWV0aG9kOiAnY2hhbmdlLXNldCcsXG4gICAgICAgIGV4ZWN1dGU6IHdhdGNoID8gdHJ1ZSA6IGFyZ3MuZXhlY3V0ZSA/PyB0cnVlLFxuICAgICAgICBjaGFuZ2VTZXROYW1lOiBhcmdzLmNoYW5nZVNldE5hbWUsXG4gICAgICAgIGltcG9ydEV4aXN0aW5nUmVzb3VyY2VzOiBhcmdzLmltcG9ydEV4aXN0aW5nUmVzb3VyY2VzLFxuICAgICAgfTtcbiAgICAgIGJyZWFrO1xuICB9XG5cbiAgY29uc3QgaG90c3dhcE1vZGUgPSBkZXRlcm1pbmVIb3Rzd2FwTW9kZShhcmdzLmhvdHN3YXAsIGFyZ3MuaG90c3dhcEZhbGxiYWNrLCB3YXRjaCk7XG4gIGNvbnN0IGhvdHN3YXBQcm9wZXJ0aWVzID0gY29uZmlndXJhdGlvbi5zZXR0aW5ncy5nZXQoWydob3Rzd2FwJ10pIHx8IHt9O1xuICBzd2l0Y2ggKGhvdHN3YXBNb2RlKSB7XG4gICAgY2FzZSBIb3Rzd2FwTW9kZS5GQUxMX0JBQ0s6XG4gICAgICByZXR1cm4ge1xuICAgICAgICBtZXRob2Q6ICdob3Rzd2FwJyxcbiAgICAgICAgcHJvcGVydGllczogaG90c3dhcFByb3BlcnRpZXMsXG4gICAgICAgIGZhbGxiYWNrOiBkZXBsb3ltZW50TWV0aG9kLFxuICAgICAgfTtcbiAgICBjYXNlIEhvdHN3YXBNb2RlLkhPVFNXQVBfT05MWTpcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG1ldGhvZDogJ2hvdHN3YXAnLFxuICAgICAgICBwcm9wZXJ0aWVzOiBob3Rzd2FwUHJvcGVydGllcyxcbiAgICAgIH07XG4gICAgZGVmYXVsdDpcbiAgICBjYXNlIEhvdHN3YXBNb2RlLkZVTExfREVQTE9ZTUVOVDpcbiAgICAgIHJldHVybiBkZXBsb3ltZW50TWV0aG9kO1xuICB9XG59XG5cbmZ1bmN0aW9uIGRldGVybWluZUhvdHN3YXBNb2RlKGhvdHN3YXA/OiBib29sZWFuLCBob3Rzd2FwRmFsbGJhY2s/OiBib29sZWFuLCB3YXRjaD86IGJvb2xlYW4pOiBIb3Rzd2FwTW9kZSB7XG4gIGlmIChob3Rzd2FwICYmIGhvdHN3YXBGYWxsYmFjaykge1xuICAgIHRocm93IG5ldyBUb29sa2l0RXJyb3IoJ0NhbiBub3Qgc3VwcGx5IGJvdGggLS1ob3Rzd2FwIGFuZCAtLWhvdHN3YXAtZmFsbGJhY2sgYXQgdGhlIHNhbWUgdGltZScpO1xuICB9IGVsc2UgaWYgKCFob3Rzd2FwICYmICFob3Rzd2FwRmFsbGJhY2spIHtcbiAgICBpZiAoaG90c3dhcCA9PT0gdW5kZWZpbmVkICYmIGhvdHN3YXBGYWxsYmFjayA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gd2F0Y2ggPyBIb3Rzd2FwTW9kZS5IT1RTV0FQX09OTFkgOiBIb3Rzd2FwTW9kZS5GVUxMX0RFUExPWU1FTlQ7XG4gICAgfSBlbHNlIGlmIChob3Rzd2FwID09PSBmYWxzZSB8fCBob3Rzd2FwRmFsbGJhY2sgPT09IGZhbHNlKSB7XG4gICAgICByZXR1cm4gSG90c3dhcE1vZGUuRlVMTF9ERVBMT1lNRU5UO1xuICAgIH1cbiAgfVxuXG4gIGxldCBob3Rzd2FwTW9kZTogSG90c3dhcE1vZGU7XG4gIGlmIChob3Rzd2FwKSB7XG4gICAgaG90c3dhcE1vZGUgPSBIb3Rzd2FwTW9kZS5IT1RTV0FQX09OTFk7XG4gICAgLyogaWYgKGhvdHN3YXBGYWxsYmFjaykqL1xuICB9IGVsc2Uge1xuICAgIGhvdHN3YXBNb2RlID0gSG90c3dhcE1vZGUuRkFMTF9CQUNLO1xuICB9XG5cbiAgcmV0dXJuIGhvdHN3YXBNb2RlO1xufVxuXG4vKiBjOCBpZ25vcmUgc3RhcnQgKi8gLy8gd2UgbmV2ZXIgY2FsbCB0aGlzIGluIHVuaXQgdGVzdHNcbmV4cG9ydCBmdW5jdGlvbiBjbGkoYXJnczogc3RyaW5nW10gPSBwcm9jZXNzLmFyZ3Yuc2xpY2UoMikpIHtcbiAgbGV0IGVycm9yOiBFcnJvckRldGFpbHMgfCB1bmRlZmluZWQ7XG4gIGV4ZWMoYXJncylcbiAgICAudGhlbihhc3luYyAodmFsdWUpID0+IHtcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHByb2Nlc3MuZXhpdENvZGUgPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC5jYXRjaChhc3luYyAoZXJyKSA9PiB7XG4gICAgICAvLyBMb2cgdGhlIHN0YWNrIHRyYWNlIGlmIHdlJ3JlIG9uIGEgZGV2ZWxvcGVyIHdvcmtzdGF0aW9uLiBPdGhlcndpc2UgdGhpcyB3aWxsIGJlIGludG8gYSBtaW5pZmllZFxuICAgICAgLy8gZmlsZSBhbmQgdGhlIHByaW50ZWQgY29kZSBsaW5lIGFuZCBzdGFjayB0cmFjZSBhcmUgaHVnZSBhbmQgdXNlbGVzcy5cbiAgICAgIHByZXR0eVByaW50RXJyb3IoZXJyLCBpc0RldmVsb3BlckJ1aWxkVmVyc2lvbigpKTtcbiAgICAgIGVycm9yID0ge1xuICAgICAgICBuYW1lOiBjZGtDbGlFcnJvck5hbWUoZXJyLm5hbWUpLFxuICAgICAgfTtcbiAgICAgIHByb2Nlc3MuZXhpdENvZGUgPSAxO1xuICAgIH0pXG4gICAgLmZpbmFsbHkoYXN5bmMgKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgQ2xpSW9Ib3N0LmdldCgpPy50ZWxlbWV0cnk/LmVuZChlcnJvcik7XG4gICAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgICAgYXdhaXQgQ2xpSW9Ib3N0LmdldCgpPy5hc0lvSGVscGVyKCkuZGVmYXVsdHMudHJhY2UoYEVuZGluZyBUZWxlbWV0cnkgZmFpbGVkOiAke2UubWVzc2FnZX1gKTtcbiAgICAgIH1cbiAgICB9KTtcbn1cbi8qIGM4IGlnbm9yZSBzdG9wICovXG4iXX0=