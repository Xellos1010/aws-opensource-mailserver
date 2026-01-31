#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Diagnostic script to check box.k3frame.com reachability
# Checks instance state, service status, and connectivity

DOMAIN="k3frame.com"
BOX_HOST="box.k3frame.com"
STACK_NAME="hepefoundation-org-mailserver"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"
INSTANCE_ID="i-0a1ff83f513575ed4"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo "=========================================="
echo "Box Reachability Diagnostic"
echo "=========================================="
echo "Domain: ${DOMAIN}"
echo "Box Host: ${BOX_HOST}"
echo "Instance: ${INSTANCE_ID}"
echo "=========================================="
echo ""

# Check instance state
echo "📋 Step 1: Checking Instance State"
echo "----------------------------------------"
INSTANCE_STATE=$(aws ec2 describe-instances \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --query 'Reservations[0].Instances[0].State.Name' \
    --output text 2>/dev/null)

INSTANCE_IP=$(aws ec2 describe-instances \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text 2>/dev/null)

echo "Instance State: ${INSTANCE_STATE}"
echo "Instance IP: ${INSTANCE_IP}"
if [ "$INSTANCE_STATE" = "running" ]; then
    echo -e "${GREEN}✓ Instance is running${NC}"
else
    echo -e "${RED}✗ Instance is ${INSTANCE_STATE}${NC}"
fi
echo ""

# Check instance status checks
echo "📋 Step 2: Checking Instance Status Checks"
echo "----------------------------------------"
STATUS_CHECKS=$(aws ec2 describe-instance-status \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --include-all-instances \
    --query 'InstanceStatuses[0]' \
    --output json 2>/dev/null)

if [ -n "$STATUS_CHECKS" ] && [ "$STATUS_CHECKS" != "null" ]; then
    SYSTEM_STATUS=$(echo "$STATUS_CHECKS" | jq -r '.SystemStatus.Status // "unknown"')
    INSTANCE_STATUS=$(echo "$STATUS_CHECKS" | jq -r '.InstanceStatus.Status // "unknown"')
    
    echo "System Status: ${SYSTEM_STATUS}"
    echo "Instance Status: ${INSTANCE_STATUS}"
    
    if [ "$SYSTEM_STATUS" = "ok" ] && [ "$INSTANCE_STATUS" = "ok" ]; then
        echo -e "${GREEN}✓ All status checks passing${NC}"
    else
        echo -e "${YELLOW}⚠ Status checks not passing${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Could not retrieve status checks${NC}"
fi
echo ""

# Check service status via SSM
echo "📋 Step 3: Checking Mail Service Status"
echo "----------------------------------------"
if [ "$INSTANCE_STATE" = "running" ]; then
    echo "Checking postfix, dovecot, and nginx service status..."
    
    SERVICE_CHECK_COMMAND='systemctl is-active postfix dovecot nginx 2>/dev/null || echo "check_failed"'
    
    COMMAND_ID=$(aws ssm send-command \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --instance-ids "${INSTANCE_ID}" \
        --document-name "AWS-RunShellScript" \
        --parameters "commands=[${SERVICE_CHECK_COMMAND}]" \
        --query 'Command.CommandId' \
        --output text 2>/dev/null)
    
    if [ -n "$COMMAND_ID" ]; then
        echo "Waiting for command to complete..."
        sleep 5
        
        COMMAND_OUTPUT=$(aws ssm get-command-invocation \
            --profile "${PROFILE}" \
            --region "${REGION}" \
            --command-id "${COMMAND_ID}" \
            --instance-id "${INSTANCE_ID}" \
            --query 'StandardOutputContent' \
            --output text 2>/dev/null || echo "")
        
        if [ -n "$COMMAND_OUTPUT" ]; then
            echo "Service Status:"
            echo "$COMMAND_OUTPUT" | while read -r line; do
                if echo "$line" | grep -q "active"; then
                    echo -e "  ${GREEN}✓${NC} $line"
                elif echo "$line" | grep -q "inactive\|failed"; then
                    echo -e "  ${RED}✗${NC} $line"
                else
                    echo "  $line"
                fi
            done
            
            # Check if all services are active
            ACTIVE_COUNT=$(echo "$COMMAND_OUTPUT" | grep -c "active" || echo "0")
            if [ "$ACTIVE_COUNT" -ge 2 ]; then
                echo -e "${GREEN}✓ Mail services appear to be running${NC}"
            else
                echo -e "${RED}✗ Some mail services are not active${NC}"
            fi
        else
            echo -e "${YELLOW}⚠ Could not retrieve service status${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ Could not send SSM command (SSM agent may not be running)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Instance is not running - cannot check services${NC}"
fi
echo ""

