#!/bin/bash
#
# Rollback NSD binding to private IP
# This script reverts NSD configuration to bind to private IP 172.31.13.233
# Use this if external DNS queries are blocked and causing service disruption
#

set -e

INSTANCE_ID="i-03c6b291756af0128"
REGION="us-east-1"
PROFILE="k3frame"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 Rolling Back NSD Binding Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This will revert NSD to bind to private IP: 172.31.13.233"
echo "Services will remain accessible via IP addresses"
echo ""

read -p "Continue with rollback? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Rollback cancelled"
    exit 0
fi

echo "📋 Step 1: Reverting NSD configuration..."

COMMAND_ID=$(aws ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters 'commands=[
        "cp /etc/nsd/nsd.conf /etc/nsd/nsd.conf.public-ip.backup",
        "sed -i \"s/ip-address: 18.210.29.62/ip-address: 172.31.13.233/\" /etc/nsd/nsd.conf",
        "cat > /etc/nsd/nsd.conf.d/zones.conf <<\"ZONES\"\n\nzone:\n\tname: box.k3frame.com\n\tzonefile: box.k3frame.com.txt.signed\nZONES",
        "echo \"=== Updated NSD Config ===\"",
        "grep -A 2 \"ip-address\" /etc/nsd/nsd.conf",
        "echo \"\"",
        "echo \"=== Updated Zones ===\"",
        "cat /etc/nsd/nsd.conf.d/zones.conf",
        "echo \"\"",
        "echo \"=== Restarting NSD ===\"",
        "systemctl restart nsd",
        "sleep 3",
        "echo \"\"",
        "echo \"=== NSD Status ===\"",
        "systemctl status nsd --no-pager | head -15",
        "echo \"\"",
        "echo \"=== Verify zone status ===\"",
        "nsd-control zonestatus box.k3frame.com 2>&1"
    ]' \
    --region "$REGION" \
    --profile "$PROFILE" \
    --output text \
    --query 'Command.CommandId')

echo "✅ Rollback command sent: $COMMAND_ID"
echo "⏳ Waiting for completion..."

sleep 8

echo ""
echo "📋 Step 2: Getting rollback results..."
echo ""

aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --region "$REGION" \
    --profile "$PROFILE" \
    --query 'StandardOutputContent' \
    --output text

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Rollback Complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "NSD is now bound to private IP only."
echo "You should update your Namecheap nameservers back to previous values."
echo ""
echo "To re-apply public binding after fixing network issues:"
echo "  • Check Network ACLs for port 53 UDP/TCP"
echo "  • Ensure no additional firewalls blocking DNS"
echo "  • Run the forward script (to be created)"
echo ""
