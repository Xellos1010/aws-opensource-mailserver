"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertYargsToUserInput = convertYargsToUserInput;
exports.convertConfigToUserInput = convertConfigToUserInput;
// @ts-ignore TS6133
function convertYargsToUserInput(args) {
    const globalOptions = {
        app: args.app,
        build: args.build,
        context: args.context,
        plugin: args.plugin,
        trace: args.trace,
        strict: args.strict,
        lookups: args.lookups,
        ignoreErrors: args.ignoreErrors,
        json: args.json,
        verbose: args.verbose,
        debug: args.debug,
        profile: args.profile,
        proxy: args.proxy,
        caBundlePath: args.caBundlePath,
        ec2creds: args.ec2creds,
        versionReporting: args.versionReporting,
        pathMetadata: args.pathMetadata,
        assetMetadata: args.assetMetadata,
        roleArn: args.roleArn,
        staging: args.staging,
        output: args.output,
        notices: args.notices,
        noColor: args.noColor,
        ci: args.ci,
        unstable: args.unstable,
        telemetryFile: args.telemetryFile,
    };
    let commandOptions;
    switch (args._[0]) {
        case 'list':
        case 'ls':
            commandOptions = {
                long: args.long,
                showDependencies: args.showDependencies,
                STACKS: args.STACKS,
            };
            break;
        case 'synth':
        case 'synthesize':
            commandOptions = {
                exclusively: args.exclusively,
                validation: args.validation,
                quiet: args.quiet,
                STACKS: args.STACKS,
            };
            break;
        case 'bootstrap':
            commandOptions = {
                bootstrapBucketName: args.bootstrapBucketName,
                bootstrapKmsKeyId: args.bootstrapKmsKeyId,
                examplePermissionsBoundary: args.examplePermissionsBoundary,
                customPermissionsBoundary: args.customPermissionsBoundary,
                bootstrapCustomerKey: args.bootstrapCustomerKey,
                qualifier: args.qualifier,
                publicAccessBlockConfiguration: args.publicAccessBlockConfiguration,
                denyExternalId: args.denyExternalId,
                tags: args.tags,
                execute: args.execute,
                trust: args.trust,
                trustForLookup: args.trustForLookup,
                untrust: args.untrust,
                cloudformationExecutionPolicies: args.cloudformationExecutionPolicies,
                force: args.force,
                terminationProtection: args.terminationProtection,
                showTemplate: args.showTemplate,
                toolkitStackName: args.toolkitStackName,
                template: args.template,
                previousParameters: args.previousParameters,
                ENVIRONMENTS: args.ENVIRONMENTS,
            };
            break;
        case 'gc':
            commandOptions = {
                action: args.action,
                type: args.type,
                rollbackBufferDays: args.rollbackBufferDays,
                createdBufferDays: args.createdBufferDays,
                confirm: args.confirm,
                toolkitStackName: args.toolkitStackName,
                bootstrapStackName: args.bootstrapStackName,
                ENVIRONMENTS: args.ENVIRONMENTS,
            };
            break;
        case 'flags':
            commandOptions = {
                value: args.value,
                set: args.set,
                all: args.all,
                unconfigured: args.unconfigured,
                recommended: args.recommended,
                default: args.default,
                interactive: args.interactive,
                safe: args.safe,
                concurrency: args.concurrency,
                FLAGNAME: args.FLAGNAME,
            };
            break;
        case 'deploy':
            commandOptions = {
                all: args.all,
                buildExclude: args.buildExclude,
                exclusively: args.exclusively,
                requireApproval: args.requireApproval,
                notificationArns: args.notificationArns,
                tags: args.tags,
                execute: args.execute,
                changeSetName: args.changeSetName,
                method: args.method,
                importExistingResources: args.importExistingResources,
                force: args.force,
                parameters: args.parameters,
                outputsFile: args.outputsFile,
                previousParameters: args.previousParameters,
                toolkitStackName: args.toolkitStackName,
                progress: args.progress,
                rollback: args.rollback,
                hotswap: args.hotswap,
                hotswapFallback: args.hotswapFallback,
                hotswapEcsMinimumHealthyPercent: args.hotswapEcsMinimumHealthyPercent,
                hotswapEcsMaximumHealthyPercent: args.hotswapEcsMaximumHealthyPercent,
                hotswapEcsStabilizationTimeoutSeconds: args.hotswapEcsStabilizationTimeoutSeconds,
                watch: args.watch,
                logs: args.logs,
                concurrency: args.concurrency,
                assetParallelism: args.assetParallelism,
                assetPrebuild: args.assetPrebuild,
                ignoreNoStacks: args.ignoreNoStacks,
                STACKS: args.STACKS,
            };
            break;
        case 'rollback':
            commandOptions = {
                all: args.all,
                toolkitStackName: args.toolkitStackName,
                force: args.force,
                validateBootstrapVersion: args.validateBootstrapVersion,
                orphan: args.orphan,
                STACKS: args.STACKS,
            };
            break;
        case 'import':
            commandOptions = {
                execute: args.execute,
                changeSetName: args.changeSetName,
                toolkitStackName: args.toolkitStackName,
                rollback: args.rollback,
                force: args.force,
                recordResourceMapping: args.recordResourceMapping,
                resourceMapping: args.resourceMapping,
                STACK: args.STACK,
            };
            break;
        case 'watch':
            commandOptions = {
                buildExclude: args.buildExclude,
                exclusively: args.exclusively,
                changeSetName: args.changeSetName,
                force: args.force,
                toolkitStackName: args.toolkitStackName,
                progress: args.progress,
                rollback: args.rollback,
                hotswap: args.hotswap,
                hotswapFallback: args.hotswapFallback,
                hotswapEcsMinimumHealthyPercent: args.hotswapEcsMinimumHealthyPercent,
                hotswapEcsMaximumHealthyPercent: args.hotswapEcsMaximumHealthyPercent,
                hotswapEcsStabilizationTimeoutSeconds: args.hotswapEcsStabilizationTimeoutSeconds,
                logs: args.logs,
                concurrency: args.concurrency,
                STACKS: args.STACKS,
            };
            break;
        case 'destroy':
            commandOptions = {
                all: args.all,
                exclusively: args.exclusively,
                force: args.force,
                STACKS: args.STACKS,
            };
            break;
        case 'diff':
            commandOptions = {
                exclusively: args.exclusively,
                contextLines: args.contextLines,
                template: args.template,
                strict: args.strict,
                securityOnly: args.securityOnly,
                fail: args.fail,
                processed: args.processed,
                quiet: args.quiet,
                changeSet: args.changeSet,
                importExistingResources: args.importExistingResources,
                includeMoves: args.includeMoves,
                STACKS: args.STACKS,
            };
            break;
        case 'drift':
            commandOptions = {
                fail: args.fail,
                STACKS: args.STACKS,
            };
            break;
        case 'metadata':
            commandOptions = {
                STACK: args.STACK,
            };
            break;
        case 'acknowledge':
        case 'ack':
            commandOptions = {
                ID: args.ID,
            };
            break;
        case 'notices':
            commandOptions = {
                unacknowledged: args.unacknowledged,
            };
            break;
        case 'init':
            commandOptions = {
                language: args.language,
                list: args.list,
                generateOnly: args.generateOnly,
                libVersion: args.libVersion,
                fromPath: args.fromPath,
                templatePath: args.templatePath,
                TEMPLATE: args.TEMPLATE,
            };
            break;
        case 'migrate':
            commandOptions = {
                stackName: args.stackName,
                language: args.language,
                account: args.account,
                region: args.region,
                fromPath: args.fromPath,
                fromStack: args.fromStack,
                outputPath: args.outputPath,
                fromScan: args.fromScan,
                filter: args.filter,
                compress: args.compress,
            };
            break;
        case 'context':
            commandOptions = {
                reset: args.reset,
                force: args.force,
                clear: args.clear,
            };
            break;
        case 'docs':
        case 'doc':
            commandOptions = {
                browser: args.browser,
            };
            break;
        case 'doctor':
            commandOptions = {};
            break;
        case 'refactor':
            commandOptions = {
                additionalStackName: args.additionalStackName,
                dryRun: args.dryRun,
                overrideFile: args.overrideFile,
                revert: args.revert,
                force: args.force,
                STACKS: args.STACKS,
            };
            break;
        case 'cli-telemetry':
            commandOptions = {
                enable: args.enable,
                disable: args.disable,
                status: args.status,
            };
            break;
    }
    const userInput = {
        command: args._[0],
        globalOptions,
        [args._[0]]: commandOptions,
    };
    return userInput;
}
// @ts-ignore TS6133
function convertConfigToUserInput(config) {
    const globalOptions = {
        app: config.app,
        build: config.build,
        context: config.context,
        plugin: config.plugin,
        trace: config.trace,
        strict: config.strict,
        lookups: config.lookups,
        ignoreErrors: config.ignoreErrors,
        json: config.json,
        verbose: config.verbose,
        debug: config.debug,
        profile: config.profile,
        proxy: config.proxy,
        caBundlePath: config.caBundlePath,
        ec2creds: config.ec2creds,
        versionReporting: config.versionReporting,
        pathMetadata: config.pathMetadata,
        assetMetadata: config.assetMetadata,
        roleArn: config.roleArn,
        staging: config.staging,
        output: config.output,
        notices: config.notices,
        noColor: config.noColor,
        ci: config.ci,
        unstable: config.unstable,
        telemetryFile: config.telemetryFile,
    };
    const listOptions = {
        long: config.list?.long,
        showDependencies: config.list?.showDependencies,
    };
    const synthOptions = {
        exclusively: config.synth?.exclusively,
        validation: config.synth?.validation,
        quiet: config.synth?.quiet,
    };
    const bootstrapOptions = {
        bootstrapBucketName: config.bootstrap?.bootstrapBucketName,
        bootstrapKmsKeyId: config.bootstrap?.bootstrapKmsKeyId,
        examplePermissionsBoundary: config.bootstrap?.examplePermissionsBoundary,
        customPermissionsBoundary: config.bootstrap?.customPermissionsBoundary,
        bootstrapCustomerKey: config.bootstrap?.bootstrapCustomerKey,
        qualifier: config.bootstrap?.qualifier,
        publicAccessBlockConfiguration: config.bootstrap?.publicAccessBlockConfiguration,
        denyExternalId: config.bootstrap?.denyExternalId,
        tags: config.bootstrap?.tags,
        execute: config.bootstrap?.execute,
        trust: config.bootstrap?.trust,
        trustForLookup: config.bootstrap?.trustForLookup,
        untrust: config.bootstrap?.untrust,
        cloudformationExecutionPolicies: config.bootstrap?.cloudformationExecutionPolicies,
        force: config.bootstrap?.force,
        terminationProtection: config.bootstrap?.terminationProtection,
        showTemplate: config.bootstrap?.showTemplate,
        toolkitStackName: config.bootstrap?.toolkitStackName,
        template: config.bootstrap?.template,
        previousParameters: config.bootstrap?.previousParameters,
    };
    const gcOptions = {
        action: config.gc?.action,
        type: config.gc?.type,
        rollbackBufferDays: config.gc?.rollbackBufferDays,
        createdBufferDays: config.gc?.createdBufferDays,
        confirm: config.gc?.confirm,
        toolkitStackName: config.gc?.toolkitStackName,
        bootstrapStackName: config.gc?.bootstrapStackName,
    };
    const flagsOptions = {
        value: config.flags?.value,
        set: config.flags?.set,
        all: config.flags?.all,
        unconfigured: config.flags?.unconfigured,
        recommended: config.flags?.recommended,
        default: config.flags?.default,
        interactive: config.flags?.interactive,
        safe: config.flags?.safe,
        concurrency: config.flags?.concurrency,
    };
    const deployOptions = {
        all: config.deploy?.all,
        buildExclude: config.deploy?.buildExclude,
        exclusively: config.deploy?.exclusively,
        requireApproval: config.deploy?.requireApproval,
        notificationArns: config.deploy?.notificationArns,
        tags: config.deploy?.tags,
        execute: config.deploy?.execute,
        changeSetName: config.deploy?.changeSetName,
        method: config.deploy?.method,
        importExistingResources: config.deploy?.importExistingResources,
        force: config.deploy?.force,
        parameters: config.deploy?.parameters,
        outputsFile: config.deploy?.outputsFile,
        previousParameters: config.deploy?.previousParameters,
        toolkitStackName: config.deploy?.toolkitStackName,
        progress: config.deploy?.progress,
        rollback: config.deploy?.rollback,
        hotswap: config.deploy?.hotswap,
        hotswapFallback: config.deploy?.hotswapFallback,
        hotswapEcsMinimumHealthyPercent: config.deploy?.hotswapEcsMinimumHealthyPercent,
        hotswapEcsMaximumHealthyPercent: config.deploy?.hotswapEcsMaximumHealthyPercent,
        hotswapEcsStabilizationTimeoutSeconds: config.deploy?.hotswapEcsStabilizationTimeoutSeconds,
        watch: config.deploy?.watch,
        logs: config.deploy?.logs,
        concurrency: config.deploy?.concurrency,
        assetParallelism: config.deploy?.assetParallelism,
        assetPrebuild: config.deploy?.assetPrebuild,
        ignoreNoStacks: config.deploy?.ignoreNoStacks,
    };
    const rollbackOptions = {
        all: config.rollback?.all,
        toolkitStackName: config.rollback?.toolkitStackName,
        force: config.rollback?.force,
        validateBootstrapVersion: config.rollback?.validateBootstrapVersion,
        orphan: config.rollback?.orphan,
    };
    const importOptions = {
        execute: config.import?.execute,
        changeSetName: config.import?.changeSetName,
        toolkitStackName: config.import?.toolkitStackName,
        rollback: config.import?.rollback,
        force: config.import?.force,
        recordResourceMapping: config.import?.recordResourceMapping,
        resourceMapping: config.import?.resourceMapping,
    };
    const watchOptions = {
        buildExclude: config.watch?.buildExclude,
        exclusively: config.watch?.exclusively,
        changeSetName: config.watch?.changeSetName,
        force: config.watch?.force,
        toolkitStackName: config.watch?.toolkitStackName,
        progress: config.watch?.progress,
        rollback: config.watch?.rollback,
        hotswap: config.watch?.hotswap,
        hotswapFallback: config.watch?.hotswapFallback,
        hotswapEcsMinimumHealthyPercent: config.watch?.hotswapEcsMinimumHealthyPercent,
        hotswapEcsMaximumHealthyPercent: config.watch?.hotswapEcsMaximumHealthyPercent,
        hotswapEcsStabilizationTimeoutSeconds: config.watch?.hotswapEcsStabilizationTimeoutSeconds,
        logs: config.watch?.logs,
        concurrency: config.watch?.concurrency,
    };
    const destroyOptions = {
        all: config.destroy?.all,
        exclusively: config.destroy?.exclusively,
        force: config.destroy?.force,
    };
    const diffOptions = {
        exclusively: config.diff?.exclusively,
        contextLines: config.diff?.contextLines,
        template: config.diff?.template,
        strict: config.diff?.strict,
        securityOnly: config.diff?.securityOnly,
        fail: config.diff?.fail,
        processed: config.diff?.processed,
        quiet: config.diff?.quiet,
        changeSet: config.diff?.changeSet,
        importExistingResources: config.diff?.importExistingResources,
        includeMoves: config.diff?.includeMoves,
    };
    const driftOptions = {
        fail: config.drift?.fail,
    };
    const metadataOptions = {};
    const acknowledgeOptions = {};
    const noticesOptions = {
        unacknowledged: config.notices?.unacknowledged,
    };
    const initOptions = {
        language: config.init?.language,
        list: config.init?.list,
        generateOnly: config.init?.generateOnly,
        libVersion: config.init?.libVersion,
        fromPath: config.init?.fromPath,
        templatePath: config.init?.templatePath,
    };
    const migrateOptions = {
        stackName: config.migrate?.stackName,
        language: config.migrate?.language,
        account: config.migrate?.account,
        region: config.migrate?.region,
        fromPath: config.migrate?.fromPath,
        fromStack: config.migrate?.fromStack,
        outputPath: config.migrate?.outputPath,
        fromScan: config.migrate?.fromScan,
        filter: config.migrate?.filter,
        compress: config.migrate?.compress,
    };
    const contextOptions = {
        reset: config.context?.reset,
        force: config.context?.force,
        clear: config.context?.clear,
    };
    const docsOptions = {
        browser: config.docs?.browser,
    };
    const doctorOptions = {};
    const refactorOptions = {
        additionalStackName: config.refactor?.additionalStackName,
        dryRun: config.refactor?.dryRun,
        overrideFile: config.refactor?.overrideFile,
        revert: config.refactor?.revert,
        force: config.refactor?.force,
    };
    const cliTelemetryOptions = {
        enable: config.cliTelemetry?.enable,
        disable: config.cliTelemetry?.disable,
        status: config.cliTelemetry?.status,
    };
    const userInput = {
        globalOptions,
        list: listOptions,
        synth: synthOptions,
        bootstrap: bootstrapOptions,
        gc: gcOptions,
        flags: flagsOptions,
        deploy: deployOptions,
        rollback: rollbackOptions,
        import: importOptions,
        watch: watchOptions,
        destroy: destroyOptions,
        diff: diffOptions,
        drift: driftOptions,
        metadata: metadataOptions,
        acknowledge: acknowledgeOptions,
        notices: noticesOptions,
        init: initOptions,
        migrate: migrateOptions,
        context: contextOptions,
        docs: docsOptions,
        doctor: doctorOptions,
        refactor: refactorOptions,
        cliTelemetry: cliTelemetryOptions,
    };
    return userInput;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udmVydC10by11c2VyLWlucHV0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY29udmVydC10by11c2VyLWlucHV0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBU0EsMERBa1RDO0FBR0QsNERBNE9DO0FBbGlCRCxvQkFBb0I7QUFDcEIsU0FBZ0IsdUJBQXVCLENBQUMsSUFBUztJQUMvQyxNQUFNLGFBQWEsR0FBa0I7UUFDbkMsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO1FBQ2IsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO1FBQ2pCLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztRQUNyQixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07UUFDbkIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO1FBQ2pCLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtRQUNuQixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87UUFDckIsWUFBWSxFQUFFLElBQUksQ0FBQyxZQUFZO1FBQy9CLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtRQUNmLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztRQUNyQixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7UUFDakIsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1FBQ3JCLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztRQUNqQixZQUFZLEVBQUUsSUFBSSxDQUFDLFlBQVk7UUFDL0IsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1FBQ3ZCLGdCQUFnQixFQUFFLElBQUksQ0FBQyxnQkFBZ0I7UUFDdkMsWUFBWSxFQUFFLElBQUksQ0FBQyxZQUFZO1FBQy9CLGFBQWEsRUFBRSxJQUFJLENBQUMsYUFBYTtRQUNqQyxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87UUFDckIsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1FBQ3JCLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtRQUNuQixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87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Q3ZCLElBQUksRUFBRSxXQUFXO1FBQ2pCLE9BQU8sRUFBRSxjQUFjO1FBQ3ZCLE9BQU8sRUFBRSxjQUFjO1FBQ3ZCLElBQUksRUFBRSxXQUFXO1FBQ2pCLE1BQU0sRUFBRSxhQUFhO1FBQ3JCLFFBQVEsRUFBRSxlQUFlO1FBQ3pCLFlBQVksRUFBRSxtQkFBbUI7S0FDbEMsQ0FBQztJQUVGLE9BQU8sU0FBUyxDQUFDO0FBQ25CLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBHRU5FUkFURUQgRlJPTSBwYWNrYWdlcy9hd3MtY2RrL2xpYi9jbGkvY2xpLWNvbmZpZy50cy5cbi8vIERvIG5vdCBlZGl0IGJ5IGhhbmQ7IGFsbCBjaGFuZ2VzIHdpbGwgYmUgb3ZlcndyaXR0ZW4gYXQgYnVpbGQgdGltZSBmcm9tIHRoZSBjb25maWcgZmlsZS5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8qIGVzbGludC1kaXNhYmxlIEBzdHlsaXN0aWMvbWF4LWxlbiwgQHR5cGVzY3JpcHQtZXNsaW50L2NvbnNpc3RlbnQtdHlwZS1pbXBvcnRzICovXG5pbXBvcnQgeyBDb21tYW5kIH0gZnJvbSAnLi91c2VyLWNvbmZpZ3VyYXRpb24nO1xuaW1wb3J0IHsgVXNlcklucHV0LCBHbG9iYWxPcHRpb25zIH0gZnJvbSAnLi91c2VyLWlucHV0JztcblxuLy8gQHRzLWlnbm9yZSBUUzYxMzNcbmV4cG9ydCBmdW5jdGlvbiBjb252ZXJ0WWFyZ3NUb1VzZXJJbnB1dChhcmdzOiBhbnkpOiBVc2VySW5wdXQge1xuICBjb25zdCBnbG9iYWxPcHRpb25zOiBHbG9iYWxPcHRpb25zID0ge1xuICAgIGFwcDogYXJncy5hcHAsXG4gICAgYnVpbGQ6IGFyZ3MuYnVpbGQsXG4gICAgY29udGV4dDogYXJncy5jb250ZXh0LFxuICAgIHBsdWdpbjogYXJncy5wbHVnaW4sXG4gICAgdHJhY2U6IGFyZ3MudHJhY2UsXG4gICAgc3RyaWN0OiBhcmdzLnN0cmljdCxcbiAgICBsb29rdXBzOiBhcmdzLmxvb2t1cHMsXG4gICAgaWdub3JlRXJyb3JzOiBhcmdzLmlnbm9yZUVycm9ycyxcbiAgICBqc29uOiBhcmdzLmpzb24sXG4gICAgdmVyYm9zZTogYXJncy52ZXJib3NlLFxuICAgIGRlYnVnOiBhcmdzLmRlYnVnLFxuICAgIHByb2ZpbGU6IGFyZ3MucHJvZmlsZSxcbiAgICBwcm94eTogYXJncy5wcm94eSxcbiAgICBjYUJ1bmRsZVBhdGg6IGFyZ3MuY2FCdW5kbGVQYXRoLFxuICAgIGVjMmNyZWRzOiBhcmdzLmVjMmNyZWRzLFxuICAgIHZlcnNpb25SZXBvcnRpbmc6IGFyZ3MudmVyc2lvblJlcG9ydGluZyxcbiAgICBwYXRoTWV0YWRhdGE6IGFyZ3MucGF0aE1ldGFkYXRhLFxuICAgIGFzc2V0TWV0YWRhdGE6IGFyZ3MuYXNzZXRNZXRhZGF0YSxcbiAgICByb2xlQXJuOiBhcmdzLnJvbGVBcm4sXG4gICAgc3RhZ2luZzogYXJncy5zdGFnaW5nLFxuICAgIG91dHB1dDogYXJncy5vdXRwdXQsXG4gICAgbm90aWNlczogYXJncy5ub3RpY2VzLFxuICAgIG5vQ29sb3I6IGFyZ3Mubm9Db2xvcixcbiAgICBjaTogYXJncy5jaSxcbiAgICB1bnN0YWJsZTogYXJncy51bnN0YWJsZSxcbiAgICB0ZWxlbWV0cnlGaWxlOiBhcmdzLnRlbGVtZXRyeUZpbGUsXG4gIH07XG4gIGxldCBjb21tYW5kT3B0aW9ucztcbiAgc3dpdGNoIChhcmdzLl9bMF0gYXMgQ29tbWFuZCkge1xuICAgIGNhc2UgJ2xpc3QnOlxuICAgIGNhc2UgJ2xzJzpcbiAgICAgIGNvbW1hbmRPcHRpb25zID0ge1xuICAgICAgICBsb25nOiBhcmdzLmxvbmcsXG4gICAgICAgIHNob3dEZXBlbmRlbmNpZXM6IGFyZ3Muc2hvd0RlcGVuZGVuY2llcyxcbiAgICAgICAgU1RBQ0tTOiBhcmdzLlNUQUNLUyxcbiAgICAgIH07XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgJ3N5bnRoJzpcbiAgICBjYXNlICdzeW50aGVzaXplJzpcbiAgICAgIGNvbW1hbmRPcHRpb25zID0ge1xuICAgICAgICBleGNsdXNpdmVseTogYXJncy5leGNsdXNpdmVseSxcbiAgICAgICAgdmFsaWRhdGlvbjogYXJncy52YWxpZGF0aW9uLFxuICAgICAgICBxdWlldDogYXJncy5xdWlldCxcbiAgICAgICAgU1RBQ0tTOiBhcmdzLlNUQUNLUyxcbiAgICAgIH07XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgJ2Jvb3RzdHJhcCc6XG4gICAgICBjb21tYW5kT3B0aW9ucyA9IHtcbiAgICAgICAgYm9vdHN0cmFwQnVja2V0TmFtZTogYXJncy5ib290c3RyYXBCdWNrZXROYW1lLFxuICAgICAgICBib290c3RyYXBLbXNLZXlJZDogYXJncy5ib290c3RyYXBLbXNLZXlJZCxcbiAgICAgICAgZXhhbXBsZVBlcm1pc3Npb25zQm91bmRhcnk6IGFyZ3MuZXhhbXBsZVBlcm1pc3Npb25zQm91bmRhcnksXG4gICAgICAgIGN1c3RvbVBlcm1pc3Npb25zQm91bmRhcnk6IGFyZ3MuY3VzdG9tUGVybWlzc2lvbnNCb3VuZGFyeSxcbiAgICAgICAgYm9vdHN0cmFwQ3VzdG9tZXJLZXk6IGFyZ3MuYm9vdHN0cmFwQ3VzdG9tZXJLZXksXG4gICAgICAgIHF1YWxpZmllcjogYXJncy5xdWFsaWZpZXIsXG4gICAgICAgIHB1YmxpY0FjY2Vzc0Jsb2NrQ29uZmlndXJhdGlvbjogYXJncy5wdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb24sXG4gICAgICAgIGRlbnlFeHRlcm5hbElkOiBhcmdzLmRlbnlFeHRlcm5hbElkLFxuICAgICAgICB0YWdzOiBhcmdzLnRhZ3MsXG4gICAgICAgIGV4ZWN1dGU6IGFyZ3MuZXhlY3V0ZSxcbiAgICAgICAgdHJ1c3Q6IGFyZ3MudHJ1c3QsXG4gICAgICAgIHRydXN0Rm9yTG9va3VwOiBhcmdzLnRydXN0Rm9yTG9va3VwLFxuICAgICAgICB1bnRydXN0OiBhcmdzLnVudHJ1c3QsXG4gICAgICAgIGNsb3VkZm9ybWF0aW9uRXhlY3V0aW9uUG9saWNpZXM6IGFyZ3MuY2xvdWRmb3JtYXRpb25FeGVjdXRpb25Qb2xpY2llcyxcbiAgICAgICAgZm9yY2U6IGFyZ3MuZm9yY2UsXG4gICAgICAgIHRlcm1pbmF0aW9uUHJvdGVjdGlvbjogYXJncy50ZXJtaW5hdGlvblByb3RlY3Rpb24sXG4gICAgICAgIHNob3dUZW1wbGF0ZTogYXJncy5zaG93VGVtcGxhdGUsXG4gICAgICAgIHRvb2xraXRTdGFja05hbWU6IGFyZ3MudG9vbGtpdFN0YWNrTmFtZSxcbiAgICAgICAgdGVtcGxhdGU6IGFyZ3MudGVtcGxhdGUsXG4gICAgICAgIHByZXZpb3VzUGFyYW1ldGVyczogYXJncy5wcmV2aW91c1BhcmFtZXRlcnMsXG4gICAgICAgIEVOVklST05NRU5UUzogYXJncy5FTlZJUk9OTUVOVFMsXG4gICAgICB9O1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlICdnYyc6XG4gICAgICBjb21tYW5kT3B0aW9ucyA9IHtcbiAgICAgICAgYWN0aW9uOiBhcmdzLmFjdGlvbixcbiAgICAgICAgdHlwZTogYXJncy50eXBlLFxuICAgICAgICByb2xsYmFja0J1ZmZlckRheXM6IGFyZ3Mucm9sbGJhY2tCdWZmZXJEYXlzLFxuICAgICAgICBjcmVhdGVkQnVmZmVyRGF5czogYXJncy5jcmVhdGVkQnVmZmVyRGF5cyxcbiAgICAgICAgY29uZmlybTogYXJncy5jb25maXJtLFxuICAgICAgICB0b29sa2l0U3RhY2tOYW1lOiBhcmdzLnRvb2xraXRTdGFja05hbWUsXG4gICAgICAgIGJvb3RzdHJhcFN0YWNrTmFtZTogYXJncy5ib290c3RyYXBTdGFja05hbWUsXG4gICAgICAgIEVOVklST05NRU5UUzogYXJncy5FTlZJUk9OTUVOVFMsXG4gICAgICB9O1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlICdmbGFncyc6XG4gICAgICBjb21tYW5kT3B0aW9ucyA9IHtcbiAgICAgICAgdmFsdWU6IGFyZ3MudmFsdWUsXG4gICAgICAgIHNldDogYXJncy5zZXQsXG4gICAgICAgIGFsbDogYXJncy5hbGwsXG4gICAgICAgIHVuY29uZmlndXJlZDogYXJncy51bmNvbmZpZ3VyZWQsXG4gICAgICAgIHJlY29tbWVuZGVkOiBhcmdzLnJlY29tbWVuZGVkLFxuICAgICAgICBkZWZhdWx0OiBhcmdzLmRlZmF1bHQsXG4gICAgICAgIGludGVyYWN0aXZlOiBhcmdzLmludGVyYWN0aXZlLFxuICAgICAgICBzYWZlOiBhcmdzLnNhZmUsXG4gICAgICAgIGNvbmN1cnJlbmN5OiBhcmdzLmNvbmN1cnJlbmN5LFxuICAgICAgICBGTEFHTkFNRTogYXJncy5GTEFHTkFNRSxcbiAgICAgIH07XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgJ2RlcGxveSc6XG4gICAgICBjb21tYW5kT3B0aW9ucyA9IHtcbiAgICAgICAgYWxsOiBhcmdzLmFsbCxcbiAgICAgICAgYnVpbGRFeGNsdWRlOiBhcmdzLmJ1aWxkRXhjbHVkZSxcbiAgICAgICAgZXhjbHVzaXZlbHk6IGFyZ3MuZXhjbHVzaXZlbHksXG4gICAgICAgIHJlcXVpcmVBcHByb3ZhbDogYXJncy5yZXF1aXJlQXBwcm92YWwsXG4gICAgICAgIG5vdGlmaWNhdGlvbkFybnM6IGFyZ3Mubm90aWZpY2F0aW9uQXJucyxcbiAgICAgICAgdGFnczogYXJncy50YWdzLFxuICAgICAgICBleGVjdXRlOiBhcmdzLmV4ZWN1dGUsXG4gICAgICAgIGNoYW5nZVNldE5hbWU6IGFyZ3MuY2hhbmdlU2V0TmFtZSxcbiAgICAgICAgbWV0aG9kOiBhcmdzLm1ldGhvZCxcbiAgICAgICAgaW1wb3J0RXhpc3RpbmdSZXNvdXJjZXM6IGFyZ3MuaW1wb3J0RXhpc3RpbmdSZXNvdXJjZXMsXG4gICAgICAgIGZvcmNlOiBhcmdzLmZvcmNlLFxuICAgICAgICBwYXJhbWV0ZXJzOiBhcmdzLnBhcmFtZXRlcnMsXG4gICAgICAgIG91dHB1dHNGaWxlOiBhcmdzLm91dHB1dHNGaWxlLFxuICAgICAgICBwcmV2aW91c1BhcmFtZXRlcnM6IGFyZ3MucHJldmlvdXNQYXJhbWV0ZXJzLFxuICAgICAgICB0b29sa2l0U3RhY2tOYW1lOiBhcmdzLnRvb2xraXRTdGFja05hbWUsXG4gICAgICAgIHByb2dyZXNzOiBhcmdzLnByb2dyZXNzLFxuICAgICAgICByb2xsYmFjazogYXJncy5yb2xsYmFjayxcbiAgICAgICAgaG90c3dhcDogYXJncy5ob3Rzd2FwLFxuICAgICAgICBob3Rzd2FwRmFsbGJhY2s6IGFyZ3MuaG90c3dhcEZhbGxiYWNrLFxuICAgICAgICBob3Rzd2FwRWNzTWluaW11bUhlYWx0aHlQZXJjZW50OiBhcmdzLmhvdHN3YXBFY3NNaW5pbXVtSGVhbHRoeVBlcmNlbnQsXG4gICAgICAgIGhvdHN3YXBFY3NNYXhpbXVtSGVhbHRoeVBlcmNlbnQ6IGFyZ3MuaG90c3dhcEVjc01heGltdW1IZWFsdGh5UGVyY2VudCxcbiAgICAgICAgaG90c3dhcEVjc1N0YWJpbGl6YXRpb25UaW1lb3V0U2Vjb25kczogYXJncy5ob3Rzd2FwRWNzU3RhYmlsaXphdGlvblRpbWVvdXRTZWNvbmRzLFxuICAgICAgICB3YXRjaDogYXJncy53YXRjaCxcbiAgICAgICAgbG9nczogYXJncy5sb2dzLFxuICAgICAgICBjb25jdXJyZW5jeTogYXJncy5jb25jdXJyZW5jeSxcbiAgICAgICAgYXNzZXRQYXJhbGxlbGlzbTogYXJncy5hc3NldFBhcmFsbGVsaXNtLFxuICAgICAgICBhc3NldFByZWJ1aWxkOiBhcmdzLmFzc2V0UHJlYnVpbGQsXG4gICAgICAgIGlnbm9yZU5vU3RhY2tzOiBhcmdzLmlnbm9yZU5vU3RhY2tzLFxuICAgICAgICBTVEFDS1M6IGFyZ3MuU1RBQ0tTLFxuICAgICAgfTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSAncm9sbGJhY2snOlxuICAgICAgY29tbWFuZE9wdGlvbnMgPSB7XG4gICAgICAgIGFsbDogYXJncy5hbGwsXG4gICAgICAgIHRvb2xraXRTdGFja05hbWU6IGFyZ3MudG9vbGtpdFN0YWNrTmFtZSxcbiAgICAgICAgZm9yY2U6IGFyZ3MuZm9yY2UsXG4gICAgICAgIHZhbGlkYXRlQm9vdHN0cmFwVmVyc2lvbjogYXJncy52YWxpZGF0ZUJvb3RzdHJhcFZlcnNpb24sXG4gICAgICAgIG9ycGhhbjogYXJncy5vcnBoYW4sXG4gICAgICAgIFNUQUNLUzogYXJncy5TVEFDS1MsXG4gICAgICB9O1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlICdpbXBvcnQnOlxuICAgICAgY29tbWFuZE9wdGlvbnMgPSB7XG4gICAgICAgIGV4ZWN1dGU6IGFyZ3MuZXhlY3V0ZSxcbiAgICAgICAgY2hhbmdlU2V0TmFtZTogYXJncy5jaGFuZ2VTZXROYW1lLFxuICAgICAgICB0b29sa2l0U3RhY2tOYW1lOiBhcmdzLnRvb2xraXRTdGFja05hbWUsXG4gICAgICAgIHJvbGxiYWNrOiBhcmdzLnJvbGxiYWNrLFxuICAgICAgICBmb3JjZTogYXJncy5mb3JjZSxcbiAgICAgICAgcmVjb3JkUmVzb3VyY2VNYXBwaW5nOiBhcmdzLnJlY29yZFJlc291cmNlTWFwcGluZyxcbiAgICAgICAgcmVzb3VyY2VNYXBwaW5nOiBhcmdzLnJlc291cmNlTWFwcGluZyxcbiAgICAgICAgU1RBQ0s6IGFyZ3MuU1RBQ0ssXG4gICAgICB9O1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlICd3YXRjaCc6XG4gICAgICBjb21tYW5kT3B0aW9ucyA9IHtcbiAgICAgICAgYnVpbGRFeGNsdWRlOiBhcmdzLmJ1aWxkRXhjbHVkZSxcbiAgICAgICAgZXhjbHVzaXZlbHk6IGFyZ3MuZXhjbHVzaXZlbHksXG4gICAgICAgIGNoYW5nZVNldE5hbWU6IGFyZ3MuY2hhbmdlU2V0TmFtZSxcbiAgICAgICAgZm9yY2U6IGFyZ3MuZm9yY2UsXG4gICAgICAgIHRvb2xraXRTdGFja05hbWU6IGFyZ3MudG9vbGtpdFN0YWNrTmFtZSxcbiAgICAgICAgcHJvZ3Jlc3M6IGFyZ3MucHJvZ3Jlc3MsXG4gICAgICAgIHJvbGxiYWNrOiBhcmdzLnJvbGxiYWNrLFxuICAgICAgICBob3Rzd2FwOiBhcmdzLmhvdHN3YXAsXG4gICAgICAgIGhvdHN3YXBGYWxsYmFjazogYXJncy5ob3Rzd2FwRmFsbGJhY2ssXG4gICAgICAgIGhvdHN3YXBFY3NNaW5pbXVtSGVhbHRoeVBlcmNlbnQ6IGFyZ3MuaG90c3dhcEVjc01pbmltdW1IZWFsdGh5UGVyY2VudCxcbiAgICAgICAgaG90c3dhcEVjc01heGltdW1IZWFsdGh5UGVyY2VudDogYXJncy5ob3Rzd2FwRWNzTWF4aW11bUhlYWx0aHlQZXJjZW50LFxuICAgICAgICBob3Rzd2FwRWNzU3RhYmlsaXphdGlvblRpbWVvdXRTZWNvbmRzOiBhcmdzLmhvdHN3YXBFY3NTdGFiaWxpemF0aW9uVGltZW91dFNlY29uZHMsXG4gICAgICAgIGxvZ3M6IGFyZ3MubG9ncyxcbiAgICAgICAgY29uY3VycmVuY3k6IGFyZ3MuY29uY3VycmVuY3ksXG4gICAgICAgIFNUQUNLUzogYXJncy5TVEFDS1MsXG4gICAgICB9O1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlICdkZXN0cm95JzpcbiAgICAgIGNvbW1hbmRPcHRpb25zID0ge1xuICAgICAgICBhbGw6IGFyZ3MuYWxsLFxuICAgICAgICBleGNsdXNpdmVseTogYXJncy5leGNsdXNpdmVseSxcbiAgICAgICAgZm9yY2U6IGFyZ3MuZm9yY2UsXG4gICAgICAgIFNUQUNLUzogYXJncy5TVEFDS1MsXG4gICAgICB9O1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlICdkaWZmJzpcbiAgICAgIGNvbW1hbmRPcHRpb25zID0ge1xuICAgICAgICBleGNsdXNpdmVseTogYXJncy5leGNsdXNpdmVseSxcbiAgICAgICAgY29udGV4dExpbmVzOiBhcmdzLmNvbnRleHRMaW5lcyxcbiAgICAgICAgdGVtcGxhdGU6IGFyZ3MudGVtcGxhdGUsXG4gICAgICAgIHN0cmljdDogYXJncy5zdHJpY3QsXG4gICAgICAgIHNlY3VyaXR5T25seTogYXJncy5zZWN1cml0eU9ubHksXG4gICAgICAgIGZhaWw6IGFyZ3MuZmFpbCxcbiAgICAgICAgcHJvY2Vzc2VkOiBhcmdzLnByb2Nlc3NlZCxcbiAgICAgICAgcXVpZXQ6IGFyZ3MucXVpZXQsXG4gICAgICAgIGNoYW5nZVNldDogYXJncy5jaGFuZ2VTZXQsXG4gICAgICAgIGltcG9ydEV4aXN0aW5nUmVzb3VyY2VzOiBhcmdzLmltcG9ydEV4aXN0aW5nUmVzb3VyY2VzLFxuICAgICAgICBpbmNsdWRlTW92ZXM6IGFyZ3MuaW5jbHVkZU1vdmVzLFxuICAgICAgICBTVEFDS1M6IGFyZ3MuU1RBQ0tTLFxuICAgICAgfTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSAnZHJpZnQnOlxuICAgICAgY29tbWFuZE9wdGlvbnMgPSB7XG4gICAgICAgIGZhaWw6IGFyZ3MuZmFpbCxcbiAgICAgICAgU1RBQ0tTOiBhcmdzLlNUQUNLUyxcbiAgICAgIH07XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgJ21ldGFkYXRhJzpcbiAgICAgIGNvbW1hbmRPcHRpb25zID0ge1xuICAgICAgICBTVEFDSzogYXJncy5TVEFDSyxcbiAgICAgIH07XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgJ2Fja25vd2xlZGdlJzpcbiAgICBjYXNlICdhY2snOlxuICAgICAgY29tbWFuZE9wdGlvbnMgPSB7XG4gICAgICAgIElEOiBhcmdzLklELFxuICAgICAgfTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSAnbm90aWNlcyc6XG4gICAgICBjb21tYW5kT3B0aW9ucyA9IHtcbiAgICAgICAgdW5hY2tub3dsZWRnZWQ6IGFyZ3MudW5hY2tub3dsZWRnZWQsXG4gICAgICB9O1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlICdpbml0JzpcbiAgICAgIGNvbW1hbmRPcHRpb25zID0ge1xuICAgICAgICBsYW5ndWFnZTogYXJncy5sYW5ndWFnZSxcbiAgICAgICAgbGlzdDogYXJncy5saXN0LFxuICAgICAgICBnZW5lcmF0ZU9ubHk6IGFyZ3MuZ2VuZXJhdGVPbmx5LFxuICAgICAgICBsaWJWZXJzaW9uOiBhcmdzLmxpYlZlcnNpb24sXG4gICAgICAgIGZyb21QYXRoOiBhcmdzLmZyb21QYXRoLFxuICAgICAgICB0ZW1wbGF0ZVBhdGg6IGFyZ3MudGVtcGxhdGVQYXRoLFxuICAgICAgICBURU1QTEFURTogYXJncy5URU1QTEFURSxcbiAgICAgIH07XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgJ21pZ3JhdGUnOlxuICAgICAgY29tbWFuZE9wdGlvbnMgPSB7XG4gICAgICAgIHN0YWNrTmFtZTogYXJncy5zdGFja05hbWUsXG4gICAgICAgIGxhbmd1YWdlOiBhcmdzLmxhbmd1YWdlLFxuICAgICAgICBhY2NvdW50OiBhcmdzLmFjY291bnQsXG4gICAgICAgIHJlZ2lvbjogYXJncy5yZWdpb24sXG4gICAgICAgIGZyb21QYXRoOiBhcmdzLmZyb21QYXRoLFxuICAgICAgICBmcm9tU3RhY2s6IGFyZ3MuZnJvbVN0YWNrLFxuICAgICAgICBvdXRwdXRQYXRoOiBhcmdzLm91dHB1dFBhdGgsXG4gICAgICAgIGZyb21TY2FuOiBhcmdzLmZyb21TY2FuLFxuICAgICAgICBmaWx0ZXI6IGFyZ3MuZmlsdGVyLFxuICAgICAgICBjb21wcmVzczogYXJncy5jb21wcmVzcyxcbiAgICAgIH07XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgJ2NvbnRleHQnOlxuICAgICAgY29tbWFuZE9wdGlvbnMgPSB7XG4gICAgICAgIHJlc2V0OiBhcmdzLnJlc2V0LFxuICAgICAgICBmb3JjZTogYXJncy5mb3JjZSxcbiAgICAgICAgY2xlYXI6IGFyZ3MuY2xlYXIsXG4gICAgICB9O1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlICdkb2NzJzpcbiAgICBjYXNlICdkb2MnOlxuICAgICAgY29tbWFuZE9wdGlvbnMgPSB7XG4gICAgICAgIGJyb3dzZXI6IGFyZ3MuYnJvd3NlcixcbiAgICAgIH07XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgJ2RvY3Rvcic6XG4gICAgICBjb21tYW5kT3B0aW9ucyA9IHt9O1xuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlICdyZWZhY3Rvcic6XG4gICAgICBjb21tYW5kT3B0aW9ucyA9IHtcbiAgICAgICAgYWRkaXRpb25hbFN0YWNrTmFtZTogYXJncy5hZGRpdGlvbmFsU3RhY2tOYW1lLFxuICAgICAgICBkcnlSdW46IGFyZ3MuZHJ5UnVuLFxuICAgICAgICBvdmVycmlkZUZpbGU6IGFyZ3Mub3ZlcnJpZGVGaWxlLFxuICAgICAgICByZXZlcnQ6IGFyZ3MucmV2ZXJ0LFxuICAgICAgICBmb3JjZTogYXJncy5mb3JjZSxcbiAgICAgICAgU1RBQ0tTOiBhcmdzLlNUQUNLUyxcbiAgICAgIH07XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgJ2NsaS10ZWxlbWV0cnknOlxuICAgICAgY29tbWFuZE9wdGlvbnMgPSB7XG4gICAgICAgIGVuYWJsZTogYXJncy5lbmFibGUsXG4gICAgICAgIGRpc2FibGU6IGFyZ3MuZGlzYWJsZSxcbiAgICAgICAgc3RhdHVzOiBhcmdzLnN0YXR1cyxcbiAgICAgIH07XG4gICAgICBicmVhaztcbiAgfVxuICBjb25zdCB1c2VySW5wdXQ6IFVzZXJJbnB1dCA9IHtcbiAgICBjb21tYW5kOiBhcmdzLl9bMF0sXG4gICAgZ2xvYmFsT3B0aW9ucyxcbiAgICBbYXJncy5fWzBdXTogY29tbWFuZE9wdGlvbnMsXG4gIH07XG5cbiAgcmV0dXJuIHVzZXJJbnB1dDtcbn1cblxuLy8gQHRzLWlnbm9yZSBUUzYxMzNcbmV4cG9ydCBmdW5jdGlvbiBjb252ZXJ0Q29uZmlnVG9Vc2VySW5wdXQoY29uZmlnOiBhbnkpOiBVc2VySW5wdXQge1xuICBjb25zdCBnbG9iYWxPcHRpb25zOiBHbG9iYWxPcHRpb25zID0ge1xuICAgIGFwcDogY29uZmlnLmFwcCxcbiAgICBidWlsZDogY29uZmlnLmJ1aWxkLFxuICAgIGNvbnRleHQ6IGNvbmZpZy5jb250ZXh0LFxuICAgIHBsdWdpbjogY29uZmlnLnBsdWdpbixcbiAgICB0cmFjZTogY29uZmlnLnRyYWNlLFxuICAgIHN0cmljdDogY29uZmlnLnN0cmljdCxcbiAgICBsb29rdXBzOiBjb25maWcubG9va3VwcyxcbiAgICBpZ25vcmVFcnJvcnM6IGNvbmZpZy5pZ25vcmVFcnJvcnMsXG4gICAganNvbjogY29uZmlnLmpzb24sXG4gICAgdmVyYm9zZTogY29uZmlnLnZlcmJvc2UsXG4gICAgZGVidWc6IGNvbmZpZy5kZWJ1ZyxcbiAgICBwcm9maWxlOiBjb25maWcucHJvZmlsZSxcbiAgICBwcm94eTogY29uZmlnLnByb3h5LFxuICAgIGNhQnVuZGxlUGF0aDogY29uZmlnLmNhQnVuZGxlUGF0aCxcbiAgICBlYzJjcmVkczogY29uZmlnLmVjMmNyZWRzLFxuICAgIHZlcnNpb25SZXBvcnRpbmc6IGNvbmZpZy52ZXJzaW9uUmVwb3J0aW5nLFxuICAgIHBhdGhNZXRhZGF0YTogY29uZmlnLnBhdGhNZXRhZGF0YSxcbiAgICBhc3NldE1ldGFkYXRhOiBjb25maWcuYXNzZXRNZXRhZGF0YSxcbiAgICByb2xlQXJuOiBjb25maWcucm9sZUFybixcbiAgICBzdGFnaW5nOiBjb25maWcuc3RhZ2luZyxcbiAgICBvdXRwdXQ6IGNvbmZpZy5vdXRwdXQsXG4gICAgbm90aWNlczogY29uZmlnLm5vdGljZXMsXG4gICAgbm9Db2xvcjogY29uZmlnLm5vQ29sb3IsXG4gICAgY2k6IGNvbmZpZy5jaSxcbiAgICB1bnN0YWJsZTogY29uZmlnLnVuc3RhYmxlLFxuICAgIHRlbGVtZXRyeUZpbGU6IGNvbmZpZy50ZWxlbWV0cnlGaWxlLFxuICB9O1xuICBjb25zdCBsaXN0T3B0aW9ucyA9IHtcbiAgICBsb25nOiBjb25maWcubGlzdD8ubG9uZyxcbiAgICBzaG93RGVwZW5kZW5jaWVzOiBjb25maWcubGlzdD8uc2hvd0RlcGVuZGVuY2llcyxcbiAgfTtcbiAgY29uc3Qgc3ludGhPcHRpb25zID0ge1xuICAgIGV4Y2x1c2l2ZWx5OiBjb25maWcuc3ludGg/LmV4Y2x1c2l2ZWx5LFxuICAgIHZhbGlkYXRpb246IGNvbmZpZy5zeW50aD8udmFsaWRhdGlvbixcbiAgICBxdWlldDogY29uZmlnLnN5bnRoPy5xdWlldCxcbiAgfTtcbiAgY29uc3QgYm9vdHN0cmFwT3B0aW9ucyA9IHtcbiAgICBib290c3RyYXBCdWNrZXROYW1lOiBjb25maWcuYm9vdHN0cmFwPy5ib290c3RyYXBCdWNrZXROYW1lLFxuICAgIGJvb3RzdHJhcEttc0tleUlkOiBjb25maWcuYm9vdHN0cmFwPy5ib290c3RyYXBLbXNLZXlJZCxcbiAgICBleGFtcGxlUGVybWlzc2lvbnNCb3VuZGFyeTogY29uZmlnLmJvb3RzdHJhcD8uZXhhbXBsZVBlcm1pc3Npb25zQm91bmRhcnksXG4gICAgY3VzdG9tUGVybWlzc2lvbnNCb3VuZGFyeTogY29uZmlnLmJvb3RzdHJhcD8uY3VzdG9tUGVybWlzc2lvbnNCb3VuZGFyeSxcbiAgICBib290c3RyYXBDdXN0b21lcktleTogY29uZmlnLmJvb3RzdHJhcD8uYm9vdHN0cmFwQ3VzdG9tZXJLZXksXG4gICAgcXVhbGlmaWVyOiBjb25maWcuYm9vdHN0cmFwPy5xdWFsaWZpZXIsXG4gICAgcHVibGljQWNjZXNzQmxvY2tDb25maWd1cmF0aW9uOiBjb25maWcuYm9vdHN0cmFwPy5wdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb24sXG4gICAgZGVueUV4dGVybmFsSWQ6IGNvbmZpZy5ib290c3RyYXA/LmRlbnlFeHRlcm5hbElkLFxuICAgIHRhZ3M6IGNvbmZpZy5ib290c3RyYXA/LnRhZ3MsXG4gICAgZXhlY3V0ZTogY29uZmlnLmJvb3RzdHJhcD8uZXhlY3V0ZSxcbiAgICB0cnVzdDogY29uZmlnLmJvb3RzdHJhcD8udHJ1c3QsXG4gICAgdHJ1c3RGb3JMb29rdXA6IGNvbmZpZy5ib290c3RyYXA/LnRydXN0Rm9yTG9va3VwLFxuICAgIHVudHJ1c3Q6IGNvbmZpZy5ib290c3RyYXA/LnVudHJ1c3QsXG4gICAgY2xvdWRmb3JtYXRpb25FeGVjdXRpb25Qb2xpY2llczogY29uZmlnLmJvb3RzdHJhcD8uY2xvdWRmb3JtYXRpb25FeGVjdXRpb25Qb2xpY2llcyxcbiAgICBmb3JjZTogY29uZmlnLmJvb3RzdHJhcD8uZm9yY2UsXG4gICAgdGVybWluYXRpb25Qcm90ZWN0aW9uOiBjb25maWcuYm9vdHN0cmFwPy50ZXJtaW5hdGlvblByb3RlY3Rpb24sXG4gICAgc2hvd1RlbXBsYXRlOiBjb25maWcuYm9vdHN0cmFwPy5zaG93VGVtcGxhdGUsXG4gICAgdG9vbGtpdFN0YWNrTmFtZTogY29uZmlnLmJvb3RzdHJhcD8udG9vbGtpdFN0YWNrTmFtZSxcbiAgICB0ZW1wbGF0ZTogY29uZmlnLmJvb3RzdHJhcD8udGVtcGxhdGUsXG4gICAgcHJldmlvdXNQYXJhbWV0ZXJzOiBjb25maWcuYm9vdHN0cmFwPy5wcmV2aW91c1BhcmFtZXRlcnMsXG4gIH07XG4gIGNvbnN0IGdjT3B0aW9ucyA9IHtcbiAgICBhY3Rpb246IGNvbmZpZy5nYz8uYWN0aW9uLFxuICAgIHR5cGU6IGNvbmZpZy5nYz8udHlwZSxcbiAgICByb2xsYmFja0J1ZmZlckRheXM6IGNvbmZpZy5nYz8ucm9sbGJhY2tCdWZmZXJEYXlzLFxuICAgIGNyZWF0ZWRCdWZmZXJEYXlzOiBjb25maWcuZ2M/LmNyZWF0ZWRCdWZmZXJEYXlzLFxuICAgIGNvbmZpcm06IGNvbmZpZy5nYz8uY29uZmlybSxcbiAgICB0b29sa2l0U3RhY2tOYW1lOiBjb25maWcuZ2M/LnRvb2xraXRTdGFja05hbWUsXG4gICAgYm9vdHN0cmFwU3RhY2tOYW1lOiBjb25maWcuZ2M/LmJvb3RzdHJhcFN0YWNrTmFtZSxcbiAgfTtcbiAgY29uc3QgZmxhZ3NPcHRpb25zID0ge1xuICAgIHZhbHVlOiBjb25maWcuZmxhZ3M/LnZhbHVlLFxuICAgIHNldDogY29uZmlnLmZsYWdzPy5zZXQsXG4gICAgYWxsOiBjb25maWcuZmxhZ3M/LmFsbCxcbiAgICB1bmNvbmZpZ3VyZWQ6IGNvbmZpZy5mbGFncz8udW5jb25maWd1cmVkLFxuICAgIHJlY29tbWVuZGVkOiBjb25maWcuZmxhZ3M/LnJlY29tbWVuZGVkLFxuICAgIGRlZmF1bHQ6IGNvbmZpZy5mbGFncz8uZGVmYXVsdCxcbiAgICBpbnRlcmFjdGl2ZTogY29uZmlnLmZsYWdzPy5pbnRlcmFjdGl2ZSxcbiAgICBzYWZlOiBjb25maWcuZmxhZ3M/LnNhZmUsXG4gICAgY29uY3VycmVuY3k6IGNvbmZpZy5mbGFncz8uY29uY3VycmVuY3ksXG4gIH07XG4gIGNvbnN0IGRlcGxveU9wdGlvbnMgPSB7XG4gICAgYWxsOiBjb25maWcuZGVwbG95Py5hbGwsXG4gICAgYnVpbGRFeGNsdWRlOiBjb25maWcuZGVwbG95Py5idWlsZEV4Y2x1ZGUsXG4gICAgZXhjbHVzaXZlbHk6IGNvbmZpZy5kZXBsb3k/LmV4Y2x1c2l2ZWx5LFxuICAgIHJlcXVpcmVBcHByb3ZhbDogY29uZmlnLmRlcGxveT8ucmVxdWlyZUFwcHJvdmFsLFxuICAgIG5vdGlmaWNhdGlvbkFybnM6IGNvbmZpZy5kZXBsb3k/Lm5vdGlmaWNhdGlvbkFybnMsXG4gICAgdGFnczogY29uZmlnLmRlcGxveT8udGFncyxcbiAgICBleGVjdXRlOiBjb25maWcuZGVwbG95Py5leGVjdXRlLFxuICAgIGNoYW5nZVNldE5hbWU6IGNvbmZpZy5kZXBsb3k/LmNoYW5nZVNldE5hbWUsXG4gICAgbWV0aG9kOiBjb25maWcuZGVwbG95Py5tZXRob2QsXG4gICAgaW1wb3J0RXhpc3RpbmdSZXNvdXJjZXM6IGNvbmZpZy5kZXBsb3k/LmltcG9ydEV4aXN0aW5nUmVzb3VyY2VzLFxuICAgIGZvcmNlOiBjb25maWcuZGVwbG95Py5mb3JjZSxcbiAgICBwYXJhbWV0ZXJzOiBjb25maWcuZGVwbG95Py5wYXJhbWV0ZXJzLFxuICAgIG91dHB1dHNGaWxlOiBjb25maWcuZGVwbG95Py5vdXRwdXRzRmlsZSxcbiAgICBwcmV2aW91c1BhcmFtZXRlcnM6IGNvbmZpZy5kZXBsb3k/LnByZXZpb3VzUGFyYW1ldGVycyxcbiAgICB0b29sa2l0U3RhY2tOYW1lOiBjb25maWcuZGVwbG95Py50b29sa2l0U3RhY2tOYW1lLFxuICAgIHByb2dyZXNzOiBjb25maWcuZGVwbG95Py5wcm9ncmVzcyxcbiAgICByb2xsYmFjazogY29uZmlnLmRlcGxveT8ucm9sbGJhY2ssXG4gICAgaG90c3dhcDogY29uZmlnLmRlcGxveT8uaG90c3dhcCxcbiAgICBob3Rzd2FwRmFsbGJhY2s6IGNvbmZpZy5kZXBsb3k/LmhvdHN3YXBGYWxsYmFjayxcbiAgICBob3Rzd2FwRWNzTWluaW11bUhlYWx0aHlQZXJjZW50OiBjb25maWcuZGVwbG95Py5ob3Rzd2FwRWNzTWluaW11bUhlYWx0aHlQZXJjZW50LFxuICAgIGhvdHN3YXBFY3NNYXhpbXVtSGVhbHRoeVBlcmNlbnQ6IGNvbmZpZy5kZXBsb3k/LmhvdHN3YXBFY3NNYXhpbXVtSGVhbHRoeVBlcmNlbnQsXG4gICAgaG90c3dhcEVjc1N0YWJpbGl6YXRpb25UaW1lb3V0U2Vjb25kczogY29uZmlnLmRlcGxveT8uaG90c3dhcEVjc1N0YWJpbGl6YXRpb25UaW1lb3V0U2Vjb25kcyxcbiAgICB3YXRjaDogY29uZmlnLmRlcGxveT8ud2F0Y2gsXG4gICAgbG9nczogY29uZmlnLmRlcGxveT8ubG9ncyxcbiAgICBjb25jdXJyZW5jeTogY29uZmlnLmRlcGxveT8uY29uY3VycmVuY3ksXG4gICAgYXNzZXRQYXJhbGxlbGlzbTogY29uZmlnLmRlcGxveT8uYXNzZXRQYXJhbGxlbGlzbSxcbiAgICBhc3NldFByZWJ1aWxkOiBjb25maWcuZGVwbG95Py5hc3NldFByZWJ1aWxkLFxuICAgIGlnbm9yZU5vU3RhY2tzOiBjb25maWcuZGVwbG95Py5pZ25vcmVOb1N0YWNrcyxcbiAgfTtcbiAgY29uc3Qgcm9sbGJhY2tPcHRpb25zID0ge1xuICAgIGFsbDogY29uZmlnLnJvbGxiYWNrPy5hbGwsXG4gICAgdG9vbGtpdFN0YWNrTmFtZTogY29uZmlnLnJvbGxiYWNrPy50b29sa2l0U3RhY2tOYW1lLFxuICAgIGZvcmNlOiBjb25maWcucm9sbGJhY2s/LmZvcmNlLFxuICAgIHZhbGlkYXRlQm9vdHN0cmFwVmVyc2lvbjogY29uZmlnLnJvbGxiYWNrPy52YWxpZGF0ZUJvb3RzdHJhcFZlcnNpb24sXG4gICAgb3JwaGFuOiBjb25maWcucm9sbGJhY2s/Lm9ycGhhbixcbiAgfTtcbiAgY29uc3QgaW1wb3J0T3B0aW9ucyA9IHtcbiAgICBleGVjdXRlOiBjb25maWcuaW1wb3J0Py5leGVjdXRlLFxuICAgIGNoYW5nZVNldE5hbWU6IGNvbmZpZy5pbXBvcnQ/LmNoYW5nZVNldE5hbWUsXG4gICAgdG9vbGtpdFN0YWNrTmFtZTogY29uZmlnLmltcG9ydD8udG9vbGtpdFN0YWNrTmFtZSxcbiAgICByb2xsYmFjazogY29uZmlnLmltcG9ydD8ucm9sbGJhY2ssXG4gICAgZm9yY2U6IGNvbmZpZy5pbXBvcnQ/LmZvcmNlLFxuICAgIHJlY29yZFJlc291cmNlTWFwcGluZzogY29uZmlnLmltcG9ydD8ucmVjb3JkUmVzb3VyY2VNYXBwaW5nLFxuICAgIHJlc291cmNlTWFwcGluZzogY29uZmlnLmltcG9ydD8ucmVzb3VyY2VNYXBwaW5nLFxuICB9O1xuICBjb25zdCB3YXRjaE9wdGlvbnMgPSB7XG4gICAgYnVpbGRFeGNsdWRlOiBjb25maWcud2F0Y2g/LmJ1aWxkRXhjbHVkZSxcbiAgICBleGNsdXNpdmVseTogY29uZmlnLndhdGNoPy5leGNsdXNpdmVseSxcbiAgICBjaGFuZ2VTZXROYW1lOiBjb25maWcud2F0Y2g/LmNoYW5nZVNldE5hbWUsXG4gICAgZm9yY2U6IGNvbmZpZy53YXRjaD8uZm9yY2UsXG4gICAgdG9vbGtpdFN0YWNrTmFtZTogY29uZmlnLndhdGNoPy50b29sa2l0U3RhY2tOYW1lLFxuICAgIHByb2dyZXNzOiBjb25maWcud2F0Y2g/LnByb2dyZXNzLFxuICAgIHJvbGxiYWNrOiBjb25maWcud2F0Y2g/LnJvbGxiYWNrLFxuICAgIGhvdHN3YXA6IGNvbmZpZy53YXRjaD8uaG90c3dhcCxcbiAgICBob3Rzd2FwRmFsbGJhY2s6IGNvbmZpZy53YXRjaD8uaG90c3dhcEZhbGxiYWNrLFxuICAgIGhvdHN3YXBFY3NNaW5pbXVtSGVhbHRoeVBlcmNlbnQ6IGNvbmZpZy53YXRjaD8uaG90c3dhcEVjc01pbmltdW1IZWFsdGh5UGVyY2VudCxcbiAgICBob3Rzd2FwRWNzTWF4aW11bUhlYWx0aHlQZXJjZW50OiBjb25maWcud2F0Y2g/LmhvdHN3YXBFY3NNYXhpbXVtSGVhbHRoeVBlcmNlbnQsXG4gICAgaG90c3dhcEVjc1N0YWJpbGl6YXRpb25UaW1lb3V0U2Vjb25kczogY29uZmlnLndhdGNoPy5ob3Rzd2FwRWNzU3RhYmlsaXphdGlvblRpbWVvdXRTZWNvbmRzLFxuICAgIGxvZ3M6IGNvbmZpZy53YXRjaD8ubG9ncyxcbiAgICBjb25jdXJyZW5jeTogY29uZmlnLndhdGNoPy5jb25jdXJyZW5jeSxcbiAgfTtcbiAgY29uc3QgZGVzdHJveU9wdGlvbnMgPSB7XG4gICAgYWxsOiBjb25maWcuZGVzdHJveT8uYWxsLFxuICAgIGV4Y2x1c2l2ZWx5OiBjb25maWcuZGVzdHJveT8uZXhjbHVzaXZlbHksXG4gICAgZm9yY2U6IGNvbmZpZy5kZXN0cm95Py5mb3JjZSxcbiAgfTtcbiAgY29uc3QgZGlmZk9wdGlvbnMgPSB7XG4gICAgZXhjbHVzaXZlbHk6IGNvbmZpZy5kaWZmPy5leGNsdXNpdmVseSxcbiAgICBjb250ZXh0TGluZXM6IGNvbmZpZy5kaWZmPy5jb250ZXh0TGluZXMsXG4gICAgdGVtcGxhdGU6IGNvbmZpZy5kaWZmPy50ZW1wbGF0ZSxcbiAgICBzdHJpY3Q6IGNvbmZpZy5kaWZmPy5zdHJpY3QsXG4gICAgc2VjdXJpdHlPbmx5OiBjb25maWcuZGlmZj8uc2VjdXJpdHlPbmx5LFxuICAgIGZhaWw6IGNvbmZpZy5kaWZmPy5mYWlsLFxuICAgIHByb2Nlc3NlZDogY29uZmlnLmRpZmY/LnByb2Nlc3NlZCxcbiAgICBxdWlldDogY29uZmlnLmRpZmY/LnF1aWV0LFxuICAgIGNoYW5nZVNldDogY29uZmlnLmRpZmY/LmNoYW5nZVNldCxcbiAgICBpbXBvcnRFeGlzdGluZ1Jlc291cmNlczogY29uZmlnLmRpZmY/LmltcG9ydEV4aXN0aW5nUmVzb3VyY2VzLFxuICAgIGluY2x1ZGVNb3ZlczogY29uZmlnLmRpZmY/LmluY2x1ZGVNb3ZlcyxcbiAgfTtcbiAgY29uc3QgZHJpZnRPcHRpb25zID0ge1xuICAgIGZhaWw6IGNvbmZpZy5kcmlmdD8uZmFpbCxcbiAgfTtcbiAgY29uc3QgbWV0YWRhdGFPcHRpb25zID0ge307XG4gIGNvbnN0IGFja25vd2xlZGdlT3B0aW9ucyA9IHt9O1xuICBjb25zdCBub3RpY2VzT3B0aW9ucyA9IHtcbiAgICB1bmFja25vd2xlZGdlZDogY29uZmlnLm5vdGljZXM/LnVuYWNrbm93bGVkZ2VkLFxuICB9O1xuICBjb25zdCBpbml0T3B0aW9ucyA9IHtcbiAgICBsYW5ndWFnZTogY29uZmlnLmluaXQ/Lmxhbmd1YWdlLFxuICAgIGxpc3Q6IGNvbmZpZy5pbml0Py5saXN0LFxuICAgIGdlbmVyYXRlT25seTogY29uZmlnLmluaXQ/LmdlbmVyYXRlT25seSxcbiAgICBsaWJWZXJzaW9uOiBjb25maWcuaW5pdD8ubGliVmVyc2lvbixcbiAgICBmcm9tUGF0aDogY29uZmlnLmluaXQ/LmZyb21QYXRoLFxuICAgIHRlbXBsYXRlUGF0aDogY29uZmlnLmluaXQ/LnRlbXBsYXRlUGF0aCxcbiAgfTtcbiAgY29uc3QgbWlncmF0ZU9wdGlvbnMgPSB7XG4gICAgc3RhY2tOYW1lOiBjb25maWcubWlncmF0ZT8uc3RhY2tOYW1lLFxuICAgIGxhbmd1YWdlOiBjb25maWcubWlncmF0ZT8ubGFuZ3VhZ2UsXG4gICAgYWNjb3VudDogY29uZmlnLm1pZ3JhdGU/LmFjY291bnQsXG4gICAgcmVnaW9uOiBjb25maWcubWlncmF0ZT8ucmVnaW9uLFxuICAgIGZyb21QYXRoOiBjb25maWcubWlncmF0ZT8uZnJvbVBhdGgsXG4gICAgZnJvbVN0YWNrOiBjb25maWcubWlncmF0ZT8uZnJvbVN0YWNrLFxuICAgIG91dHB1dFBhdGg6IGNvbmZpZy5taWdyYXRlPy5vdXRwdXRQYXRoLFxuICAgIGZyb21TY2FuOiBjb25maWcubWlncmF0ZT8uZnJvbVNjYW4sXG4gICAgZmlsdGVyOiBjb25maWcubWlncmF0ZT8uZmlsdGVyLFxuICAgIGNvbXByZXNzOiBjb25maWcubWlncmF0ZT8uY29tcHJlc3MsXG4gIH07XG4gIGNvbnN0IGNvbnRleHRPcHRpb25zID0ge1xuICAgIHJlc2V0OiBjb25maWcuY29udGV4dD8ucmVzZXQsXG4gICAgZm9yY2U6IGNvbmZpZy5jb250ZXh0Py5mb3JjZSxcbiAgICBjbGVhcjogY29uZmlnLmNvbnRleHQ/LmNsZWFyLFxuICB9O1xuICBjb25zdCBkb2NzT3B0aW9ucyA9IHtcbiAgICBicm93c2VyOiBjb25maWcuZG9jcz8uYnJvd3NlcixcbiAgfTtcbiAgY29uc3QgZG9jdG9yT3B0aW9ucyA9IHt9O1xuICBjb25zdCByZWZhY3Rvck9wdGlvbnMgPSB7XG4gICAgYWRkaXRpb25hbFN0YWNrTmFtZTogY29uZmlnLnJlZmFjdG9yPy5hZGRpdGlvbmFsU3RhY2tOYW1lLFxuICAgIGRyeVJ1bjogY29uZmlnLnJlZmFjdG9yPy5kcnlSdW4sXG4gICAgb3ZlcnJpZGVGaWxlOiBjb25maWcucmVmYWN0b3I/Lm92ZXJyaWRlRmlsZSxcbiAgICByZXZlcnQ6IGNvbmZpZy5yZWZhY3Rvcj8ucmV2ZXJ0LFxuICAgIGZvcmNlOiBjb25maWcucmVmYWN0b3I/LmZvcmNlLFxuICB9O1xuICBjb25zdCBjbGlUZWxlbWV0cnlPcHRpb25zID0ge1xuICAgIGVuYWJsZTogY29uZmlnLmNsaVRlbGVtZXRyeT8uZW5hYmxlLFxuICAgIGRpc2FibGU6IGNvbmZpZy5jbGlUZWxlbWV0cnk/LmRpc2FibGUsXG4gICAgc3RhdHVzOiBjb25maWcuY2xpVGVsZW1ldHJ5Py5zdGF0dXMsXG4gIH07XG4gIGNvbnN0IHVzZXJJbnB1dDogVXNlcklucHV0ID0ge1xuICAgIGdsb2JhbE9wdGlvbnMsXG4gICAgbGlzdDogbGlzdE9wdGlvbnMsXG4gICAgc3ludGg6IHN5bnRoT3B0aW9ucyxcbiAgICBib290c3RyYXA6IGJvb3RzdHJhcE9wdGlvbnMsXG4gICAgZ2M6IGdjT3B0aW9ucyxcbiAgICBmbGFnczogZmxhZ3NPcHRpb25zLFxuICAgIGRlcGxveTogZGVwbG95T3B0aW9ucyxcbiAgICByb2xsYmFjazogcm9sbGJhY2tPcHRpb25zLFxuICAgIGltcG9ydDogaW1wb3J0T3B0aW9ucyxcbiAgICB3YXRjaDogd2F0Y2hPcHRpb25zLFxuICAgIGRlc3Ryb3k6IGRlc3Ryb3lPcHRpb25zLFxuICAgIGRpZmY6IGRpZmZPcHRpb25zLFxuICAgIGRyaWZ0OiBkcmlmdE9wdGlvbnMsXG4gICAgbWV0YWRhdGE6IG1ldGFkYXRhT3B0aW9ucyxcbiAgICBhY2tub3dsZWRnZTogYWNrbm93bGVkZ2VPcHRpb25zLFxuICAgIG5vdGljZXM6IG5vdGljZXNPcHRpb25zLFxuICAgIGluaXQ6IGluaXRPcHRpb25zLFxuICAgIG1pZ3JhdGU6IG1pZ3JhdGVPcHRpb25zLFxuICAgIGNvbnRleHQ6IGNvbnRleHRPcHRpb25zLFxuICAgIGRvY3M6IGRvY3NPcHRpb25zLFxuICAgIGRvY3RvcjogZG9jdG9yT3B0aW9ucyxcbiAgICByZWZhY3RvcjogcmVmYWN0b3JPcHRpb25zLFxuICAgIGNsaVRlbGVtZXRyeTogY2xpVGVsZW1ldHJ5T3B0aW9ucyxcbiAgfTtcblxuICByZXR1cm4gdXNlcklucHV0O1xufVxuIl19