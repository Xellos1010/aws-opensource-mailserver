#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Get system statistics report for hepefoundation.org mail server

FUNCTION_NAME="system-stats-hepefoundation-org-system-stats"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"
OUTPUT_FILE="/tmp/system-stats-$(date +%Y%m%d-%H%M%S).json"

echo "=========================================="
echo "System Statistics Report"
echo "=========================================="
echo "Instance: hepefoundation.org mail server"
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=========================================="
echo ""

# Invoke Lambda
echo "📋 Collecting system statistics..."
aws lambda invoke \
    --function-name "${FUNCTION_NAME}" \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    "${OUTPUT_FILE}" > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to invoke Lambda function"
    exit 1
fi

# Parse response
RESPONSE_BODY=$(cat "${OUTPUT_FILE}" | jq -r '.body' 2>/dev/null)
if [ -z "$RESPONSE_BODY" ] || [ "$RESPONSE_BODY" = "null" ]; then
    echo "❌ Error: Invalid response from Lambda"
    cat "${OUTPUT_FILE}"
    exit 1
fi

# Check if stats collection was successful
SUCCESS=$(echo "$RESPONSE_BODY" | jq -r '.success // false')
if [ "$SUCCESS" != "true" ]; then
    echo "❌ Error: Stats collection failed"
    echo "$RESPONSE_BODY" | jq .
    exit 1
fi

# Extract stats JSON
STATS=$(echo "$RESPONSE_BODY" | jq -r '.stats // empty')

if [ -z "$STATS" ] || [ "$STATS" = "null" ]; then
    echo "⚠️  Warning: No stats JSON found, showing full output:"
    echo "$RESPONSE_BODY" | jq .
    exit 0
fi

# Display formatted stats
echo "✅ Statistics collected successfully"
echo ""
echo "=========================================="
echo "SYSTEM STATISTICS"
echo "=========================================="
echo ""

# Memory
echo "📊 MEMORY"
echo "----------------------------------------"
MEM_USAGE=$(echo "$STATS" | jq -r '.memory.usage_percent // "0"')
MEM_AVAIL=$(echo "$STATS" | jq -r '.memory.available_percent // "0"')
MEM_TOTAL=$(echo "$STATS" | jq -r '.memory.total_bytes // "0"')
MEM_USED=$(echo "$STATS" | jq -r '.memory.used_bytes // "0"')
MEM_AVAIL_BYTES=$(echo "$STATS" | jq -r '.memory.available_bytes // "0"')

echo "Usage: ${MEM_USAGE}%"
echo "Available: ${MEM_AVAIL}%"
# Format bytes to human-readable (works on macOS and Linux)
format_bytes() {
    local bytes=$1
    if command -v numfmt >/dev/null 2>&1; then
        numfmt --to=iec-i --suffix=B ${bytes}
    else
        # Fallback for macOS
        if [ ${bytes} -ge 1073741824 ]; then
            echo "$(echo "scale=2; ${bytes}/1073741824" | bc)GB"
        elif [ ${bytes} -ge 1048576 ]; then
            echo "$(echo "scale=2; ${bytes}/1048576" | bc)MB"
        elif [ ${bytes} -ge 1024 ]; then
            echo "$(echo "scale=2; ${bytes}/1024" | bc)KB"
        else
            echo "${bytes}B"
        fi
    fi
}

echo "Total: $(format_bytes ${MEM_TOTAL})"
echo "Used: $(format_bytes ${MEM_USED})"
echo "Available: $(format_bytes ${MEM_AVAIL_BYTES})"

if [ "${MEM_AVAIL}" -lt 10 ]; then
    echo "⚠️  WARNING: Low memory available!"
elif [ -n "${MEM_AVAIL}" ] && [ "${MEM_AVAIL}" != "null" ] && [ "${MEM_AVAIL}" -lt 20 ] 2>/dev/null; then
    echo "⚠️  CAUTION: Memory getting low"
fi
echo ""

