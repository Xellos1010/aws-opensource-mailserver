# HEPE Foundation Mail Server - Diagnosis and Remediation Plan

**Date:** November 26, 2025  
**Status:** Instance experiencing cascading restarts during scheduled maintenance

## Executive Summary

The HEPE Foundation mail server is experiencing unnecessary restarts due to alarms triggering during scheduled maintenance windows. The scheduled daily stop-start operation (8am UTC / 3am EST) causes status check failures, which trigger alarms, which then trigger additional Lambda restarts, creating a cascade effect.

## Root Cause Analysis

### Problem Pattern Identified

1. **Scheduled Maintenance Window**: Daily stop-start at 8:00 UTC (3:00 AM EST)
2. **Alarm Triggers**: Status check alarms fire at ~8:09 UTC (2 minutes after instance stops)
3. **Cascading Restarts**: Multiple Lambda invocations occur simultaneously:
   - Scheduled: 08:00:45 UTC
   - Alarm-triggered: 08:09:09 UTC (InstanceStatusCheck)
   - Alarm-triggered: 08:09:38 UTC (SystemStatusCheck)
   - Result: Instance restarted 3+ times unnecessarily

### Evidence from Monitoring Reports

```
Stop-Start Operations (Last 28):
  ✓ 2025-11-26 08:10:10 UTC - SUCCESS (Instance: running)
  ✓ 2025-11-26 08:10:10 UTC - SUCCESS (Instance: stopped)
  ✓ 2025-11-25 08:10:11 UTC - SUCCESS (Instance: running)
  ✓ 2025-11-25 08:10:10 UTC - SUCCESS (Instance: stopped)

Alarm Triggers (Last 7 Days): 12
  ⚠ 2025-11-26 08:09:37 UTC - InstanceStatusCheck-i-0a1ff83f513575ed4 (OK → ALARM)
      Reason: Threshold Crossed: no datapoints were received for 2 periods
  ⚠ 2025-11-26 08:09:08 UTC - SystemStatusCheck-i-0a1ff83f513575ed4 (OK → ALARM)
      Reason: Threshold Crossed: no datapoints were received for 2 periods
```

### Key Issues

1. **No Maintenance Window Awareness**: Alarms don't know about scheduled maintenance
2. **No In-Progress Detection**: Lambda doesn't check if a restart is already happening
3. **No Mail Service Health Checks**: Restarts occur without verifying mail services are actually down
4. **Cascading Invocations**: Multiple alarms trigger simultaneously, causing multiple restarts

## Solution Architecture

### Design Principles

- ✅ **Only modify alarm stack or emergency scripts** (not primary HEPE Foundation stack)
- ✅ **Automate all processes** into executable Lambda functions
- ✅ **Maintain mail delivery uptime** - verify services before restarting
- ✅ **Prevent cascading restarts** - detect in-progress operations
- ✅ **Respect maintenance windows** - suppress false alarms during scheduled maintenance

### Components Required

1. **Smart Restart Lambda** - Enhanced stop-start Lambda with:
   - In-progress detection (check CloudWatch Logs for recent executions)
   - Maintenance window awareness (suppress during scheduled times)
   - Mail service health checks (verify services are actually down)
   - Idempotency (prevent concurrent executions)

2. **Mail Service Health Check Lambda** - New Lambda to:
   - Check SMTP port 25 accessibility
   - Verify postfix service status
   - Verify dovecot service status
   - Check mail queue status
   - Return health status to calling Lambda

3. **Alarm Stack Enhancements** - Update `emergency-alarms-stack.yaml`:
   - Add maintenance window suppression logic
   - Add mail service health check integration
   - Add execution deduplication

4. **Monitoring Enhancements** - Add:
   - Mail service health metrics
   - Restart reason tracking
   - Maintenance window tracking

## Implementation Plan

### Phase 1: Mail Service Health Check Lambda

**Purpose**: Verify mail services are actually down before restarting

**Location**: `Archive/hepefoundation/mail-health-check-lambda.yaml`

**Functionality**:
- SSM Session Manager connection to instance
- Check postfix service status
- Check dovecot service status
- Test SMTP port 25 connectivity
- Check mail queue status
- Return JSON health status

**Integration**: Called by Smart Restart Lambda before restarting

### Phase 2: Enhanced Smart Restart Lambda

**Purpose**: Replace current stop-start Lambda with intelligent version

**Location**: `Archive/hepefoundation/smart-restart-lambda.yaml`

**Enhancements**:
1. **In-Progress Detection**:
   - Query CloudWatch Logs for recent Lambda executions
   - Check if restart completed in last 5 minutes
   - Skip if restart already in progress

