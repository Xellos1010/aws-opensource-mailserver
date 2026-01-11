import { Construct } from 'constructs';
import {
  Stack,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_logs as logs,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';

export interface SystemResetLambdaProps {
  /** EC2 instance ID to manage */
  instanceId: string;
  /** Domain name for resource naming */
  domainName: string;
  /** Timeout in seconds (default: 120) */
  timeout?: Duration;
  /** Memory size in MB (default: 512) */
  memorySize?: number;
}

/**
 * System Reset Lambda - Comprehensive system recovery without instance reboot
 *
 * Handles:
 * - Process cleanup (kill hung processes)
 * - Memory management (clear caches)
 * - Mail queue management (flush stuck queue)
 * - Log rotation/cleanup (free disk space)
 * - Service restart (postfix/dovecot/nginx)
 * - Resource verification
 *
 * Recovery Time: 30-90 seconds
 */
export class SystemResetLambda extends Construct {
  public readonly lambda: lambda.Function;

  constructor(scope: Construct, id: string, props: SystemResetLambdaProps) {
    super(scope, id);

    const {
      instanceId,
      domainName,
      timeout = Duration.seconds(120),
      memorySize = 512,
    } = props;

    // IAM Role - Use stack name for naming (domainName is a token from SSM)
    const stack = Stack.of(this);
    const role = new iam.Role(this, 'Role', {
      roleName: `SystemResetLambda-${stack.stackName}`,
      description: 'Role for system reset Lambda',
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
      logGroupName: `/aws/lambda/system-reset-${stack.stackName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Lambda Function
    this.lambda = new lambda.Function(this, 'Function', {
      functionName: `system-reset-${stack.stackName}`,
      description: 'Comprehensive system reset without instance reboot - handles memory, services, processes, and resources',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import boto3
import json
import time
import os

ssm = boto3.client('ssm')
ec2 = boto3.client('ec2')

def system_reset(instance_id):
    """
    Comprehensive system reset without instance reboot.
    Handles:
    - Memory cleanup (drop caches)
    - Service restart (postfix, dovecot, nginx)
    - Process cleanup (kill hung processes)
    - Mail queue management
    - Log rotation/cleanup
    - System resource cleanup
    """
    
    reset_script = """
set -e

echo "=========================================="
echo "System Reset (No Reboot)"
echo "=========================================="
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# Step 1: Check system state
echo "=== Step 1: System State Check ==="
echo "Memory:"
free -h
echo ""
echo "Disk:"
df -h / | tail -1
echo ""
echo "Load Average:"
uptime
echo ""

# Step 2: Kill hung/stuck processes
echo "=== Step 2: Process Cleanup ==="
# Kill hung postfix processes (if any)
pkill -9 -f "postfix.*master" 2>/dev/null || true
pkill -9 -f "dovecot.*master" 2>/dev/null || true
# Kill processes consuming excessive memory (>80% of available)
AVAIL_MEM=$(free -b | awk '/^Mem:/{print $7}')
THRESHOLD=$((AVAIL_MEM * 80 / 100))
ps aux --sort=-%mem | awk -v threshold="$THRESHOLD" 'NR>1 && $6 > threshold && $11 !~ /^\\[.*\\]$/ {print $2}' | xargs -r kill -9 2>/dev/null || true
echo "Process cleanup completed"
echo ""

# Step 3: Clear system caches
echo "=== Step 3: Memory Cache Cleanup ==="
sync
# Drop page cache, dentries, and inodes
echo 3 | sudo tee /proc/sys/vm/drop_caches >/dev/null
echo "Cache cleared"
echo ""
echo "Memory after cache clear:"
free -h
echo ""

# Step 4: Clean up mail queue (if stuck)
echo "=== Step 4: Mail Queue Management ==="
MAILQ_COUNT=$(mailq 2>/dev/null | grep -c "^[A-F0-9]" || echo "0")
if [ "$MAILQ_COUNT" -gt 100 ]; then
    echo "Large mail queue detected ($MAILQ_COUNT items), flushing..."
    postsuper -d ALL 2>/dev/null || true
    echo "Mail queue flushed"
else
    echo "Mail queue size: $MAILQ_COUNT (normal)"
fi
echo ""

# Step 5: Rotate logs (free up disk space)
echo "=== Step 5: Log Rotation ==="
sudo logrotate -f /etc/logrotate.conf 2>/dev/null || true
# Clean old logs (>7 days)
find /var/log -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true
find /var/log -name "*.gz" -type f -mtime +7 -delete 2>/dev/null || true
echo "Log rotation completed"
echo ""

# Step 6: Restart mail services
echo "=== Step 6: Service Restart ==="
# Stop services gracefully first
sudo systemctl stop postfix 2>/dev/null || true
sudo systemctl stop dovecot 2>/dev/null || true
sudo systemctl stop nginx 2>/dev/null || true

# Wait a moment
sleep 2

# Try Mail-in-a-Box daemon first (preferred method)
if [ -x /opt/mailinabox/management/mailinabox-daemon ]; then
    echo "Using Mail-in-a-Box daemon..."
    sudo /opt/mailinabox/management/mailinabox-daemon restart || {
        echo "MIAB daemon restart failed, using individual services..."
        sudo systemctl start postfix || true
        sudo systemctl start dovecot || true
        sudo systemctl start nginx || true
    }
elif [ -x /usr/local/bin/mailinabox ]; then
    echo "Using /usr/local/bin/mailinabox..."
    sudo /usr/local/bin/mailinabox restart || {
        echo "mailinabox restart failed, using individual services..."
        sudo systemctl start postfix || true
        sudo systemctl start dovecot || true
        sudo systemctl start nginx || true
    }
else
    echo "MIAB daemon not found, restarting individual services..."
    sudo systemctl restart postfix || true
    sudo systemctl restart dovecot || true
    sudo systemctl restart nginx || true
fi

# Wait for services to stabilize
sleep 3
echo ""

# Step 7: Verify service status
echo "=== Step 7: Service Verification ==="
POSTFIX_STATUS=$(systemctl is-active postfix 2>/dev/null || echo "unknown")
DOVECOT_STATUS=$(systemctl is-active dovecot 2>/dev/null || echo "unknown")
NGINX_STATUS=$(systemctl is-active nginx 2>/dev/null || echo "unknown")

echo "Postfix: $POSTFIX_STATUS"
echo "Dovecot: $DOVECOT_STATUS"
echo "Nginx: $NGINX_STATUS"
echo ""

# Step 8: Final system state
echo "=== Step 8: Final System State ==="
echo "Memory:"
free -h
echo ""
echo "Disk:"
df -h / | tail -1
echo ""

# Determine success
if [ "$POSTFIX_STATUS" = "active" ] && [ "$DOVECOT_STATUS" = "active" ]; then
    echo "=========================================="
    echo "✅ System reset completed successfully"
    echo "=========================================="
    exit 0
else
    echo "=========================================="
    echo "⚠️ System reset completed with warnings"
    echo "=========================================="
    echo "Some services may not be active:"
    [ "$POSTFIX_STATUS" != "active" ] && echo "  - Postfix: $POSTFIX_STATUS"
    [ "$DOVECOT_STATUS" != "active" ] && echo "  - Dovecot: $DOVECOT_STATUS"
    [ "$NGINX_STATUS" != "active" ] && echo "  - Nginx: $NGINX_STATUS"
    exit 1
fi
"""
    
    try:
        print(f"Performing system reset on instance {instance_id}")
        
        # Send SSM command
        response = ssm.send_command(
            InstanceIds=[instance_id],
            DocumentName="AWS-RunShellScript",
            Parameters={'commands': [reset_script]},
            TimeoutSeconds=120
        )
        
        # Extract CommandId from nested response structure
        if 'Command' in response and 'CommandId' in response['Command']:
            command_id = response['Command']['CommandId']
        elif 'CommandId' in response:
            command_id = response['CommandId']
        else:
            return {
                'success': False,
                'status': 'Error',
                'error': f'No CommandId in response: {response}'
            }
        
        # Wait for command completion (poll up to 110 seconds)
        max_wait = 110
        waited = 0
        while waited < max_wait:
            time.sleep(3)
            waited += 3
            output = ssm.get_command_invocation(
                CommandId=command_id,
                InstanceId=instance_id
            )
            status = output.get('Status')
            
            if status in ['Success', 'Failed', 'TimedOut', 'Cancelled']:
                stdout = output.get('StandardOutputContent', '')
                stderr = output.get('StandardErrorContent', '')
                
                result = {
                    'success': status == 'Success',
                    'status': status,
                    'stdout': stdout,
                    'stderr': stderr,
                    'command_id': command_id
                }
                
                # Check if services are actually active from output
                if status == 'Success':
                    if '✅ System reset completed successfully' in stdout:
                        result['services_healthy'] = True
                    else:
                        result['services_healthy'] = False
                else:
                    result['services_healthy'] = False
                
                return result
        
        # Timeout
        return {
            'success': False,
            'status': 'Timeout',
            'error': f'Command timed out after {max_wait} seconds',
            'command_id': command_id
        }
        
    except Exception as e:
        print(f"Error performing system reset: {str(e)}")
        return {
            'success': False,
            'status': 'Error',
            'error': str(e)
        }

def handler(event, context):
    instance_id = os.environ.get('INSTANCE_ID')
    
    if not instance_id:
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'INSTANCE_ID environment variable not set',
                'success': False
            })
        }
    
    try:
        print(f"Performing system reset for instance {instance_id}")
        result = system_reset(instance_id)
        
        status_code = 200 if result.get('success') and result.get('services_healthy') else 500
        
        return {
            'statusCode': status_code,
            'body': json.dumps(result, indent=2)
        }
    except Exception as e:
        print(f"Error in system reset: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'success': False
            })
        }
      `),
      role,
      timeout,
      memorySize,
      logGroup,
      environment: {
        INSTANCE_ID: instanceId,
      },
    });
  }
}