# Disk
echo "💾 DISK"
echo "----------------------------------------"
DISK_USAGE=$(echo "$STATS" | jq -r '.disk.usage_percent // "0"')
DISK_TOTAL=$(echo "$STATS" | jq -r '.disk.total_bytes // "0"')
DISK_USED=$(echo "$STATS" | jq -r '.disk.used_bytes // "0"')
DISK_FREE=$(echo "$STATS" | jq -r '.disk.free_bytes // "0"')

echo "Usage: ${DISK_USAGE}%"
echo "Total: $(format_bytes ${DISK_TOTAL})"
echo "Used: $(format_bytes ${DISK_USED})"
echo "Free: $(format_bytes ${DISK_FREE})"

if [ "${DISK_USAGE}" -gt 95 ]; then
    echo "🚨 CRITICAL: Disk nearly full!"
elif [ "${DISK_USAGE}" -gt 90 ]; then
    echo "⚠️  WARNING: Disk getting full"
fi
echo ""

# CPU and Load
echo "⚙️  CPU & LOAD"
echo "----------------------------------------"
CPU_CORES=$(echo "$STATS" | jq -r '.cpu.cores // "1"')
LOAD_1=$(echo "$STATS" | jq -r '.cpu.load_1min // "0"')
LOAD_5=$(echo "$STATS" | jq -r '.cpu.load_5min // "0"')
LOAD_15=$(echo "$STATS" | jq -r '.cpu.load_15min // "0"')

echo "CPU Cores: ${CPU_CORES}"
echo "Load Average (1min): ${LOAD_1}"
echo "Load Average (5min): ${LOAD_5}"
echo "Load Average (15min): ${LOAD_15}"

if [ -n "${CPU_CORES}" ] && [ "${CPU_CORES}" != "null" ] && [ -n "${LOAD_1}" ] && [ "${LOAD_1}" != "null" ]; then
    LOAD_THRESHOLD=$(echo "${CPU_CORES} * 2" | bc 2>/dev/null || echo "2")
    if command -v bc >/dev/null 2>&1 && (( $(echo "${LOAD_1} > ${LOAD_THRESHOLD}" | bc -l 2>/dev/null || echo "0") )); then
        echo "⚠️  WARNING: High load detected"
    fi
fi
echo ""

# Services
echo "🔧 SERVICES"
echo "----------------------------------------"
POSTFIX=$(echo "$STATS" | jq -r '.services.postfix // "unknown"')
DOVECOT=$(echo "$STATS" | jq -r '.services.dovecot // "unknown"')
NGINX=$(echo "$STATS" | jq -r '.services.nginx // "unknown"')
SSM=$(echo "$STATS" | jq -r '.services.ssm_agent // "unknown"')

if [ "$POSTFIX" = "active" ]; then
    echo "✅ Postfix: ${POSTFIX}"
else
    echo "❌ Postfix: ${POSTFIX} (NOT ACTIVE!)"
fi

if [ "$DOVECOT" = "active" ]; then
    echo "✅ Dovecot: ${DOVECOT}"
else
    echo "❌ Dovecot: ${DOVECOT} (NOT ACTIVE!)"
fi

if [ "$NGINX" = "active" ]; then
    echo "✅ Nginx: ${NGINX}"
else
    echo "⚠️  Nginx: ${NGINX}"
fi

if [ "$SSM" = "active" ]; then
    echo "✅ SSM Agent: ${SSM}"
else
    echo "⚠️  SSM Agent: ${SSM}"
fi
echo ""

# Mail Queue
echo "📧 MAIL QUEUE"
echo "----------------------------------------"
MAILQ_SIZE=$(echo "$STATS" | jq -r '.mail_queue.size // "0"')
echo "Queue Size: ${MAILQ_SIZE} messages"

if [ "${MAILQ_SIZE}" -gt 100 ]; then
    echo "⚠️  WARNING: Large mail queue detected"