2. **Maintenance Window Awareness**:
   - Check current time against scheduled maintenance window (8:00-8:15 UTC)
   - Suppress alarm-triggered restarts during maintenance window
   - Allow scheduled restarts to proceed

3. **Mail Service Health Check**:
   - Call Mail Health Check Lambda before restarting
   - Only restart if mail services are actually down (service status checks)
   - Port connectivity checks are informational only (AWS may restrict port 25)
   - Log health check results with detailed breakdown

4. **Execution Deduplication**:
   - Use DynamoDB table to track in-progress executions
   - Prevent concurrent Lambda invocations
   - Clean up completed executions

5. **Enhanced Logging**:
   - Log restart reason (scheduled vs alarm-triggered)
   - Log mail service health status
   - Log maintenance window status

### Phase 3: Alarm Stack Updates

**Purpose**: Integrate smart restart logic into alarm stack

**Location**: `Archive/hepefoundation/emergency-alarms-stack.yaml`

**Changes**:
1. Add DynamoDB table for execution tracking
2. Add Mail Health Check Lambda function
3. Update Smart Restart Lambda (replace current stop-start Lambda)
4. Add CloudWatch custom metrics for:
   - Mail service health status
   - Restart reasons
   - Maintenance window events

### Phase 4: Monitoring and Observability

**Purpose**: Track mail service health and restart patterns

**Components**:
1. CloudWatch Dashboard for mail service health
2. Custom metrics for:
   - `MailServiceHealth` (0=healthy, 1=unhealthy)
   - `RestartReason` (scheduled, alarm-triggered, manual)
   - `MaintenanceWindowActive` (0=no, 1=yes)
3. Enhanced monitoring report script

## Detailed Implementation

### Important: AWS Port 25 Restrictions

**AWS EC2 Port 25 Restrictions:**
- **Outbound port 25**: Blocked by default (can request removal via AWS Support)
- **Inbound port 25**: May be restricted depending on account/region/VPC configuration
- **Security Groups**: May allow port 25, but AWS network-level restrictions can still apply
- **Solution**: Port connectivity checks are **informational only** and **never block restarts**

**Health Check Strategy:**
- **Primary Health Indicators**: Service status (`systemctl is-active postfix`, `systemctl is-active dovecot`)
- **Port Checks**: Informational only - check 25, 587, 993 but don't block on results
- **Mail Queue**: Check queue status for operational insights

### Mail Health Check Lambda

```yaml
MailHealthCheckLambda:
  Type: AWS::Lambda::Function
  Properties:
    FunctionName: mail-health-check-hepefoundation-org
    Runtime: python3.11
    Handler: index.handler
    Timeout: 30
    MemorySize: 256
    Environment:
      Variables:
        INSTANCE_ID: !Ref InstanceId
    Code:
      ZipFile: |
        import boto3
        import json
        import time
        import os
        
        ssm = boto3.client('ssm')
        ec2 = boto3.client('ec2')
        
        def check_mail_services(instance_id):
            """
            Check mail service health via SSM.
            Primary checks: service status (postfix, dovecot)
            Secondary checks: port connectivity (informational only - AWS may restrict)
            """
            import time
            
            # Primary health checks - service status
            primary_checks = {
                'postfix': 'systemctl is-active postfix',
                'dovecot': 'systemctl is-active dovecot',
                'mail_queue': 'mailq | head -1 || echo "empty"'
            }
            
            # Secondary checks - port connectivity (informational, non-blocking)
            port_checks = {
                'smtp_25': 'timeout 3 bash -c "</dev/tcp/localhost/25" 2>/dev/null && echo "open" || echo "restricted_or_closed"',
                'smtp_587': 'timeout 3 bash -c "</dev/tcp/localhost/587" 2>/dev/null && echo "open" || echo "restricted_or_closed"',
                'imap_993': 'timeout 3 bash -c "</dev/tcp/localhost/993" 2>/dev/null && echo "open" || echo "restricted_or_closed"'
            }
            
            results = {
                'primary': {},
                'ports': {},
                'healthy': False,
                'health_reason': ''
            }
            
            # Check primary services (these determine health)
            all_primary_healthy = True
            for service, command in primary_checks.items():
                try:
                    response = ssm.send_command(
                        InstanceIds=[instance_id],
                        DocumentName="AWS-RunShellScript",
                        Parameters={'commands': [command]},
                        TimeoutSeconds=10
                    )
                    command_id = response['CommandId']
                    
                    # Wait for command completion
                    time.sleep(2)
                    output = ssm.get_command_invocation(
                        CommandId=command_id,
                        InstanceId=instance_id
                    )
                    
                    status = output.get('Status', 'Failed')
                    stdout = output.get('StandardOutputContent', '').strip()
                    
                    if service in ['postfix', 'dovecot']:
                        is_active = stdout == 'active'
                        results['primary'][service] = {
                            'status': 'active' if is_active else 'inactive',
                            'raw': stdout
                        }
                        if not is_active:
                            all_primary_healthy = False
                    else:  # mail_queue
                        results['primary'][service] = {
                            'status': 'ok' if stdout else 'empty',
                            'raw': stdout[:100]  # Limit output
                        }
                        
                except Exception as e:
                    results['primary'][service] = {
                        'status': 'error',
                        'error': str(e)
                    }
                    if service in ['postfix', 'dovecot']:
                        all_primary_healthy = False
            
            # Check ports (informational only - don't affect health status)
            for port_name, command in port_checks.items():
                try:
                    response = ssm.send_command(
                        InstanceIds=[instance_id],
                        DocumentName="AWS-RunShellScript",
                        Parameters={'commands': [command]},
                        TimeoutSeconds=5
                    )
                    command_id = response['CommandId']
                    time.sleep(1)
                    output = ssm.get_command_invocation(
                        CommandId=command_id,
                        InstanceId=instance_id
                    )
                    stdout = output.get('StandardOutputContent', '').strip()
                    results['ports'][port_name] = {
                        'status': stdout,
                        'note': 'informational_only_aws_may_restrict'
                    }
                except Exception as e:
                    results['ports'][port_name] = {
                        'status': 'check_failed',
                        'error': str(e),
                        'note': 'informational_only_aws_may_restrict'
                    }
            
            # Determine overall health based on primary checks only
            results['healthy'] = all_primary_healthy
            if all_primary_healthy:
                results['health_reason'] = 'All primary services (postfix, dovecot) are active'
            else:
                inactive = [s for s, v in results['primary'].items() 
                           if s in ['postfix', 'dovecot'] and v.get('status') != 'active']
                results['health_reason'] = f'Services inactive: {", ".join(inactive)}'
            
            return results
        
        def handler(event, context):
            instance_id = os.environ['INSTANCE_ID']
            health = check_mail_services(instance_id)
            return {
                'statusCode': 200,
                'body': json.dumps(health)
            }
```

