#!/bin/bash
#
# Apply NSD public IP binding configuration
# This script configures NSD to bind to public IP 18.210.29.62
# Use this after fixing network issues that prevent external DNS queries
#

set -e

INSTANCE_ID="i-03c6b291756af0128"
REGION="us-east-1"
PROFILE="k3frame"
PUBLIC_IP="18.210.29.62"
PRIVATE_IP="172.31.13.233"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Applying NSD Public Binding Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This will configure NSD to bind to public IP: $PUBLIC_IP"
echo "and enable serving the k3frame.com zone"
echo ""
echo "⚠️  Prerequisites:"
echo "   • DNS queries to $PUBLIC_IP:53 must be reachable externally"
echo "   • Nameservers must be set at registrar:"
echo "     - ns1.box.k3frame.com → $PUBLIC_IP"
echo "     - ns2.box.k3frame.com → $PUBLIC_IP"
echo ""

read -p "Continue with public binding? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Operation cancelled"
    exit 0
fi

echo "📋 Step 1: Testing external DNS reachability..."
echo "   Attempting to query $PUBLIC_IP:53 from this machine..."

if timeout 5 dig @$PUBLIC_IP version.bind chaos txt +short 2>&1 | grep -q "NSD"; then
    echo "   ✅ External DNS queries are reaching NSD"
elif timeout 5 nc -zvu $PUBLIC_IP 53 2>&1 | grep -q "succeeded\|open"; then
    echo "   ⚠️  Port 53 UDP is reachable but NSD may not be responding"
    echo "   Continuing anyway..."
else
    echo "   ❌ WARNING: Cannot reach $PUBLIC_IP:53 from this machine"
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Operation cancelled"
        exit 1
    fi
fi

echo ""
echo "📋 Step 2: Applying NSD configuration..."

COMMAND_ID=$(aws ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters 'commands=[
        "cp /etc/nsd/nsd.conf /etc/nsd/nsd.conf.private-ip.backup",
        "sed -i \"s/ip-address: 172.31.13.233/ip-address: 18.210.29.62/\" /etc/nsd/nsd.conf",
        "cat > /etc/nsd/nsd.conf.d/zones.conf <<\"ZONES\"\n\nzone:\n\tname: box.k3frame.com\n\tzonefile: box.k3frame.com.txt.signed\n\nzone:\n\tname: k3frame.com\n\tzonefile: k3frame.com.txt\nZONES",
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
        "echo \"=== Check listening ports ===\"",
        "ss -tuln | grep :53",
        "echo \"\"",
        "echo \"=== Verify zones loaded ===\"",
        "nsd-control zonestatus box.k3frame.com 2>&1",
        "echo \"\"",
        "nsd-control zonestatus k3frame.com 2>&1",
        "echo \"\"",
        "echo \"=== Test local DNS query ===\"",
        "dig @127.0.0.1 k3frame.com A +short 2>&1 || echo \"Local query failed\"",
        "echo \"\"",
        "echo \"=== Query statistics ===\"",
        "nsd-control stats | grep \"num.queries\""
    ]' \
    --region "$REGION" \
    --profile "$PROFILE" \
    --output text \
    --query 'Command.CommandId')

echo "✅ Configuration command sent: $COMMAND_ID"
echo "⏳ Waiting for completion..."

sleep 10

echo ""
echo "📋 Step 3: Getting configuration results..."
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
echo "📋 Step 4: Testing external DNS resolution..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Testing direct query to nameserver IP:"
echo "  dig @$PUBLIC_IP k3frame.com A +short"
dig @$PUBLIC_IP k3frame.com A +short 2>&1 | head -10 || echo "Direct query failed"

echo ""
echo "Testing via nameserver hostname (requires delegation):"
echo "  dig @ns1.box.k3frame.com k3frame.com A +short"
dig @ns1.box.k3frame.com k3frame.com A +short 2>&1 | head -10 || echo "Nameserver query failed (may need DNS propagation)"

echo ""
echo "Testing public DNS resolution:"
echo "  dig k3frame.com A +short"
dig k3frame.com A +short 2>&1 | head -10 || echo "Public resolution failed (may need DNS propagation)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Configuration Applied"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "NSD is now bound to public IP: $PUBLIC_IP"
echo "Nameservers configured: ns1.box.k3frame.com, ns2.box.k3frame.com"
echo ""
echo "⏳ DNS propagation may take 1-48 hours"
echo ""
echo "Next steps:"
echo "  1. Wait for DNS propagation"
echo "  2. Verify DNS resolution: dig @$PUBLIC_IP k3frame.com A"
echo "  3. Attempt SSL provisioning when DNS is working"
echo ""
echo "If external DNS queries fail, investigate:"
echo "  • AWS Network ACLs"
echo "  • Additional firewall rules"
echo "  • AWS DNS server restrictions on EC2"
echo "  • Consider using Route53 for DNS management instead"
echo ""
echo "To rollback:"
echo "  bash /Users/evanmccall/Projects/aws-opensource-mailserver/tools/rollback-nsd-binding.sh"
echo ""