elif [ -n "${MAILQ_SIZE}" ] && [ "${MAILQ_SIZE}" != "null" ] && [ "${MAILQ_SIZE}" -gt 50 ] 2>/dev/null; then
    echo "⚠️  CAUTION: Mail queue growing"
fi
echo ""

# Uptime
echo "⏱️  UPTIME"
echo "----------------------------------------"
UPTIME_SEC=$(echo "$STATS" | jq -r '.uptime_seconds // "0"')
UPTIME_DAYS=$((UPTIME_SEC / 86400))
UPTIME_HOURS=$(((UPTIME_SEC % 86400) / 3600))
UPTIME_MIN=$(((UPTIME_SEC % 3600) / 60))
echo "${UPTIME_DAYS} days, ${UPTIME_HOURS} hours, ${UPTIME_MIN} minutes"
echo ""

# Health Score
echo "🏥 HEALTH SCORE"
echo "----------------------------------------"
HEALTH_SCORE=$(echo "$STATS" | jq -r '.health.score // "100"')
HEALTH_ISSUES=$(echo "$STATS" | jq -r '.health.issues[]?' 2>/dev/null || echo "")

echo "Score: ${HEALTH_SCORE}/100"

if [ "${HEALTH_SCORE}" -ge 90 ]; then
    echo "✅ Status: EXCELLENT"
elif [ "${HEALTH_SCORE}" -ge 75 ]; then
    echo "✅ Status: GOOD"
elif [ "${HEALTH_SCORE}" -ge 50 ]; then
    echo "⚠️  Status: FAIR"
elif [ "${HEALTH_SCORE}" -ge 25 ]; then
    echo "⚠️  Status: POOR"
else
    echo "🚨 Status: CRITICAL"
fi

if [ -n "$HEALTH_ISSUES" ]; then
    echo ""
    echo "Issues:"
    echo "$HEALTH_ISSUES" | while read -r issue; do
        echo "  - ${issue}"
    done
fi
echo ""

# Operational Recommendations
echo "=========================================="
echo "OPERATIONAL RECOMMENDATIONS"
echo "=========================================="
echo ""

RECOMMENDATIONS=()

if [ -n "${MEM_AVAIL}" ] && [ "${MEM_AVAIL}" != "null" ] && [ "${MEM_AVAIL}" -lt 10 ] 2>/dev/null; then
    RECOMMENDATIONS+=("Consider system reset to free memory")
fi

if [ -n "${DISK_USAGE}" ] && [ "${DISK_USAGE}" != "null" ] && [ "${DISK_USAGE}" -gt 95 ] 2>/dev/null; then
    RECOMMENDATIONS+=("URGENT: Disk cleanup needed - system reset may help")
elif [ -n "${DISK_USAGE}" ] && [ "${DISK_USAGE}" != "null" ] && [ "${DISK_USAGE}" -gt 90 ] 2>/dev/null; then
    RECOMMENDATIONS+=("Disk cleanup recommended")
fi

if [ "$POSTFIX" != "active" ] || [ "$DOVECOT" != "active" ]; then
    RECOMMENDATIONS+=("Mail services down - trigger system reset or service restart")
fi

if [ -n "${MAILQ_SIZE}" ] && [ "${MAILQ_SIZE}" != "null" ] && [ "${MAILQ_SIZE}" -gt 100 ] 2>/dev/null; then
    RECOMMENDATIONS+=("Large mail queue - check for delivery issues")
fi

if [ ${#RECOMMENDATIONS[@]} -eq 0 ]; then
    echo "✅ No immediate action required"
else
    for rec in "${RECOMMENDATIONS[@]}"; do
        echo "  • ${rec}"
    done
fi

echo ""
echo "=========================================="
echo "Full JSON output saved to: ${OUTPUT_FILE}"
echo "=========================================="
echo ""
echo "To view full JSON:"
echo "  cat ${OUTPUT_FILE} | jq -r '.body' | jq -r '.stats' | jq ."
echo ""

