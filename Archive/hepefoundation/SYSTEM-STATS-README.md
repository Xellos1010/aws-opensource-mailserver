# System Statistics Reporting

**Lambda Function:** `system-stats-hepefoundation-org-system-stats`  
**Purpose:** Collect comprehensive system statistics for operational monitoring

## Quick Start

### Get System Stats (Simple)
```bash
cd Archive/hepefoundation
./get-system-stats.sh
```

### Get System Stats (Direct Lambda)
```bash
aws lambda invoke \
  --function-name system-stats-hepefoundation-org-system-stats \
  --profile hepe-admin-mfa \
  --region us-east-1 \
  /tmp/stats.json && cat /tmp/stats.json | jq -r '.body' | jq -r '.stats' | jq .
```

## Statistics Collected

### Memory Statistics
- Total memory
- Used memory
- Free memory
- Available memory
- Cache memory
- Usage percentage
- Available percentage

### Disk Statistics
- Total disk space
- Used disk space
- Free disk space
- Usage percentage

### CPU & Load Statistics
- CPU cores
- Load average (1min, 5min, 15min)

### Service Status
- Postfix (mail server)
- Dovecot (IMAP/POP3)
- Nginx (web server)
- SSM Agent

### Mail Queue Statistics
- Queue size (number of messages)

### Network Statistics
- Active connections
- TCP connections

### Process Statistics
- Top 5 memory-consuming processes
- Total process count

### System Uptime
- Days, hours, minutes since last boot

### Health Score
- Overall health score (0-100)
- List of detected issues
- Operational recommendations

## Health Score Calculation

The health score starts at 100 and is reduced based on issues:

- **Low memory** (<10% available): -30 points
- **Memory getting low** (<20% available): -15 points
- **Disk nearly full** (>95%): -30 points
- **Disk getting full** (>90%): -15 points
- **Postfix inactive**: -25 points
- **Dovecot inactive**: -25 points
- **Nginx inactive**: -10 points
- **Large mail queue** (>100 messages): -10 points

### Health Score Interpretation

- **90-100**: Excellent - No issues
- **75-89**: Good - Minor issues
- **50-74**: Fair - Some issues need attention
- **25-49**: Poor - Significant issues
- **0-24**: Critical - Immediate action required

## Operational Use Cases

### Check if Mail Server is Down
```bash
./get-system-stats.sh | grep -A 5 "SERVICES"
```

Look for:
- ✅ Postfix: active
- ✅ Dovecot: active

If either shows "inactive" or "failed", the mail server is down.

### Check Memory Pressure
```bash
./get-system-stats.sh | grep -A 10 "MEMORY"
```

Look for:
- Available percentage < 20% = Low memory
- Available percentage < 10% = Critical memory

### Check Disk Space
```bash
./get-system-stats.sh | grep -A 5 "DISK"
```

Look for:
- Usage > 95% = Critical
- Usage > 90% = Warning

### Check Mail Queue
```bash
./get-system-stats.sh | grep -A 3 "MAIL QUEUE"
```

Look for:
- Queue size > 100 = Large queue (potential delivery issues)
- Queue size > 50 = Growing queue (monitor)

## Scheduled Monitoring

### Option 1: EventBridge Schedule (Recommended)
Create an EventBridge rule to invoke the Lambda on a schedule:

```bash
aws events put-rule \
  --name system-stats-schedule \
  --schedule-expression "rate(5 minutes)" \
  --profile hepe-admin-mfa \
  --region us-east-1

aws lambda add-permission \
  --function-name system-stats-hepefoundation-org-system-stats \
  --statement-id allow-eventbridge \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:us-east-1:413988044972:rule/system-stats-schedule \
  --profile hepe-admin-mfa \
  --region us-east-1

aws events put-targets \
  --rule system-stats-schedule \
  --targets "Id=1,Arn=arn:aws:lambda:us-east-1:413988044972:function:system-stats-hepefoundation-org-system-stats" \
  --profile hepe-admin-mfa \
  --region us-east-1
```

### Option 2: CloudWatch Alarm Integration
Use the stats Lambda output to create CloudWatch alarms for:
- Memory usage > 80%
- Disk usage > 90%
- Service status != active
- Mail queue > 100

## Output Format

### Human-Readable Format
The `get-system-stats.sh` script provides formatted, human-readable output with:
- Color-coded status indicators
- Warnings for critical conditions
- Operational recommendations

### JSON Format
The Lambda returns structured JSON:
```json
{
  "success": true,
  "stats": {
    "timestamp": "2025-12-10T02:22:07Z",
    "memory": {
      "total_bytes": 1003794432,
      "used_bytes": 643911680,
      "available_bytes": 139894784,
      "usage_percent": 64,
      "available_percent": 13
    },
    "disk": {
      "total_bytes": 8132173824,
      "used_bytes": 7292706816,
      "free_bytes": 822689792,
      "usage_percent": 90
    },
    "services": {
      "postfix": "active",
      "dovecot": "active",
      "nginx": "active"
    },
    "health": {
      "score": 75,
      "issues": ["Disk getting full (90%)"]
    }
  }
}
```

## Integration with Recovery System

The system stats Lambda can be integrated with the recovery orchestrator to:
1. **Pre-flight checks** - Check system state before recovery
2. **Post-recovery validation** - Verify recovery success
3. **Health monitoring** - Continuous health assessment
4. **Alerting** - Trigger alerts based on health score

## Files

- `system-stats-lambda.yaml` - Lambda definition
- `deploy-system-stats.sh` - Deployment script
- `get-system-stats.sh` - Helper script for easy access
- `SYSTEM-STATS-README.md` - This documentation

## Troubleshooting

### Lambda Returns "Failed" Status
- Check SSM agent is online: `aws ssm describe-instance-information --filters "Key=InstanceIds,Values=i-0a1ff83f513575ed4"`
- Check Lambda logs: `aws logs tail /aws/lambda/system-stats-hepefoundation-org-system-stats --follow`

### Stats JSON is Null
- Check stdout output for errors
- Verify shell script syntax in Lambda code
- Check SSM command execution logs

### Health Score Seems Incorrect
- Review health score calculation logic
- Check individual metric thresholds
- Verify service status detection

## Next Steps

1. ✅ System stats Lambda deployed
2. ⏳ Set up EventBridge schedule for regular monitoring
3. ⏳ Create CloudWatch alarms based on health score
4. ⏳ Integrate with recovery orchestrator for pre/post recovery checks









