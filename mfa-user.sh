#!/bin/bash

# Configuration
MFA_DEVICE_ARN="arn:aws:iam::413988044972:mfa/Evans-Phone"
SOURCE_PROFILE="hepe-admin"      # Profile with long-term credentials
TARGET_PROFILE="hepe-admin-mfa"  # Profile for temporary credentials
DURATION_SECONDS=43200          # 12 hours

# Prompt for MFA code
echo "Enter MFA code for $SOURCE_PROFILE:"
read -r MFA_CODE

# Get temporary credentials using the source profile
CREDENTIALS=$(aws sts get-session-token \
    --serial-number "$MFA_DEVICE_ARN" \
    --token-code "$MFA_CODE" \
    --duration-seconds "$DURATION_SECONDS" \
    --profile "$SOURCE_PROFILE" \
    --output json)

# Check if the command was successful
if [ $? -ne 0 ]; then
    echo "Error: Failed to get session token. Check your MFA code and profile configuration."
    exit 1
fi

# Extract credentials using jq
AWS_ACCESS_KEY_ID=$(echo "$CREDENTIALS" | jq -r '.Credentials.AccessKeyId')
AWS_SECRET_ACCESS_KEY=$(echo "$CREDENTIALS" | jq -r '.Credentials.SecretAccessKey')
AWS_SESSION_TOKEN=$(echo "$CREDENTIALS" | jq -r '.Credentials.SessionToken')

# Export credentials to environment variables (immediate use)
export AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY"
export AWS_SESSION_TOKEN="$AWS_SESSION_TOKEN"

# Update the TARGET_PROFILE with temporary credentials
aws configure set aws_access_key_id "$AWS_ACCESS_KEY_ID" --profile "$TARGET_PROFILE"
aws configure set aws_secret_access_key "$AWS_SECRET_ACCESS_KEY" --profile "$TARGET_PROFILE"
aws configure set aws_session_token "$AWS_SESSION_TOKEN" --profile "$TARGET_PROFILE"

echo "Temporary credentials set for profile '$TARGET_PROFILE' (valid for 12 hours)"
echo "Original credentials in '$SOURCE_PROFILE' remain unchanged"
echo "Use AWS commands with: aws ... --profile $TARGET_PROFILE"
echo "Environment variables are also set for the current session"

# aws sts get-caller-identity --profile hepe-admin-mfa