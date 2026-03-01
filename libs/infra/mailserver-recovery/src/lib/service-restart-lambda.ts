import { Construct } from 'constructs';
import {
  Stack,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_logs as logs,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';

export interface ServiceRestartLambdaProps {
  /** EC2 instance ID to manage services on */
  instanceId: string;
  /** Domain name for resource naming */
  domainName: string;
  /** Timeout in seconds (default: 60) */
  timeout?: Duration;
  /** Memory size in MB (default: 256) */
  memorySize?: number;
}

/**
 * Service Restart Lambda - Restarts Mail-in-a-Box services without restarting EC2 instance.
 */
export class ServiceRestartLambda extends Construct {
  public readonly lambda: lambda.Function;

  constructor(scope: Construct, id: string, props: ServiceRestartLambdaProps) {
    super(scope, id);

    const {
      instanceId,
      domainName,
      timeout = Duration.seconds(90),
      memorySize = 256,
    } = props;

    // IAM Role - Use stack name for naming (domainName is a token from SSM)
    const stack = Stack.of(this);
    const role = new iam.Role(this, 'Role', {
      description: 'Role for service restart Lambda',
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
      description: 'Restarts Mail-in-a-Box services (mailinabox/postfix/dovecot/nginx) via SSM',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import boto3
import json
import time
import os

ssm = boto3.client('ssm')
ec2 = boto3.client('ec2')

def restart_mail_services(instance_id):
    """
    Restart Mail-in-a-Box services (mailinabox, postfix, dovecot, nginx) without restarting EC2.
    """
    
    domain_name = os.environ.get('DOMAIN_NAME', '')
    restart_script = """
set -e

echo "=== Mail Service Restart ==="
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
DOMAIN_NAME="__DOMAIN_NAME__"

# Harden Mail-in-a-Box start script to avoid gunicorn listener wedging on localhost binding
# and incorrect working directory.
MIAB_START="/usr/local/lib/mailinabox/start"
if [ -f "$MIAB_START" ]; then
    if [ ! -f "\${MIAB_START}.bak-observability" ]; then
        cp "$MIAB_START" "\${MIAB_START}.bak-observability" || true
    fi
    if ! grep -q "cd /opt/mailinabox/management" "$MIAB_START"; then
        sed -i '/source \\/usr\\/local\\/lib\\/mailinabox\\/env\\/bin\\/activate/a cd \\/opt\\/mailinabox\\/management' "$MIAB_START" || true
    fi
    sed -i 's/-b localhost:10222/-b 127.0.0.1:10222/g' "$MIAB_START" || true
fi

# Repair common mailbox root ownership drift that breaks IMAP folder operations.
if [ -n "$DOMAIN_NAME" ]; then
    MAILBOX_DOMAIN_ROOT="/home/user-data/mail/mailboxes/$DOMAIN_NAME"
    if [ -d "$MAILBOX_DOMAIN_ROOT" ]; then
        OWNER=$(stat -c '%U:%G' "$MAILBOX_DOMAIN_ROOT" 2>/dev/null || echo "unknown")
        PERM=$(stat -c '%a' "$MAILBOX_DOMAIN_ROOT" 2>/dev/null || echo "000")
        if [ "$OWNER" != "mail:mail" ] || [ "$PERM" != "755" ]; then
            echo "Repairing mailbox permissions: $MAILBOX_DOMAIN_ROOT ($OWNER $PERM -> mail:mail 755)"
            sudo chown mail:mail "$MAILBOX_DOMAIN_ROOT" || true
            sudo chmod 755 "$MAILBOX_DOMAIN_ROOT" || true
        fi
    fi
fi

# Ensure no stale management gunicorn workers are left behind.
pkill -f "gunicorn .*10222" 2>/dev/null || true

# Restart Mail-in-a-Box management service first, then core mail services.
sudo systemctl restart mailinabox || true
sudo systemctl restart postfix || true
sudo systemctl restart dovecot || true
sudo systemctl restart nginx || true

# Wait a moment for services to start
sleep 3

# Verify service status
echo ""
echo "=== Service Status ==="
echo "Mailinabox: $(systemctl is-active mailinabox || echo 'unknown')"
echo "Postfix: $(systemctl is-active postfix || echo 'unknown')"
echo "Dovecot: $(systemctl is-active dovecot || echo 'unknown')"
echo "Nginx: $(systemctl is-active nginx || echo 'unknown')"
ADMIN_HTTP_STATUS=$(curl -sk --max-time 20 -o /dev/null -w "%{http_code}" https://127.0.0.1/admin || echo "timeout")
echo "AdminEndpoint: $ADMIN_HTTP_STATUS"

# Check if services are active
MAILINABOX_ACTIVE=$(systemctl is-active mailinabox 2>/dev/null || echo "inactive")
POSTFIX_ACTIVE=$(systemctl is-active postfix 2>/dev/null || echo "inactive")
DOVECOT_ACTIVE=$(systemctl is-active dovecot 2>/dev/null || echo "inactive")
NGINX_ACTIVE=$(systemctl is-active nginx 2>/dev/null || echo "inactive")

ADMIN_OK=0
case "$ADMIN_HTTP_STATUS" in
    2*|3*|4*) ADMIN_OK=1 ;;
esac

if [ "$MAILINABOX_ACTIVE" = "active" ] && [ "$POSTFIX_ACTIVE" = "active" ] && [ "$DOVECOT_ACTIVE" = "active" ] && [ "$ADMIN_OK" -eq 1 ]; then
    echo ""
    echo "✅ Mail services restarted successfully (admin endpoint healthy)"
    exit 0
else
    echo ""
    echo "⚠️ Some services may not be active:"
    [ "$MAILINABOX_ACTIVE" != "active" ] && echo "  - Mailinabox: $MAILINABOX_ACTIVE"
    [ "$POSTFIX_ACTIVE" != "active" ] && echo "  - Postfix: $POSTFIX_ACTIVE"
    [ "$DOVECOT_ACTIVE" != "active" ] && echo "  - Dovecot: $DOVECOT_ACTIVE"
    [ "$NGINX_ACTIVE" != "active" ] && echo "  - Nginx: $NGINX_ACTIVE"
    [ "$ADMIN_OK" -ne 1 ] && echo "  - Admin endpoint unhealthy: $ADMIN_HTTP_STATUS"
    exit 1
fi
""".replace('__DOMAIN_NAME__', domain_name)
    
    try:
        print(f"Restarting mail services on instance {instance_id}")
        
        # Send SSM command
        response = ssm.send_command(
            InstanceIds=[instance_id],
            DocumentName="AWS-RunShellScript",
            Parameters={'commands': [restart_script]},
            TimeoutSeconds=90
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
        
        # Wait for command completion (poll up to 80 seconds)
        max_wait = 80
        waited = 0
        while waited < max_wait:
            time.sleep(2)
            waited += 2
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
                    if '✅ Mail services restarted successfully (admin endpoint healthy)' in stdout:
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
        print(f"Error restarting services: {str(e)}")
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
        print(f"Restarting mail services for instance {instance_id}")
        result = restart_mail_services(instance_id)
        
        status_code = 200 if result.get('success') and result.get('services_healthy') else 500
        
        return {
            'statusCode': status_code,
            'body': json.dumps(result, indent=2)
        }
    except Exception as e:
        print(f"Error in service restart: {str(e)}")
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