### Smart Restart Lambda Logic

```python
import boto3
import json
import os
from datetime import datetime, timedelta

logs = boto3.client('logs')
dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')

MAINTENANCE_WINDOW_START = 8  # UTC hour
MAINTENANCE_WINDOW_END = 8.25  # UTC hour + 15 minutes
LOG_GROUP = '/aws/lambda/StopStartLambda-hepefoundation-org-stop-start-helper'
EXECUTION_TABLE = 'hepefoundation-restart-executions'

def is_maintenance_window():
    """Check if current time is within scheduled maintenance window"""
    now = datetime.utcnow()
    hour = now.hour + (now.minute / 60.0)
    return MAINTENANCE_WINDOW_START <= hour < MAINTENANCE_WINDOW_END

def is_restart_in_progress():
    """Check CloudWatch Logs for recent Lambda executions"""
    end_time = int(datetime.utcnow().timestamp() * 1000)
    start_time = int((datetime.utcnow() - timedelta(minutes=5)).timestamp() * 1000)
    
    try:
        events = logs.filter_log_events(
            logGroupName=LOG_GROUP,
            startTime=start_time,
            endTime=end_time,
            filterPattern='START RequestId'
        )
        return len(events.get('events', [])) > 0
    except:
        return False

def check_mail_health():
    """Call Mail Health Check Lambda"""
    try:
        response = lambda_client.invoke(
            FunctionName='mail-health-check-hepefoundation-org',
            InvocationType='RequestResponse'
        )
        result = json.loads(response['Payload'].read())
        return result.get('healthy', False)
    except:
        return False  # Assume unhealthy if check fails

def handler(event, context):
    """Smart restart handler with deduplication and health checks"""
    
    # Determine restart reason
    restart_reason = 'scheduled'
    if 'source' in event and event['source'] == 'aws.cloudwatch':
        restart_reason = 'alarm-triggered'
    
    # Check if restart is already in progress
    if is_restart_in_progress():
        print(f"Skipping restart - already in progress (reason: {restart_reason})")
        return {'statusCode': 200, 'body': 'Restart already in progress'}
    
    # Check maintenance window for alarm-triggered restarts
    if restart_reason == 'alarm-triggered' and is_maintenance_window():
        print(f"Suppressing alarm-triggered restart during maintenance window")
        return {'statusCode': 200, 'body': 'Suppressed during maintenance window'}
    
    # Check mail service health before restarting
    if restart_reason == 'alarm-triggered':
        health_result = check_mail_health()
        mail_healthy = health_result.get('healthy', False)
        
        if mail_healthy:
            print(f"Mail services are healthy - skipping restart")
            print(f"Health details: {health_result.get('health_reason', 'N/A')}")
            print(f"Port status (informational): {health_result.get('ports', {})}")
            return {
                'statusCode': 200, 
                'body': json.dumps({
                    'action': 'skipped',
                    'reason': 'Mail services healthy',
                    'health_check': health_result
                })
            }
        else:
            print(f"Mail services unhealthy - proceeding with restart")
            print(f"Health details: {health_result.get('health_reason', 'N/A')}")
    
    # Proceed with restart
    print(f"Proceeding with restart (reason: {restart_reason})")
    # ... existing stop-start logic ...
```

