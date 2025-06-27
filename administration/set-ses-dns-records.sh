#!/bin/bash

# Exit on error
set -e

# Default domain name
DEFAULT_DOMAIN="emcnotary.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Validate domain name format
if ! [[ $DOMAIN_NAME =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
    echo "Error: Invalid domain name format. Must match pattern: ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$"
    echo "Example: example.com"
    exit 1
fi

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"  # Adjust if your stack is in a different region

echo "Setting SES DNS records for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
    exit 1
fi

# Check if curl is installed
if ! command -v curl &> /dev/null; then
    echo "Error: curl is not installed"
    exit 1
fi

# Get stack outputs
echo "Retrieving stack outputs..."
STACK_OUTPUTS=$(aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].Outputs' \
    --output json)

if [ -z "$STACK_OUTPUTS" ]; then
    echo "Error: Could not retrieve stack outputs for ${STACK_NAME}"
    exit 1
fi

# Extract SES DNS records from outputs
DKIM_TOKEN_NAME_1=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenName1") | .OutputValue')
DKIM_TOKEN_VALUE_1=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenValue1") | .OutputValue')
DKIM_TOKEN_NAME_2=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenName2") | .OutputValue')
DKIM_TOKEN_VALUE_2=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenValue2") | .OutputValue')
DKIM_TOKEN_NAME_3=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenName3") | .OutputValue')
DKIM_TOKEN_VALUE_3=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenValue3") | .OutputValue')
MAIL_FROM_DOMAIN=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="MailFromDomain") | .OutputValue')
MAIL_FROM_MX=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="MailFromMXRecord") | .OutputValue')
MAIL_FROM_TXT=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="MailFromTXTRecord") | .OutputValue')

# Validate required outputs
if [ -z "$DKIM_TOKEN_NAME_1" ] || [ -z "$DKIM_TOKEN_VALUE_1" ] || \
   [ -z "$DKIM_TOKEN_NAME_2" ] || [ -z "$DKIM_TOKEN_VALUE_2" ] || \
   [ -z "$DKIM_TOKEN_NAME_3" ] || [ -z "$DKIM_TOKEN_VALUE_3" ] || \
   [ -z "$MAIL_FROM_DOMAIN" ] || [ -z "$MAIL_FROM_MX" ] || [ -z "$MAIL_FROM_TXT" ]; then
    echo "Error: Missing required SES DNS record outputs from stack"
    exit 1
fi

echo "Retrieved SES DNS records:"
echo "DKIM Token 1: ${DKIM_TOKEN_NAME_1} -> ${DKIM_TOKEN_VALUE_1}"
echo "DKIM Token 2: ${DKIM_TOKEN_NAME_2} -> ${DKIM_TOKEN_VALUE_2}"
echo "DKIM Token 3: ${DKIM_TOKEN_NAME_3} -> ${DKIM_TOKEN_VALUE_3}"
echo "Mail From Domain: ${MAIL_FROM_DOMAIN}"
echo "Mail From MX: ${MAIL_FROM_MX}"
echo "Mail From TXT: ${MAIL_FROM_TXT}"

# Get instance information
INSTANCE_ID=$(aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`RestorePrefix`].OutputValue' \
    --output text)

if [ -z "$INSTANCE_ID" ]; then
    echo "Error: Could not find EC2 instance ID in the stack outputs"
    exit 1
fi

# Get instance public IP
INSTANCE_IP=$(aws ec2 describe-instances \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text)

if [ -z "$INSTANCE_IP" ]; then
    echo "Error: Could not get instance IP address"
    exit 1
fi

# Get instance key pair name
INSTANCE_KEY_NAME=$(aws ec2 describe-instances \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --query 'Reservations[0].Instances[0].KeyName' \
    --output text)

if [ -z "$INSTANCE_KEY_NAME" ]; then
    echo "Error: Could not get instance key pair name"
    exit 1
fi

echo "Instance ID: ${INSTANCE_ID}"
echo "Instance IP: ${INSTANCE_IP}"
echo "Key Pair: ${INSTANCE_KEY_NAME}"

# Get KeyPairId from stack outputs
KEY_PAIR_ID=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="KeyPairId") | .OutputValue')

if [ -z "$KEY_PAIR_ID" ]; then
    echo "Error: Could not retrieve KeyPairId from stack outputs"
    exit 1
fi

# Check if key file exists and create directory if needed
KEY_FILE="${HOME}/.ssh/${INSTANCE_KEY_NAME}.pem"
if [ ! -f "$KEY_FILE" ]; then
    echo "Key file not found at ${KEY_FILE}"
    mkdir -p "${HOME}/.ssh"
    
    echo "Retrieving private key from SSM Parameter Store..."
    aws ssm get-parameter \
        --profile hepe-admin-mfa \
        --region "${REGION}" \
        --name "/ec2/keypair/${KEY_PAIR_ID}" \
        --with-decryption \
        --query 'Parameter.Value' \
        --output text > "${KEY_FILE}"
    
    if [ $? -ne 0 ]; then
        echo "Error: Failed to retrieve private key from SSM Parameter Store."
        exit 1
    fi
    
    echo "Successfully retrieved private key and saved to ${KEY_FILE}"
