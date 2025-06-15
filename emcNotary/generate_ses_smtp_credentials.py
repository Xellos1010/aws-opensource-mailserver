#!/usr/bin/env python3

import hmac
import hashlib
import base64
import base64
import argparse
import boto3
import sys
import re

# SES SMTP regions
SMTP_REGIONS = [
    "us-east-2",  # US East (Ohio)
    "us-east-1",  # US East (N. Virginia)
    "us-west-2",  # US West (Oregon)
    "ap-south-1",  # Asia Pacific (Mumbai)
    "ap-northeast-2",  # Asia Pacific (Seoul)
    "ap-southeast-1",  # Asia Pacific (Singapore)
    "ap-southeast-2",  # Asia Pacific (Sydney)
    "ap-northeast-1",  # Asia Pacific (Tokyo)
    "ca-central-1",  # Canada (Central)
    "eu-central-1",  # Europe (Frankfurt)
    "eu-west-1",  # Europe (Ireland)
    "eu-west-2",  # Europe (London)
    "eu-south-1",  # Europe (Milan)
    "eu-north-1",  # Europe (Stockholm)
    "sa-east-1",  # South America (Sao Paulo)
    "us-gov-west-1",  # AWS GovCloud (US)
    "us-gov-east-1",  # AWS GovCloud (US)
]

# Constants for SMTP password generation
DATE = "11111111"
SERVICE = "ses"
MESSAGE = "SendRawEmail"
TERMINAL = "aws4_request"
VERSION = 0x04

def sign(key, msg):
    """Generate HMAC-SHA256 signature."""
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

def calculate_key(secret_access_key, region):
    if region not in SMTP_REGIONS:
        raise ValueError(f"The {region} Region doesn't have an SMTP endpoint.")

    signature = sign(("AWS4" + secret_access_key).encode("utf-8"), DATE)
    signature = sign(signature, region)
    signature = sign(signature, SERVICE)
    signature = sign(signature, TERMINAL)
    signature = sign(signature, MESSAGE)
    signature_and_version = bytes([VERSION]) + signature
    smtp_password = base64.b64encode(signature_and_version)
    return smtp_password.decode("utf-8")

def validate_domain(domain):
    """Validate domain name format."""
    pattern = r'^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$'
    if not re.match(pattern, domain):
        raise ValueError(f"Invalid domain name: {domain}. Must match pattern: {pattern}")

def get_credentials_from_ssm(profile, region, domain):
    """Retrieve SMTP credentials from AWS SSM."""
    try:
        session = boto3.Session(profile_name=profile)
        ssm = session.client("ssm", region_name=region)
        username_param = f"/smtp-username-{domain.replace('.', '-')}-mailserver"
        password_param = f"/smtp-password-{domain.replace('.', '-')}-mailserver"
        username = ssm.get_parameter(Name=username_param, WithDecryption=True)["Parameter"]["Value"]
        password = ssm.get_parameter(Name=password_param, WithDecryption=True)["Parameter"]["Value"]
        return username, password
    except Exception as e:
        print(f"Error retrieving SSM parameters: {e}")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Generate SES SMTP credentials for Mail-in-a-Box.")
    parser.add_argument("--domain", default="emcnotary.com", help="Domain name (default: emcnotary.com)")
    parser.add_argument("--region", default="us-east-1", help="AWS Region (default: us-east-1)")
    parser.add_argument("--profile", default="hepe-admin-mfa", help="AWS CLI profile (default: hepe-admin-mfa)")
    parser.add_argument("--secret-key", help="IAM secret access key (optional, if not using SSM)")
    parser.add_argument("--access-key", help="IAM access key ID (optional, if not using SSM)")
    args = parser.parse_args()

    # Validate inputs
    validate_domain(args.domain)
    if args.region not in SMTP_REGIONS:
        raise ValueError(f"Invalid region: {args.region}. Choose from {SMTP_REGIONS}")

    # Get credentials
    if args.access_key and args.secret_key:
        smtp_username = args.access_key
        smtp_password = calculate_key(args.secret_key, args.region)
    else:
        smtp_username, smtp_password_raw = get_credentials_from_ssm(args.profile, args.region, args.domain)
        smtp_password = calculate_key(smtp_password_raw, args.region)


    # SES SMTP settings
    smtp_relay_host = f"email-smtp.{args.region}.amazonaws.com"
    smtp_relay_port = "587"

    # Output configuration
    config_content = f"""[mail]
smtp_relay_enable = true
smtp_relay_host = {smtp_relay_host}
smtp_relay_port = {smtp_relay_port}
smtp_relay_username = {smtp_username}
smtp_relay_password = {smtp_password}
"""
    print("SES Configuration Settings for Mail-in-a-Box:")
    print("-------------------------------------------")
    print(config_content.strip())
    print("-------------------------------------------")
    print("To apply these settings:")
    print(f"1. SSH into your EC2 instance: ssh -i ~/.ssh/{args.domain}-keypair.pem ubuntu@<INSTANCE_IP>")
    print("2. Save the above config to /home/user-data/mail/config:")
    print("   sudo nano /home/user-data/mail/config")
    print("3. Update /etc/postfix/sasl_passwd:")
    print(f"   sudo nano /etc/postfix/sasl_passwd")
    print(f"   Set: [{smtp_relay_host}]:{smtp_relay_port} {smtp_username}:{smtp_password}")
    print("   sudo postmap /etc/postfix/sasl_passwd")
    print("4. Reload Postfix: sudo systemctl reload postfix")
    print("5. Test sending emails from MIAB webmail (https://box.emcnotary.com/mail).")

if __name__ == "__main__":
    main()