# Check DNS resolution
echo "📋 Step 4: Checking DNS Resolution"
echo "----------------------------------------"
if command -v dig >/dev/null 2>&1; then
    DNS_RESULT=$(dig +short "${BOX_HOST}" 2>/dev/null || echo "")
    if [ -n "$DNS_RESULT" ]; then
        echo -e "${GREEN}✓ DNS resolves: ${BOX_HOST} -> ${DNS_RESULT}${NC}"
    else
        echo -e "${RED}✗ DNS does not resolve for ${BOX_HOST}${NC}"
    fi
else
    echo -e "${YELLOW}⚠ dig command not available - skipping DNS check${NC}"
fi
echo ""

# Check connectivity
echo "📋 Step 5: Checking Connectivity"
echo "----------------------------------------"
if [ -n "$INSTANCE_IP" ] && [ "$INSTANCE_IP" != "None" ]; then
    echo "Testing connectivity to ${BOX_HOST} (${INSTANCE_IP})..."
    
    # Test HTTP/HTTPS (port 80/443)
    if command -v curl >/dev/null 2>&1; then
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://${BOX_HOST}" 2>/dev/null || echo "000")
        HTTPS_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 -k "https://${BOX_HOST}" 2>/dev/null || echo "000")
        
        if [ "$HTTP_CODE" != "000" ]; then
            echo -e "  ${GREEN}✓ HTTP (port 80): ${HTTP_CODE}${NC}"
        else
            echo -e "  ${RED}✗ HTTP (port 80): Connection failed${NC}"
        fi
        
        if [ "$HTTPS_CODE" != "000" ]; then
            echo -e "  ${GREEN}✓ HTTPS (port 443): ${HTTPS_CODE}${NC}"
        else
            echo -e "  ${RED}✗ HTTPS (port 443): Connection failed${NC}"
        fi
    else
        echo -e "  ${YELLOW}⚠ curl not available - skipping HTTP checks${NC}"
    fi
    
    # Test SSH (port 22)
    if command -v nc >/dev/null 2>&1; then
        if nc -z -w 3 "${BOX_HOST}" 22 2>/dev/null; then
            echo -e "  ${GREEN}✓ SSH (port 22): Open${NC}"
        else
            echo -e "  ${YELLOW}⚠ SSH (port 22): Closed or filtered${NC}"
        fi
    else
        echo -e "  ${YELLOW}⚠ nc (netcat) not available - skipping SSH check${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Instance IP not available - skipping connectivity checks${NC}"
fi
echo ""

# Check recent alarms
echo "📋 Step 6: Checking Recent Alarms"
echo "----------------------------------------"
ALARM_NAMES=(
    "InstanceStatusCheck-${INSTANCE_ID}"
    "SystemStatusCheck-${INSTANCE_ID}"
    "OOMKillDetected-${INSTANCE_ID}"
)

for ALARM_NAME in "${ALARM_NAMES[@]}"; do
    ALARM_STATE=$(aws cloudwatch describe-alarms \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --alarm-names "${ALARM_NAME}" \
        --query 'MetricAlarms[0].StateValue' \
        --output text 2>/dev/null || echo "None")
    
    if [ "$ALARM_STATE" = "ALARM" ]; then
        echo -e "  ${RED}🚨 ${ALARM_NAME}: ${ALARM_STATE}${NC}"
    elif [ "$ALARM_STATE" = "OK" ]; then
        echo -e "  ${GREEN}✓ ${ALARM_NAME}: ${ALARM_STATE}${NC}"
    else
        echo -e "  ${YELLOW}⚠ ${ALARM_NAME}: ${ALARM_STATE}${NC}"
    fi
done
echo ""

# Summary and recommendations
echo "=========================================="
echo "Summary & Recommendations"
echo "=========================================="
echo ""

if [ "$INSTANCE_STATE" != "running" ]; then
    echo -e "${RED}CRITICAL: Instance is ${INSTANCE_STATE}${NC}"
    echo "  → Action: Start the instance or wait for it to start"
elif [ -n "$COMMAND_OUTPUT" ] && echo "$COMMAND_OUTPUT" | grep -q "inactive\|failed"; then
    echo -e "${YELLOW}WARNING: Some mail services are not active${NC}"
    echo "  → Action: Restart mail services using service restart Lambda"
    echo "  → Command: aws lambda invoke --function-name service-restart-hepefoundation-org-service-restart --profile ${PROFILE} --region ${REGION} /dev/stdout"
else
    echo -e "${GREEN}Instance appears to be running and services may be active${NC}"
    echo "  → If box.k3frame.com is still not reachable, check:"
    echo "    1. DNS configuration"
    echo "    2. Security group rules"
    echo "    3. Network ACLs"
    echo "    4. Firewall rules on the instance"
fi
echo ""









