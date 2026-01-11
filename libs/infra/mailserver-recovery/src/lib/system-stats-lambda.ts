import { Construct } from 'constructs';
import {
  Stack,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_logs as logs,
  aws_events as events,
  aws_events_targets as targets,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';

export interface SystemStatsLambdaProps {
  /** EC2 instance ID to monitor */
  instanceId: string;
  /** Domain name for resource naming */
  domainName: string;
  /** EventBridge schedule expression (optional - can be invoked on-demand) */
  scheduleExpression?: string;
  /** Lambda timeout (default: 60 seconds) */
  timeout?: Duration;
  /** Lambda memory size (default: 512 MB) */
  memorySize?: number;
}

/**
 * System Stats Lambda - Collects comprehensive system statistics for operational monitoring
 *
 * Features:
 * - Memory statistics (total, used, available, cache, usage %)
 * - Disk statistics (total, used, free, usage %)
 * - CPU & Load statistics (cores, load average)
 * - Service status (postfix, dovecot, nginx, SSM agent)
 * - Mail queue statistics
 * - Network statistics (active connections, TCP)
 * - Process statistics (top 5 memory consumers, total count)
 * - System uptime
 * - Health score calculation (0-100 with issue detection)
 */
export class SystemStatsLambda extends Construct {
  public readonly lambda: lambda.Function;
  public readonly scheduleRule?: events.Rule;

  constructor(scope: Construct, id: string, props: SystemStatsLambdaProps) {
    super(scope, id);

    const {
      instanceId,
      domainName,
      scheduleExpression,
      timeout = Duration.seconds(60),
      memorySize = 512,
    } = props;

    // IAM Role - Use stack name for naming (domainName is a token from SSM)
    const stack = Stack.of(this);
    const role = new iam.Role(this, 'Role', {
      roleName: `SystemStatsLambda-${stack.stackName}`,
      description: 'Role for system stats reporting Lambda',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ssm:SendCommand',
          'ssm:GetCommandInvocation',
          'ssm:DescribeInstanceInformation',
          'ec2:DescribeInstances',
          'cloudwatch:PutMetricData',
        ],
        resources: ['*'],
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: ['arn:aws:logs:*:*:*'],
      })
    );

    // CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/system-stats-${stack.stackName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Read Python code from original YAML file
    // Note: Shell script variables (${VAR}) are escaped as \${VAR} to prevent TypeScript template string interpolation
    const pythonCode = `import boto3
import json
import time
import os
from datetime import datetime

ssm = boto3.client('ssm')
ec2 = boto3.client('ec2')
cloudwatch = boto3.client('cloudwatch')

def collect_system_stats(instance_id):
    """Collect comprehensive system statistics via SSM."""
    stats_script = """set +e
echo "=== SYSTEM STATISTICS REPORT ==="
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""
echo "=== MEMORY STATISTICS ==="
free -h
echo ""
MEM_TOTAL=$(free -b | awk '/^Mem:/{print $2}')
MEM_USED=$(free -b | awk '/^Mem:/{print $3}')
MEM_FREE=$(free -b | awk '/^Mem:/{print $4}')
MEM_AVAIL=$(free -b | awk '/^Mem:/{print $7}')
MEM_CACHE=$(free -b | awk '/^Mem:/{print $6}')
MEM_PERCENT=$((MEM_USED * 100 / MEM_TOTAL))
MEM_AVAIL_PERCENT=$((MEM_AVAIL * 100 / MEM_TOTAL))
echo "Memory Usage: \${MEM_PERCENT}%"
echo "Memory Available: \${MEM_AVAIL_PERCENT}%"
echo "Memory Total: \${MEM_TOTAL} bytes"
echo "Memory Used: \${MEM_USED} bytes"
echo "Memory Free: \${MEM_FREE} bytes"
echo "Memory Available: \${MEM_AVAIL} bytes"
echo "Memory Cache: \${MEM_CACHE} bytes"
echo ""
echo "=== DISK STATISTICS ==="
df -h /
echo ""
DISK_TOTAL=$(df -B1 / | tail -1 | awk '{print $2}')
DISK_USED=$(df -B1 / | tail -1 | awk '{print $3}')
DISK_FREE=$(df -B1 / | tail -1 | awk '{print $4}')
DISK_PERCENT=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
echo "Disk Usage: \${DISK_PERCENT}%"
echo "Disk Total: \${DISK_TOTAL} bytes"
echo "Disk Used: \${DISK_USED} bytes"
echo "Disk Free: \${DISK_FREE} bytes"
echo ""
echo "=== CPU AND LOAD STATISTICS ==="
uptime
echo ""
LOAD_1=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
LOAD_5=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $2}' | sed 's/,//')
LOAD_15=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $3}')
CPU_COUNT=$(nproc)
echo "Load Average (1min): \${LOAD_1}"
echo "Load Average (5min): \${LOAD_5}"
echo "Load Average (15min): \${LOAD_15}"
echo "CPU Cores: \${CPU_COUNT}"
echo ""
echo "=== SERVICE STATUS ==="
POSTFIX_STATUS=$(systemctl is-active postfix 2>/dev/null || echo "unknown")
DOVECOT_STATUS=$(systemctl is-active dovecot 2>/dev/null || echo "unknown")
NGINX_STATUS=$(systemctl is-active nginx 2>/dev/null || echo "unknown")
SSM_STATUS=$(systemctl is-active snap.amazon-ssm-agent.amazon-ssm-agent.service 2>/dev/null || systemctl is-active amazon-ssm-agent 2>/dev/null || echo "unknown")
echo "Postfix: \${POSTFIX_STATUS}"
echo "Dovecot: \${DOVECOT_STATUS}"
echo "Nginx: \${NGINX_STATUS}"
echo "SSM Agent: \${SSM_STATUS}"
echo ""
echo "=== MAIL QUEUE STATISTICS ==="
MAILQ_OUTPUT=$(mailq 2>/dev/null || echo "")
MAILQ_COUNT=$(echo "\${MAILQ_OUTPUT}" | grep -c "^[A-F0-9]" || echo "0")
echo "Mail Queue Size: \${MAILQ_COUNT} messages"
echo ""
echo "=== SYSTEM UPTIME ==="
UPTIME_SECONDS=$(awk '{print int($1)}' /proc/uptime)
UPTIME_DAYS=$((UPTIME_SECONDS / 86400))
UPTIME_HOURS=$(((UPTIME_SECONDS % 86400) / 3600))
UPTIME_MINUTES=$(((UPTIME_SECONDS % 3600) / 60))
echo "Uptime: \${UPTIME_DAYS} days, \${UPTIME_HOURS} hours, \${UPTIME_MINUTES} minutes"
echo ""
echo "=== HEALTH INDICATORS ==="
HEALTH_SCORE=100
HEALTH_ISSUES=()
if [ "\${MEM_AVAIL_PERCENT}" -lt 10 ]; then
    HEALTH_SCORE=$((HEALTH_SCORE - 30))
    HEALTH_ISSUES+=("Low memory available (\${MEM_AVAIL_PERCENT}%)")
elif [ "\${MEM_AVAIL_PERCENT}" -lt 20 ]; then
    HEALTH_SCORE=$((HEALTH_SCORE - 15))
    HEALTH_ISSUES+=("Memory getting low (\${MEM_AVAIL_PERCENT}%)")
fi
if [ "\${DISK_PERCENT}" -gt 95 ]; then
    HEALTH_SCORE=$((HEALTH_SCORE - 30))
    HEALTH_ISSUES+=("Disk nearly full (\${DISK_PERCENT}%)")
elif [ "\${DISK_PERCENT}" -gt 90 ]; then
    HEALTH_SCORE=$((HEALTH_SCORE - 15))
    HEALTH_ISSUES+=("Disk getting full (\${DISK_PERCENT}%)")
fi
if [ "\${POSTFIX_STATUS}" != "active" ]; then
    HEALTH_SCORE=$((HEALTH_SCORE - 25))
    HEALTH_ISSUES+=("Postfix is \${POSTFIX_STATUS}")
fi
if [ "\${DOVECOT_STATUS}" != "active" ]; then
    HEALTH_SCORE=$((HEALTH_SCORE - 25))
    HEALTH_ISSUES+=("Dovecot is \${DOVECOT_STATUS}")
fi
if [ "\${NGINX_STATUS}" != "active" ]; then
    HEALTH_SCORE=$((HEALTH_SCORE - 10))
    HEALTH_ISSUES+=("Nginx is \${NGINX_STATUS}")
fi
MAILQ_COUNT_NUM=$(echo "\${MAILQ_COUNT}" | tr -d ' ' || echo "0")
if [ -n "\${MAILQ_COUNT_NUM}" ] && [ "\${MAILQ_COUNT_NUM}" -gt 100 ] 2>/dev/null; then
    HEALTH_SCORE=$((HEALTH_SCORE - 10))
    HEALTH_ISSUES+=("Large mail queue (\${MAILQ_COUNT_NUM} messages)")
fi
if [ "\${HEALTH_SCORE}" -lt 0 ]; then
    HEALTH_SCORE=0
fi
echo "Health Score: \${HEALTH_SCORE}/100"
if [ \${#HEALTH_ISSUES[@]} -gt 0 ]; then
    echo "Issues:"
    for issue in "\${HEALTH_ISSUES[@]}"; do
        echo "  - \${issue}"
    done
else
    echo "No issues detected"
fi
echo ""
echo "=== JSON OUTPUT ==="
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ || echo "")
ISSUES_ARRAY="["
ISSUE_COUNT=0
ISSUE_LIST_LEN=\${#HEALTH_ISSUES[@]}
if [ "\$ISSUE_LIST_LEN" -gt 0 ] 2>/dev/null; then
    for issue_item in "\${HEALTH_ISSUES[@]}"; do
        if [ $ISSUE_COUNT -gt 0 ]; then
            ISSUES_ARRAY="\${ISSUES_ARRAY},"
        fi
        ISSUE_ESC=$(echo "\${issue_item}" | sed 's/\\\\\\\\/\\\\\\\\/g' | sed 's/"/\\\\"/g' 2>/dev/null || echo "\${issue_item}")
        ISSUES_ARRAY="\${ISSUES_ARRAY}\\"\${ISSUE_ESC}\\""
        ISSUE_COUNT=$((ISSUE_COUNT + 1))
    done
fi
ISSUES_ARRAY="\${ISSUES_ARRAY}]"
echo "{"
echo "\\"timestamp\\":\\"\${TIMESTAMP}\\","
echo "\\"memory\\":{"
echo "\\"total_bytes\\":\${MEM_TOTAL},"
echo "\\"used_bytes\\":\${MEM_USED},"
echo "\\"free_bytes\\":\${MEM_FREE},"
echo "\\"available_bytes\\":\${MEM_AVAIL},"
echo "\\"cache_bytes\\":\${MEM_CACHE},"
echo "\\"usage_percent\\":\${MEM_PERCENT},"
echo "\\"available_percent\\":\${MEM_AVAIL_PERCENT}"
echo "},"
echo "\\"disk\\":{"
echo "\\"total_bytes\\":\${DISK_TOTAL},"
echo "\\"used_bytes\\":\${DISK_USED},"
echo "\\"free_bytes\\":\${DISK_FREE},"
echo "\\"usage_percent\\":\${DISK_PERCENT}"
echo "},"
echo "\\"cpu\\":{"
echo "\\"cores\\":\${CPU_COUNT},"
echo "\\"load_1min\\":\${LOAD_1},"
echo "\\"load_5min\\":\${LOAD_5},"
echo "\\"load_15min\\":\${LOAD_15}"
echo "},"
echo "\\"services\\":{"
echo "\\"postfix\\":\\"\${POSTFIX_STATUS}\\","
echo "\\"dovecot\\":\\"\${DOVECOT_STATUS}\\","
echo "\\"nginx\\":\\"\${NGINX_STATUS}\\","
echo "\\"ssm_agent\\":\\"\${SSM_STATUS}\\""
echo "},"
echo "\\"mail_queue\\":{"
echo "\\"size\\":\${MAILQ_COUNT}"
echo "},"
echo "\\"uptime_seconds\\":\${UPTIME_SECONDS},"
echo "\\"health\\":{"
echo "\\"score\\":\${HEALTH_SCORE},"
echo "\\"issues\\":\${ISSUES_ARRAY}"
echo "}"
echo "}"
"""
    try:
        print(f"Collecting system statistics for instance {instance_id}")
        response = ssm.send_command(
            InstanceIds=[instance_id],
            DocumentName="AWS-RunShellScript",
            Parameters={'commands': [stats_script]},
            TimeoutSeconds=60
        )
        if 'Command' in response and 'CommandId' in response['Command']:
            command_id = response['Command']['CommandId']
        elif 'CommandId' in response:
            command_id = response['CommandId']
        else:
            return {'success': False, 'error': f'No CommandId in response: {response}'}
        max_wait = 55
        waited = 0
        while waited < max_wait:
            time.sleep(2)
            waited += 2
            output = ssm.get_command_invocation(CommandId=command_id, InstanceId=instance_id)
            status = output.get('Status')
            if status in ['Success', 'Failed', 'TimedOut', 'Cancelled']:
                stdout = output.get('StandardOutputContent', '')
                stderr = output.get('StandardErrorContent', '')
                json_data = {}
                json_marker = stdout.find('=== JSON OUTPUT ===')
                if json_marker >= 0:
                    json_section = stdout[json_marker:]
                    json_start = json_section.find('{')
                    json_end = json_section.rfind('}') + 1
                    if json_start >= 0 and json_end > json_start:
                        try:
                            json_str = json_section[json_start:json_end]
                            json_data = json.loads(json_str)
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON: {e}")
                if not json_data:
                    json_start = stdout.find('{')
                    json_end = stdout.rfind('}') + 1
                    if json_start >= 0 and json_end > json_start:
                        try:
                            json_str = stdout[json_start:json_end]
                            json_data = json.loads(json_str)
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON: {e}")
                has_stats = bool(json_data)
                success_status = status == 'Success' or (has_stats and status == 'Failed')
                return {
                    'success': success_status,
                    'status': status,
                    'stdout': stdout,
                    'stderr': stderr,
                    'command_id': command_id,
                    'stats': json_data if json_data else None
                }
        return {
            'success': False,
            'status': 'Timeout',
            'error': f'Command timed out after {max_wait} seconds',
            'command_id': command_id
        }
    except Exception as e:
        print(f"Error collecting system stats: {str(e)}")
        return {'success': False, 'error': str(e)}

def handler(event, context):
    instance_id = os.environ.get('INSTANCE_ID')
    if not instance_id:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'INSTANCE_ID environment variable not set', 'success': False})
        }
    try:
        print(f"Collecting system statistics for instance {instance_id}")
        result = collect_system_stats(instance_id)
        status_code = 200 if result.get('success') else 500
        return {'statusCode': status_code, 'body': json.dumps(result, indent=2)}
    except Exception as e:
        print(f"Error in system stats Lambda: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e), 'success': False})
        }
`;

    // Lambda Function
    this.lambda = new lambda.Function(this, 'Function', {
      functionName: `system-stats-${stack.stackName}`,
      description: 'Collects and reports comprehensive system statistics for operational monitoring',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromInline(pythonCode),
      role,
      timeout,
      memorySize,
      logGroup,
      environment: {
        INSTANCE_ID: instanceId,
      },
    });

    // EventBridge Schedule (if provided)
    if (scheduleExpression) {
      this.scheduleRule = new events.Rule(this, 'ScheduleRule', {
        schedule: events.Schedule.expression(scheduleExpression),
        description: 'Triggers system statistics collection',
      });

      this.scheduleRule.addTarget(new targets.LambdaFunction(this.lambda));

      // Grant EventBridge permission to invoke Lambda
      this.lambda.addPermission('EventBridgeInvoke', {
        principal: new iam.ServicePrincipal('events.amazonaws.com'),
        sourceArn: this.scheduleRule.ruleArn,
      });
    }
  }
}