fi

# Set correct permissions for the key file
chmod 400 "$KEY_FILE"

# Verify the key file format
if ! ssh-keygen -l -f "$KEY_FILE" > /dev/null 2>&1; then
    echo "Error: Key file is not in a valid format"
    echo "Please delete the key file and try again:"
    echo "rm ${KEY_FILE}"
    exit 1
fi

# Get admin password from SSM
ADMIN_PASSWORD=$(aws ssm get-parameter \
    --profile hepe-admin-mfa \
    --name "/MailInABoxAdminPassword-${STACK_NAME}" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text)

if [ -z "$ADMIN_PASSWORD" ]; then
    echo "Error: Could not retrieve admin password from SSM"
    exit 1
fi

# Create temporary directory for scripts
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Create script to set DNS records via Mail-in-a-Box API
cat > "${TEMP_DIR}/set-dns-records.sh" << EOF
#!/bin/bash
set -e

# Mail-in-a-Box API endpoint
MIAB_HOST="https://box.${DOMAIN_NAME}"
ADMIN_EMAIL="admin@${DOMAIN_NAME}"
ADMIN_PASSWORD="${ADMIN_PASSWORD}"

# Function to make API call
set_dns_record() {
    local type=\$1
    local name=\$2
    local value=\$3
    local method=\$4  # PUT or POST
    
    # Normalize qname by removing trailing domain if present
    local normalized_name=\${name%.$DOMAIN_NAME}
    
    echo "Setting \$type record: \$name -> \$value"
    
    # Make the API call
    response=\$(curl -s -w "%{http_code}" -o /tmp/curl_response \
         -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" \
         -X "\${method}" \
         -d "value=\$value" \
         -H "Content-Type: application/x-www-form-urlencoded" \
         "\${MIAB_HOST}/admin/dns/custom/\${normalized_name}/\${type}")
    
    http_code=\${response##* }
    response_body=\$(cat /tmp/curl_response)
    rm -f /tmp/curl_response
    
    if [ "\$http_code" != "200" ]; then
        echo "Error: Failed to set \$type record for \$name (HTTP \$http_code)"
        echo "Response: \$response_body"
        exit 1
    fi
    
    echo "Successfully set \$type record for \$name"
}

# First, delete any existing records for these domains
echo "Cleaning up existing records..."
curl -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${DKIM_TOKEN_NAME_1%.$DOMAIN_NAME}/CNAME"
curl -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${DKIM_TOKEN_NAME_2%.$DOMAIN_NAME}/CNAME"
curl -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${DKIM_TOKEN_NAME_3%.$DOMAIN_NAME}/CNAME"
curl -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${MAIL_FROM_DOMAIN%.$DOMAIN_NAME}/MX"
curl -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${MAIL_FROM_DOMAIN%.$DOMAIN_NAME}/TXT"

# Set DKIM CNAME records using PUT (single value)
set_dns_record "CNAME" "${DKIM_TOKEN_NAME_1}" "${DKIM_TOKEN_VALUE_1}" "PUT"
set_dns_record "CNAME" "${DKIM_TOKEN_NAME_2}" "${DKIM_TOKEN_VALUE_2}" "PUT"
set_dns_record "CNAME" "${DKIM_TOKEN_NAME_3}" "${DKIM_TOKEN_VALUE_3}" "PUT"

# Set MAIL FROM MX record (strip priority for Mail-in-a-Box API)
set_dns_record "MX" "${MAIL_FROM_DOMAIN}" "${MAIL_FROM_MX##* }" "PUT"

# Set MAIL FROM TXT record using POST to preserve any existing SPF records
set_dns_record "TXT" "${MAIL_FROM_DOMAIN}" "${MAIL_FROM_TXT}" "POST"

echo "DNS records set successfully!"
EOF

chmod +x "${TEMP_DIR}/set-dns-records.sh"

# Copy script to instance
echo "Copying DNS setup script to instance..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no "${TEMP_DIR}/set-dns-records.sh" "ubuntu@${INSTANCE_IP}:~/"

# Execute DNS setup script
echo "Executing DNS setup script..."
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "~/set-dns-records.sh"

echo "SES DNS records have been set successfully!"
echo "Please allow time for DNS propagation and verify the SES identity status in the AWS SES Console."
echo "You can check DNS records using:"
echo "dig ${DKIM_TOKEN_NAME_1} CNAME"
echo "dig ${MAIL_FROM_DOMAIN} MX"
echo "dig ${MAIL_FROM_DOMAIN} TXT"