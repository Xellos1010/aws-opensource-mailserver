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
 * - Service restart (mailinabox/postfix/dovecot/nginx)
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
      timeout = Duration.seconds(180),
      memorySize = 512,
    } = props;

    // IAM Role - Use stack name for naming (domainName is a token from SSM)
    const stack = Stack.of(this);
    const role = new iam.Role(this, 'Role', {
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
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Lambda Function
    this.lambda = new lambda.Function(this, 'Function', {
      description: 'Comprehensive system reset without EC2 reboot - includes Mail-in-a-Box service recovery',
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
    - Service restart (mailinabox, postfix, dovecot, nginx)
    - Process cleanup (kill hung processes)
    - Mail queue management
    - Log rotation/cleanup
    - System resource cleanup
    """
    
    domain_name = os.environ.get('DOMAIN_NAME', '')
    reset_script = """
set -e

echo "=========================================="
echo "System Reset (No Reboot)"
echo "=========================================="
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""
DOMAIN_NAME="__DOMAIN_NAME__"

# Step 0: Emergency disk cleanup (ALWAYS runs first - frees space before SSM can fail)
echo "=== Step 0: Emergency Disk Cleanup ==="
echo "Disk before cleanup:"
df -h / | tail -1
echo ""

# Vacuum systemd journal (typically frees 100-200MB - largest single source)
journalctl --vacuum-size=100M 2>/dev/null || true
journalctl --vacuum-time=7d 2>/dev/null || true

# Clear apt package cache
apt-get clean 2>/dev/null || true

# Clear old Amazon SSM agent logs (keep only today's)
find /var/log/amazon/ssm -name '*.log.*' -mtime +0 -delete 2>/dev/null || true

# Clear old compressed log archives (older than 3 days)
find /var/log -name '*.gz' -mtime +3 -delete 2>/dev/null || true

# Clear old temp files
find /tmp -type f -mtime +1 -delete 2>/dev/null || true

echo "Disk after emergency cleanup:"
df -h / | tail -1
echo ""

# Step 0.5: Repair mailbox ownership drift that breaks IMAP folder operations
echo "=== Step 0.5: Mailbox Permission Integrity ==="
if [ -n "$DOMAIN_NAME" ]; then
    MAILBOX_DOMAIN_ROOT="/home/user-data/mail/mailboxes/$DOMAIN_NAME"
    if [ -d "$MAILBOX_DOMAIN_ROOT" ]; then
        OWNER=$(stat -c '%U:%G' "$MAILBOX_DOMAIN_ROOT" 2>/dev/null || echo "unknown")
        PERM=$(stat -c '%a' "$MAILBOX_DOMAIN_ROOT" 2>/dev/null || echo "000")
        if [ "$OWNER" != "mail:mail" ] || [ "$PERM" != "755" ]; then
            echo "Repairing mailbox permissions: $MAILBOX_DOMAIN_ROOT ($OWNER $PERM -> mail:mail 755)"
            sudo chown mail:mail "$MAILBOX_DOMAIN_ROOT" || true
            sudo chmod 755 "$MAILBOX_DOMAIN_ROOT" || true
        else
            echo "Mailbox permissions already healthy: $MAILBOX_DOMAIN_ROOT ($OWNER $PERM)"
        fi
    else
        echo "Mailbox domain root not found: $MAILBOX_DOMAIN_ROOT"
    fi
fi
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

# Step 5.5: Harden Mail-in-a-Box start script (admin gunicorn stability)
echo "=== Step 5.5: Mail-in-a-Box Start Script Integrity ==="
MIAB_START="/usr/local/lib/mailinabox/start"
if [ -f "$MIAB_START" ]; then
    if [ ! -f "\${MIAB_START}.bak-observability" ]; then
        cp "$MIAB_START" "\${MIAB_START}.bak-observability" || true
    fi
    if ! grep -q "cd /opt/mailinabox/management" "$MIAB_START"; then
        sed -i '/source \\/usr\\/local\\/lib\\/mailinabox\\/env\\/bin\\/activate/a cd \\/opt\\/mailinabox\\/management' "$MIAB_START" || true
    fi
    sed -i 's/-b localhost:10222/-b 127.0.0.1:10222/g' "$MIAB_START" || true
    sed -i 's#exec gunicorn .*#exec gunicorn -b 127.0.0.1:10222 -w 2 --timeout 120 wsgi:app#' "$MIAB_START" || true
    echo "Mail-in-a-Box start script verified"
else
    echo "Mail-in-a-Box start script not found at $MIAB_START"
fi
echo ""

# Step 5.6: Ensure log files required by fail2ban jails exist
echo "=== Step 5.6: Fail2Ban Log File Integrity ==="
mkdir -p /var/log/roundcubemail
touch /var/log/roundcubemail/errors.log
chown www-data:www-data /var/log/roundcubemail/errors.log 2>/dev/null || true
chmod 640 /var/log/roundcubemail/errors.log 2>/dev/null || true
touch /var/log/fail2ban.log
chown root:adm /var/log/fail2ban.log 2>/dev/null || true
chmod 640 /var/log/fail2ban.log 2>/dev/null || true
echo "Fail2Ban log dependencies verified"
echo ""

# Step 6: Restart mail services
echo "=== Step 6: Service Restart ==="
# Stop services gracefully first
sudo systemctl stop mailinabox 2>/dev/null || true
sudo systemctl stop postfix 2>/dev/null || true
sudo systemctl stop dovecot 2>/dev/null || true
sudo systemctl stop nginx 2>/dev/null || true

# Wait a moment
sleep 2

# Ensure no stale management gunicorn workers are left behind.
pkill -f "gunicorn .*10222" 2>/dev/null || true

# Restart management + core services.
sudo systemctl restart mailinabox || true
sudo systemctl restart postfix || true
sudo systemctl restart dovecot || true
sudo systemctl restart nginx || true
sudo systemctl restart fail2ban || true

# Wait for services to stabilize
sleep 5
echo ""

# Step 7: Verify service status
echo "=== Step 7: Service Verification ==="
MAILINABOX_STATUS=$(systemctl is-active mailinabox 2>/dev/null || echo "unknown")
POSTFIX_STATUS=$(systemctl is-active postfix 2>/dev/null || echo "unknown")
DOVECOT_STATUS=$(systemctl is-active dovecot 2>/dev/null || echo "unknown")
NGINX_STATUS=$(systemctl is-active nginx 2>/dev/null || echo "unknown")
FAIL2BAN_STATUS=$(systemctl is-active fail2ban 2>/dev/null || echo "unknown")
ADMIN_HTTP_STATUS=$(curl -sk --max-time 20 -o /dev/null -w "%{http_code}" https://127.0.0.1/admin || echo "timeout")

echo "Mailinabox: $MAILINABOX_STATUS"
echo "Postfix: $POSTFIX_STATUS"
echo "Dovecot: $DOVECOT_STATUS"
echo "Nginx: $NGINX_STATUS"
echo "Fail2Ban: $FAIL2BAN_STATUS"
echo "AdminEndpoint: $ADMIN_HTTP_STATUS"
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
ADMIN_OK=0
case "$ADMIN_HTTP_STATUS" in
    2*|3*|4*) ADMIN_OK=1 ;;
esac

if [ "$MAILINABOX_STATUS" = "active" ] && [ "$POSTFIX_STATUS" = "active" ] && [ "$DOVECOT_STATUS" = "active" ] && [ "$FAIL2BAN_STATUS" = "active" ] && [ "$ADMIN_OK" -eq 1 ]; then
    echo "=========================================="
    echo "✅ System reset completed successfully"
    echo "=========================================="
    exit 0
else
    echo "=========================================="
    echo "⚠️ System reset completed with warnings"
    echo "=========================================="
    echo "Some services may not be active:"
    [ "$MAILINABOX_STATUS" != "active" ] && echo "  - Mailinabox: $MAILINABOX_STATUS"
    [ "$POSTFIX_STATUS" != "active" ] && echo "  - Postfix: $POSTFIX_STATUS"
    [ "$DOVECOT_STATUS" != "active" ] && echo "  - Dovecot: $DOVECOT_STATUS"
    [ "$NGINX_STATUS" != "active" ] && echo "  - Nginx: $NGINX_STATUS"
    [ "$FAIL2BAN_STATUS" != "active" ] && echo "  - Fail2Ban: $FAIL2BAN_STATUS"
    [ "$ADMIN_OK" -ne 1 ] && echo "  - Admin endpoint unhealthy: $ADMIN_HTTP_STATUS"
    exit 1
fi
""".replace('__DOMAIN_NAME__', domain_name)
    
    try:
        print(f"Performing system reset on instance {instance_id}")
        
        # Send SSM command
        response = ssm.send_command(
            InstanceIds=[instance_id],
            DocumentName="AWS-RunShellScript",
            Parameters={'commands': [reset_script]},
            TimeoutSeconds=180
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
        
        # Wait for command completion (poll up to 170 seconds)
        max_wait = 170
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
        DOMAIN_NAME: domainName,
      },
    });
  }
}
