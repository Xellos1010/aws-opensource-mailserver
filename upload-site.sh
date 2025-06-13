#!/bin/bash

# Exit on error
set -e

# Configuration
STACK_NAME="emcnotary-react-webserver"
REGION="us-east-1"
REACT_APP_PATH="$1"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
    exit 1
fi

# Check if React app path is provided
if [ -z "$REACT_APP_PATH" ]; then
    echo "Error: Please provide the path to your React build directory"
    echo "Usage: $0 <path-to-react-build>"
    exit 1
fi

# Check if the build directory exists and contains index.html
if [ ! -d "$REACT_APP_PATH" ] || [ ! -f "$REACT_APP_PATH/index.html" ]; then
    echo "Error: Invalid React build directory. Make sure it contains index.html"
    exit 1
fi

echo "Deploying React application from: ${REACT_APP_PATH}"
echo "Stack: ${STACK_NAME}"
echo "Region: ${REGION}"

# Get instance information from the stack
INSTANCE_ID=$(aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --stack-name "${STACK_NAME}" \
    --region "${REGION}" \
    --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
    --output text)

if [ -z "$INSTANCE_ID" ]; then
    echo "Error: Could not find EC2 instance in the stack"
    exit 1
fi

# Get the instance's public IP
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

# Get the actual key pair name from the instance
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

echo "Instance is using key pair: ${INSTANCE_KEY_NAME}"

# Check if key file exists and create directory if needed
KEY_FILE="${HOME}/.ssh/${INSTANCE_KEY_NAME}.pem"
if [ ! -f "$KEY_FILE" ]; then
    echo "Key file not found at ${KEY_FILE}"
    
    # Create .ssh directory if it doesn't exist
    mkdir -p "${HOME}/.ssh"
    
    # Check if key pair exists in AWS
    if ! aws ec2 describe-key-pairs \
        --profile hepe-admin-mfa \
        --region "${REGION}" \
        --key-names "${INSTANCE_KEY_NAME}" > /dev/null 2>&1; then
        echo "Error: Key pair ${INSTANCE_KEY_NAME} not found in AWS"
        echo "Please ensure the CloudFormation stack has created the key pair"
        exit 1
    fi
    
    echo "Downloading key pair from AWS..."
    # Get the key pair material from AWS
    aws ec2 get-key-pair \
        --profile hepe-admin-mfa \
        --region "${REGION}" \
        --key-name "${INSTANCE_KEY_NAME}" \
        --query 'KeyMaterial' \
        --output text > "${KEY_FILE}.tmp"
    
    if [ $? -ne 0 ]; then
        echo "Error: Failed to download key pair. Please check your AWS credentials and permissions."
        exit 1
    fi
    
    # Ensure the key file has the correct format
    if ! grep -q "BEGIN RSA PRIVATE KEY" "${KEY_FILE}.tmp"; then
        echo "Error: Downloaded key file is not in the correct format"
        rm "${KEY_FILE}.tmp"
        exit 1
    fi
    
    # Move the temporary file to the final location
    mv "${KEY_FILE}.tmp" "${KEY_FILE}"
    
    echo "Successfully downloaded key pair and saved to ${KEY_FILE}"
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

echo "Found instance ${INSTANCE_ID} at ${INSTANCE_IP}"
echo "Using key pair: ${INSTANCE_KEY_NAME}"

# Create a temporary directory for deployment
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Copy the build files to the temporary directory
echo "Copying build files..."
cp -r "${REACT_APP_PATH}"/* "${TEMP_DIR}/"

# Create a deployment script
cat > "${TEMP_DIR}/deploy.sh" << 'EOF'
#!/bin/bash
set -e

# Create backup of current build
if [ -d "/var/www/react-app/build" ]; then
    BACKUP_DIR="/var/www/react-app/build.backup.$(date +%Y%m%d_%H%M%S)"
    echo "Creating backup at ${BACKUP_DIR}"
    sudo cp -r /var/www/react-app/build "${BACKUP_DIR}"
fi

# Create new build directory
echo "Creating new build directory..."
sudo mkdir -p /var/www/react-app/build
sudo chown ubuntu:ubuntu /var/www/react-app/build

# Copy new files
echo "Copying new files..."
cp -r * /var/www/react-app/build/

# Set permissions
echo "Setting permissions..."
sudo chown -R www-data:www-data /var/www/react-app/build
sudo chmod -R 755 /var/www/react-app/build

# Restart Nginx
echo "Restarting Nginx..."
sudo systemctl restart nginx

echo "Deployment completed successfully!"
EOF

chmod +x "${TEMP_DIR}/deploy.sh"

# Copy files to the instance
echo "Copying files to instance..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -r "${TEMP_DIR}"/* "ubuntu@${INSTANCE_IP}:~/"

# Execute deployment script
echo "Executing deployment script..."
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "~/deploy.sh"

echo "Deployment completed successfully!"
echo "Your React application should now be accessible at your domain."
echo "Note: DNS propagation may take some time." 