## Deployment Steps

### Step 1: Create Mail Health Check Lambda
```bash
cd Archive/hepefoundation
# Create mail-health-check-lambda.yaml
aws cloudformation deploy \
  --template-file mail-health-check-lambda.yaml \
  --stack-name hepefoundation-org-mail-health-check \
  --capabilities CAPABILITY_NAMED_IAM \
  --profile hepe-admin-mfa \
  --region us-east-1
```

### Step 2: Update Smart Restart Lambda
```bash
# Update stop-start-instance-helper.yaml with smart restart logic
# Deploy updated stack
./deploy-stop-start-helper.sh
```

### Step 3: Update Alarm Stack
```bash
# Update emergency-alarms-stack.yaml with new Lambda references
./deploy-emergency-alarms.sh
```

### Step 4: Verify Integration
```bash
# Run monitoring report
./generate-monitoring-report.sh

# Test mail health check
aws lambda invoke \
  --function-name mail-health-check-hepefoundation-org \
  --profile hepe-admin-mfa \
  --region us-east-1 \
  response.json

# Monitor during next maintenance window
aws logs tail /aws/lambda/StopStartLambda-hepefoundation-org-stop-start-helper --follow
```

## Success Criteria

1. ✅ **No cascading restarts** - Only one restart per maintenance window
2. ✅ **Mail service verification** - Restarts only occur when services are actually down
3. ✅ **Maintenance window respect** - Alarm-triggered restarts suppressed during scheduled maintenance
4. ✅ **Improved uptime** - Mail delivery stays online during scheduled maintenance
5. ✅ **Better observability** - Clear logging of restart reasons and health checks

## Monitoring and Validation

### Key Metrics to Track

1. **Restart Frequency**: Should be 1 per day (scheduled), not 3-4
2. **Mail Service Health**: Track health check results over time (service status only)
3. **Port Connectivity**: Track port status for informational purposes (non-blocking)
4. **False Alarm Rate**: Alarms suppressed during maintenance windows
5. **Uptime**: Mail service availability during maintenance windows

### Port 25 Considerations

**Important**: AWS may restrict port 25 on EC2 instances:
- **Outbound port 25**: Blocked by default (can request removal)
- **Inbound port 25**: May be restricted depending on account/region
- **Solution**: Port checks are **informational only** and **non-blocking**
- **Primary Health Indicator**: Service status (postfix/dovecot systemctl checks)
- **Fallback Ports**: Check 587 (submission), 993 (IMAP), 995 (POP3) for connectivity

### Validation Tests

1. **Maintenance Window Test**: Verify alarms don't trigger restarts during 8:00-8:15 UTC
2. **Health Check Test**: Verify restarts only occur when mail services are actually down
3. **Deduplication Test**: Verify concurrent alarm triggers don't cause multiple restarts
4. **Scheduled Restart Test**: Verify scheduled restarts still work correctly

## Risk Mitigation

1. **Rollback Plan**: Keep current Lambda code as backup
2. **Gradual Rollout**: Deploy to alarm stack first, monitor for 1 week
3. **Health Check Fallback**: If health check fails, default to allowing restart (fail-safe)
4. **Monitoring**: Enhanced logging and metrics for troubleshooting

## Timeline

- **Phase 1** (Mail Health Check): 2-3 hours
- **Phase 2** (Smart Restart Lambda): 4-6 hours
- **Phase 3** (Alarm Stack Updates): 2-3 hours
- **Phase 4** (Monitoring): 2-3 hours
- **Testing & Validation**: 1-2 days
- **Total**: 2-3 days

## Next Steps

1. Review and approve this plan
2. Implement Phase 1 (Mail Health Check Lambda)
3. Test mail health check functionality
4. Implement Phase 2 (Smart Restart Lambda)
5. Deploy and monitor for 1 week
6. Adjust based on monitoring results

