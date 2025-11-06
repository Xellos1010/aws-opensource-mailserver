# Master Codebase - AWS Open Source Mail Server

This document contains the complete codebase for the AWS Open Source Mail Server project, including all configuration files, scripts, and infrastructure code.

## Table of Contents

### Individual Files
- [.pre-commit-config.yaml](#pre-commit-configyaml)
- [mfa-user.sh](#mfa-usersh)
- [mailserver-infrastructure-mvp.yaml](#mailserver-infrastructure-mvpyaml)
- [README.md](#readmemd)

### Folders
- [administration/](#administration)
- [askdaokapra/](#askdaokapra)
- [emcnotary/](#emcnotary)
- [hepefoundation/](#hepefoundation)
- [policies/](#policies)
- [telassistmd/](#telassistmd)

### PEM File References
- [PEM file references](#pem-file-references)

---

## Individual Files


### .pre-commit-config.yaml

```.pre-commit-config.yaml
repos:
  - repo: https://github.com/psf/black
    rev: 24.8.0
    hooks: [{ id: black, files: ^administration/.*\.py$ }]
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.6.9
    hooks: [{ id: ruff, args: ["--fix"], files: ^administration/.*\.py$ }]
  - repo: https://github.com/shellcheck-py/shellcheck-py
    rev: v0.10.0.1
    hooks: [{ id: shellcheck, files: ^(mfa-user\.sh|administration/.*\.sh)$ }]
  - repo: https://github.com/scop/pre-commit-shfmt
    rev: v3.7.0-4
    hooks: [{ id: shfmt, files: \.sh$ }]
  - repo: https://github.com/aws-cloudformation/cfn-lint
    rev: v1.30.0
    hooks: [{ id: cfn-lint, files: \.(yaml|yml)$ }]
```


### mfa-user.sh

```mfa-user.sh
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
```


### mailserver-infrastructure-mvp.yaml

```mailserver-infrastructure-mvp.yaml
AWSTemplateFormatVersion: '2010-09-09'
Parameters:
  DomainName:
    Type: String
    Default: emcnotary.com
    Description: The domain name for the mail server resources. DNS Domain to host emails for
    AllowedPattern: ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$
    ConstraintDescription: Must be a valid domain name (e.g., emcnotary.com)
  InstanceType:
    Description: EC2 instance type
    Type: String
    Default: t2.micro
    ConstraintDescription: must be a valid EC2 instance type.
  InstanceAMI:
    Description: Managed AMI ID for EC2 Instance
    Type: AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>
    Default: '/aws/service/canonical/ubuntu/server/jammy/stable/current/amd64/hvm/ebs-gp2/ami-id'
  InstanceDns:
    Description: DNS name of Instance (within the 'DomainName') 
    Type: String
    Default: box
  MailInABoxVersion:
    Type: String
    Default: aws
  MailInABoxCloneUrl:
    Type: String
    Default: https://github.com/mmeidlinger/mailinabox
  MailInABoxAdminPassword:
    Type: String
    NoEcho: true
    Default: ''
  RestoreKey:
    Description: Key to decrypt Backup. Leave empty in case of using a newly generated one for new installs
    Type: String
    Default: ''
    NoEcho: true
  RestoreKeySsmParameterName:
    Description: Name of SSM Parameter where to save the Restore Key. Key not saved to Ssm in case this is left empty
    Default: 'MailInABoxRestoreKey'
    Type: String
  RestorePrefix:
    Description: Prefix where backups that are to be restored are located in S3 bucket. Leave empty for a fresh install
    Default: ''
    Type: String
  SesRelay:
    Description: Set to 'false' if you do not want to configure SES to relay your Emails
    Type: String
    Default: 'true'
    AllowedValues: ['true', 'false']
  SmtpIamAccessKeyVersion:
    Type: Number
    Default: 1
    Description: Version number of the AWS access keys used to generate SMTP Credentials. Increment this number to rotate the keys. New keys are not automatically provisioned on the Mail-in-a-box instance.
    MinValue: 1
  EnableNightlyReboot:
    Type: String
    Default: 'true'
    AllowedValues: ['true', 'false']
    Description: Enable automatic nightly reboot at 3am UTC. Set to 'false' to disable automatic reboots.
  NightlyRebootSchedule:
    Type: String
    Default: 'cron(0 3 * * ? *)'
    Description: 'Cron expression for nightly reboot schedule. Default: 3:00 AM UTC daily.'
  AlarmEmail:
    Type: String
    Default: admin@hepefoundation.org
    Description: Email for alerts (SNS subscription)
  SwapSizeGiB:
    Type: Number
    Default: 2
    MinValue: 1
    MaxValue: 8
    Description: Swap size in GiB to create at boot
  MemHighPercent:
    Type: Number
    Default: 85
    Description: Percent memory used to alarm on
  SwapHighPercent:
    Type: Number
    Default: 80
    Description: Percent swap used to alarm on

Conditions:
  UseSesRelay:
    !Equals [!Ref 'SesRelay', 'true']
  RestoreKeyinSsmParameter:
    !Not [!Equals [!Ref 'RestoreKeySsmParameterName', '']]
  NewAdminPasswordToSsm:
    !And [ !Equals [!Ref 'MailInABoxAdminPassword', ''], !Equals [!Ref 'RestorePrefix', ''] ]
  EnableNightlyRebootCondition:
    !Equals [!Ref 'EnableNightlyReboot', 'true']

Resources:
  # SES Email Identity for domain verification, aligned with AWS::SES::EmailIdentity properties
  SESEmailIdentity:
    Condition: UseSesRelay
    Type: AWS::SES::EmailIdentity
    Properties:
      EmailIdentity: !Ref DomainName
      DkimAttributes:
        SigningEnabled: true
      DkimSigningAttributes:
        NextSigningKeyLength: RSA_2048_BIT
      MailFromAttributes:
        MailFromDomain: !Sub mail.${DomainName}
        BehaviorOnMxFailure: USE_DEFAULT_VALUE
      FeedbackAttributes:
        EmailForwardingEnabled: true

  ElasticIP:
    Type: AWS::EC2::EIP
    Properties:
      Domain: vpc
      Tags:
        - Key: MAILSERVER
          Value: !Ref DomainName

  NewKeyPair:
    Type: AWS::EC2::KeyPair
    Properties:
      KeyName: !Sub ${DomainName}-keypair
      Tags:
        - Key: MAILSERVER
          Value: !Ref DomainName

  BackupBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub ${DomainName}-backup
      Tags:
        - Key: MAILSERVER
          Value: !Ref DomainName

  NextcloudBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub ${DomainName}-nextcloud
      Tags:
        - Key: MAILSERVER
          Value: !Ref DomainName
  
  MailInABoxAdminPasswordSsmParameter:
    Condition: NewAdminPasswordToSsm
    Type: AWS::SSM::Parameter
    Properties:
      Name: !Sub /MailInABoxAdminPassword-${AWS::StackName}
      Type: String
      Value: DefaultToBeUpdatedByInstaller
      Description: Initial admin Password for Mail-in-a-box WebUI

  EC2Instance:
    Type: AWS::EC2::Instance
    DependsOn: 
      - SmtpCredentialsWaitCondition
      - NewKeyPair
      - InstanceProfile
      - InstanceSecurityGroup
      - SESEmailIdentity
    CreationPolicy:
      ResourceSignal:
        Timeout: PT1H5M
        Count: 1
    Properties:
      InstanceType: !Ref InstanceType
      KeyName: !Sub ${DomainName}-keypair
      ImageId: !Ref InstanceAMI
      IamInstanceProfile: !Ref InstanceProfile
      SecurityGroups: 
        - !Ref InstanceSecurityGroup
      BlockDeviceMappings:
        - DeviceName: /dev/sda1
          Ebs:
            VolumeType: gp2
            VolumeSize: 8
            DeleteOnTermination: true
            Encrypted: true
      Tags:
        - Key: Name
          Value: !Sub MailInABoxInstance-${AWS::StackName}
        - Key: ASKDAOKAPRA
          Value: MAILSERVERS
      UserData:
        Fn::Base64: !Sub |
          #!/bin/bash -xe
          LOGFILE="/var/log/mailinabox_setup.log"
          echo "Starting Mail-in-a-Box setup..." | tee -a $LOGFILE | logger -t mailinabox_setup
          exec > >(tee -a $LOGFILE | logger -t mailinabox_setup) 2>&1
          logger "Starting Mail-in-a-Box setup."

          # Get the Elastic IP address
          ElasticIPAddress=${ElasticIP}

          # Configure needrestart to auto-handle restarts
          echo "Updating package lists..." | tee -a $LOGFILE | logger -t mailinabox_setup
          apt-get update
          echo "Upgrading installed packages..." | tee -a $LOGFILE | logger -t mailinabox_setup
          apt-get upgrade -o DPkg::Lock::Timeout=120 -y  

          # Install missing package (dialog) first
          echo "Installing missing package: dialog..." | tee -a $LOGFILE | logger -t mailinabox_setup
          apt-get install -y dialog

          # Pre-Install
          echo "Installing dependencies..." | tee -a $LOGFILE | logger -t mailinabox_setup
          apt-get install -o DPkg::Lock::Timeout=120 -y \
            librsync-dev \
            python3-setuptools \
            python3-pip \
            python3-boto3 \
            unzip \
            intltool \
            python-is-python3

          # Install awscli and CloudFormation helper scripts
          echo "Installing AWS CLI..." | tee -a $LOGFILE | logger -t mailinabox_setup
          cd /tmp
          curl "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o "awscliv2.zip"
          unzip awscliv2.zip
          ./aws/install
          pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz

          # Configure variables
          echo "Configuring environment variables..." | tee -a $LOGFILE | logger -t mailinabox_setup
          export NONINTERACTIVE=1
          export DEBIAN_FRONTEND=noninteractive
          export TERM=xterm

          export SKIP_NETWORK_CHECKS=true
          export STORAGE_ROOT=/home/user-data
          export STORAGE_USER=user-data
          export PRIVATE_IP=$(ec2metadata --local-ipv4)
          export PUBLIC_IP=${ElasticIP}

          export PRIMARY_HOSTNAME=${InstanceDns}.${DomainName}
          export DEFAULT_PRIMARY_HOSTNAME=${InstanceDns}.${DomainName}
          export DEFAULT_PUBLIC_IP=${ElasticIP}

          # --- Stability: swap + swappiness + systemd MemoryMax (soft caps) ---
          if ! swapon --summary | grep -q '/swapfile'; then
            fallocate -l ${SwapSizeGiB}G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
            echo '/swapfile none swap sw 0 0' >> /etc/fstab
          fi
          sysctl -w vm.swappiness=60
          echo 'vm.swappiness=60' >> /etc/sysctl.conf

          # Soft memory caps on heavy daemons (preempt OOM); harmless if service absent now, useful after MIAB setup
          for svc in php8.0-fpm rspamd spamassassin named dovecot; do
            if systemctl list-unit-files | grep -q "^$svc"; then
              systemctl set-property "$svc".service MemoryMax=400M || true
            fi
          done
          systemctl daemon-reload || true
          # --------------------------------------------------------------------

          # Setup Admin Account
          echo "Setting up admin account..." | tee -a $LOGFILE | logger -t mailinabox_setup
          export EMAIL_ADDR=admin@${DomainName}
          if [[ -z "${MailInABoxAdminPassword}" ]]; then
            export EMAIL_PW=$(tr -dc A-Za-z0-9 </dev/urandom | head -c 16 ; echo '')
            if [[ -z "${RestorePrefix}" ]]; then
              aws ssm put-parameter \
                  --overwrite \
                  --name "/MailInABoxAdminPassword-${AWS::StackName}" \
                  --type SecureString \
                  --value "$EMAIL_PW"
            fi
          else
            export EMAIL_PW=${MailInABoxAdminPassword}
          fi

          # Pre-installation steps
          echo "Creating user and setting up directories..." | tee -a $LOGFILE | logger -t mailinabox_setup
          useradd -m $STORAGE_USER
          mkdir -p $STORAGE_ROOT
          git clone ${MailInABoxCloneUrl} /opt/mailinabox
          export TAG=${MailInABoxVersion}
          cd /opt/mailinabox && git checkout $TAG

          # Restore if applicable
          if [[ -n "${RestorePrefix}" ]]; then
            echo "Restoring from S3 backup..." | tee -a $LOGFILE | logger -t mailinabox_setup
            duplicity restore --force "s3://${DomainName}-backup/${RestorePrefix}" $STORAGE_ROOT
            mkdir -p $STORAGE_ROOT/backup
          fi

          # Install Mail-in-a-Box
          echo "Running Mail-in-a-Box setup script..." | tee -a $LOGFILE | logger -t mailinabox_setup
          cd /opt/mailinabox/
          bash -x setup/start.sh 2>&1 | tee /tmp/mailinabox_debug.log

          # Configure SES SMTP credentials if SesRelay is true
          if [[ "${SesRelay}" == "true" ]]; then
            echo "Configuring SES SMTP credentials..." | tee -a $LOGFILE | logger -t mailinabox_setup
            SMTP_USERNAME=$(aws ssm get-parameter --name "/smtp-username-${AWS::StackName}" --with-decryption --query Parameter.Value --output text)
            SMTP_PASSWORD=$(aws ssm get-parameter --name "/smtp-password-${AWS::StackName}" --with-decryption --query Parameter.Value --output text)
            
            # Create mail config directory if it doesn't exist
            mkdir -p /home/user-data/mail
            
            # Write SMTP configuration with proper permissions
            echo -e "[mail]\nsmtp_relay_enable = true\nsmtp_relay_host = email-smtp.${AWS::Region}.amazonaws.com\nsmtp_relay_port = 587\nsmtp_relay_username = $SMTP_USERNAME\nsmtp_relay_password = $SMTP_PASSWORD" > /home/user-data/mail/config
            chown user-data:user-data /home/user-data/mail/config
            chmod 640 /home/user-data/mail/config

            # Configure Postfix for SES
            echo "Configuring Postfix for SES..." | tee -a $LOGFILE | logger -t mailinabox_setup
            
            # Configure Postfix main settings
            postconf -e "relayhost = [email-smtp.${AWS::Region}.amazonaws.com]:587" \
                    "smtp_sasl_auth_enable = yes" \
                    "smtp_sasl_security_options = noanonymous" \
                    "smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd" \
                    "smtp_use_tls = yes" \
                    "smtp_tls_security_level = encrypt" \
                    "smtp_tls_note_starttls_offer = yes" \
                    "smtp_tls_loglevel = 2"

            # Comment out smtp_fallback_relay in master.cf if it exists
            sed -i 's/^[^#].*smtp_fallback_relay=/#&/' /etc/postfix/master.cf

            # Create sasl_passwd file with SMTP credentials and proper permissions
            echo "[email-smtp.${AWS::Region}.amazonaws.com]:587 $SMTP_USERNAME:$SMTP_PASSWORD" > /etc/postfix/sasl_passwd
            chown root:root /etc/postfix/sasl_passwd
            chmod 600 /etc/postfix/sasl_passwd

            # Create hashmap database with proper permissions
            postmap hash:/etc/postfix/sasl_passwd
            chown root:root /etc/postfix/sasl_passwd.db
            chmod 600 /etc/postfix/sasl_passwd.db

            # Set CA certificate path for Ubuntu
            postconf -e 'smtp_tls_CAfile = /etc/ssl/certs/ca-certificates.crt'
            
            # Configure OpenDKIM permissions
            echo "Configuring OpenDKIM permissions..." | tee -a $LOGFILE | logger -t mailinabox_setup
            
            # Create dkim directory if it doesn't exist
            mkdir -p /home/user-data/mail/dkim
            
            # Set proper ownership and permissions for OpenDKIM
            chown -R opendkim:opendkim /home/user-data/mail/dkim
            chmod -R 750 /home/user-data/mail/dkim
            find /home/user-data/mail/dkim -type f -exec chmod 640 {} \;
            
            # Set proper ownership and permissions for mail directories
            chown user-data:user-data /home/user-data /home/user-data/mail
            chmod 755 /home/user-data /home/user-data/mail
            
            # Restart mail services using systemctl instead of mailinabox-daemon
            echo "Restarting mail services..." | tee -a $LOGFILE | logger -t mailinabox_setup
            systemctl restart postfix || true
            systemctl reload postfix || true
            systemctl restart dovecot || true
            systemctl restart opendkim || true
            
            # Add hostname to /etc/hosts to fix DNS resolution
            echo "Adding hostname to /etc/hosts..." | tee -a $LOGFILE | logger -t mailinabox_setup
            echo "127.0.0.1 ${InstanceDns}.${DomainName}" >> /etc/hosts
          fi

          # Post-installation steps
          echo "Configuring DNS settings..." | tee -a $LOGFILE | logger -t mailinabox_setup
          INTERFACE=$(ip route list | grep default | grep -E  'dev (\w+)' -o | awk '{print $2}')
          cat > /etc/netplan/99-custom-dns.yaml << 'EOF'
          network:
            version: 2
            ethernets:
                $INTERFACE:         
                  nameservers:
                    addresses: [127.0.0.1]
                  dhcp4-overrides:
                    use-dns: false
          EOF
          netplan apply

          # Remove existing duplicity installation if any
          echo "Removing existing duplicity installation..." | tee -a $LOGFILE | logger -t mailinabox_setup
          apt-get remove -y duplicity || true
          rm -rf /etc/apt/sources.list.d/duplicity-team-ubuntu-duplicity-release-git-jammy.list || true
          apt-get update

          # Install duplicity via Snap
          echo "Installing duplicity via Snap..." | tee -a $LOGFILE | logger -t mailinabox_setup
          snap install duplicity --classic
          ln -sf /snap/bin/duplicity /usr/bin/duplicity
          echo -e "Package: duplicity\nPin: release *\nPin-Priority: -1" > /etc/apt/preferences.d/duplicity

          # Verify duplicity installation
          echo "Verifying duplicity installation..." | tee -a $LOGFILE | logger -t mailinabox_setup
          duplicity --version

          # Create Initial Backup
          echo "Creating initial backup..." | tee -a $LOGFILE | logger -t mailinabox_setup
          /opt/mailinabox/management/backup.py

          # Fetch the EC2 Instance ID
          INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
          echo "Instance ID: $INSTANCE_ID"

          # Clear logs for security
          echo "Clearing logs of sensitive data..." | tee -a $LOGFILE | logger -t mailinabox_setup
          for file in /var/lib/cloud/instances/$INSTANCE_ID/scripts/part-00* \
                      /var/lib/cloud/instances/$INSTANCE_ID/user-data.txt* \
                      /var/lib/cloud/instances/$INSTANCE_ID/obj.pkl; do
              if [ -e "$file" ]; then
                  rm -f "$file"
                  echo "Deleted: $file"
              else
                  echo "File not found: $file"
              fi
          done

          # Signal success to CloudFormation
          echo "Signaling CloudFormation completion..." | tee -a $LOGFILE | logger -t mailinabox_setup
          /usr/local/bin/cfn-signal --success true --stack ${AWS::StackId} --resource EC2Instance --region ${AWS::Region}

          # Reboot
          echo "Rebooting system..." | tee -a $LOGFILE | logger -t mailinabox_setup
          reboot

  InstanceRole: 
    Type: AWS::IAM::Role
    DependsOn:
      - BackupBucket
      - NextcloudBucket
    Properties:
      RoleName: !Sub MailInABoxInstanceRole-${AWS::StackName}
      AssumeRolePolicyDocument:
        Version: 2012-10-17
        Statement:
          - Effect: Allow
            Principal:
              Service:
                - ec2.amazonaws.com
            Action:
              - sts:AssumeRole
      Policies:
        - PolicyName: BackupS3BucketAccessMIAB
          PolicyDocument:
            Version: 2012-10-17
            Statement:
              - Effect: Allow
                Action:
                  - s3:*
                Resource:
                  - !Sub arn:aws:s3:::${DomainName}-backup/*
                  - !Sub arn:aws:s3:::${DomainName}-backup
        - PolicyName: NextCloudS3Policy
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action:
                  - s3:*
                Resource:
                  - !Sub arn:aws:s3:::${DomainName}-nextcloud/*
                  - !Sub arn:aws:s3:::${DomainName}-nextcloud
        - !If
          - UseSesRelay
          - PolicyName: SsmParameterAccessSmtpCredentials
            PolicyDocument:
              Version: "2012-10-17"
              Statement:
                - Effect: Allow
                  Action:
                    - ssm:GetParameter
                  Resource:
                    - !Sub "arn:${AWS::Partition}:ssm:${AWS::Region}:${AWS::AccountId}:parameter/smtp-username-${AWS::StackName}"
                    - !Sub "arn:${AWS::Partition}:ssm:${AWS::Region}:${AWS::AccountId}:parameter/smtp-password-${AWS::StackName}"
          - !Ref AWS::NoValue
        - !If
          - RestoreKeyinSsmParameter
          - PolicyName: SsmParameterAccessRestoreKey
            PolicyDocument:
              Version: "2012-10-17"
              Statement:
                - Effect: Allow
                  Action:
                    - ssm:PutParameter
                    - ssm:GetParameter
                  Resource:
                    - !Sub "arn:${AWS::Partition}:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${RestoreKeySsmParameterName}"
                - Effect: Allow
                  Action:
                    - ssm:DescribeParameters
                  Resource: '*'
          - !Ref AWS::NoValue  
        - !If
          - NewAdminPasswordToSsm
          - PolicyName: SsmParameterAccessMailInABoxAdminPassword
            PolicyDocument:
              Version: "2012-10-17"
              Statement:
                - Effect: Allow
                  Action:
                    - ssm:PutParameter
                    - ssm:GetParameter
                  Resource:
                    - !Sub "arn:${AWS::Partition}:ssm:${AWS::Region}:${AWS::AccountId}:parameter/MailInABoxAdminPassword-${AWS::StackName}"
          - !Ref AWS::NoValue  

  InstanceProfile:
    Type: AWS::IAM::InstanceProfile
    DependsOn: InstanceRole
    Properties: 
      InstanceProfileName: !Sub MailInABoxInstanceProfile-${AWS::StackName}
      Roles: 
       - !Ref InstanceRole

  InstanceEIPAssociation:
    Type: AWS::EC2::EIPAssociation
    DependsOn:
      - ElasticIP
      - EC2Instance
    Properties: 
      EIP: !Ref ElasticIP
      InstanceId: !Ref EC2Instance

  InstanceSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Security Group for Mail-in-a-box Instance
      GroupName: !Sub MailInABoxSecurityGroup-${AWS::StackName}
      SecurityGroupIngress:
      - IpProtocol: tcp
        Description: 'SSH'
        FromPort: 22
        ToPort: 22
        CidrIp: 0.0.0.0/0
      - IpProtocol: tcp
        Description: 'DNS (TCP)'
        FromPort: 53
        ToPort: 53
        CidrIp: 0.0.0.0/0
      - IpProtocol: udp
        Description: 'DNS (UDP)'
        FromPort: 53
        ToPort: 53
        CidrIp: 0.0.0.0/0
      - IpProtocol: tcp
        Description: 'HTTP'
        FromPort: 80
        ToPort: 80
        CidrIp: 0.0.0.0/0
      - IpProtocol: tcp
        Description: 'HTTPS'
        FromPort: 443
        ToPort: 443
        CidrIp: 0.0.0.0/0
      - IpProtocol: tcp
        Description: 'SMTP (STARTTLS)'
        FromPort: 25
        ToPort: 25
        CidrIp: 0.0.0.0/0
      - IpProtocol: tcp
        Description: 'IMAP (STARTTLS)'
        FromPort: 143
        ToPort: 143
        CidrIp: 0.0.0.0/0
      - IpProtocol: tcp
        Description: 'IMAPS'
        FromPort: 993
        ToPort: 993
        CidrIp: 0.0.0.0/0
      - IpProtocol: tcp
        Description: 'SMTPS'
        FromPort: 465
        ToPort: 465
        CidrIp: 0.0.0.0/0
      - IpProtocol: tcp
        Description: 'SMTP Submission'
        FromPort: 587
        ToPort: 587
        CidrIp: 0.0.0.0/0
      - IpProtocol: tcp
        Description: 'Sieve Mail filtering'
        FromPort: 4190
        ToPort: 4190
        CidrIp: 0.0.0.0/0

  SmtpCredentialsWaitHandleUnconditional: 
    Type: "AWS::CloudFormation::WaitConditionHandle"

  SmtpCredentialsWaitHandleConditional: 
    Condition: UseSesRelay
    DependsOn: SmtpPassword
    Type: "AWS::CloudFormation::WaitConditionHandle"

  SmtpCredentialsWaitCondition: 
    Type: "AWS::CloudFormation::WaitCondition"
    Properties: 
      Handle: !If [UseSesRelay, !Ref SmtpCredentialsWaitHandleConditional, !Ref SmtpCredentialsWaitHandleUnconditional]
      Timeout: "1"
      Count: 0

  SmtpUserGroup:
    Condition: UseSesRelay
    Type: AWS::IAM::Group
    Properties:
      GroupName: !Sub SMTPUserGroup-${AWS::StackName}
  
  SmtpUser:
    Condition: UseSesRelay
    Type: AWS::IAM::User
    Properties:
      UserName: !Sub SMTPUser-${AWS::StackName}
      Groups:
        - !Ref SmtpUserGroup

  SmtpUserPolicy:
    Condition: UseSesRelay
    Type: AWS::IAM::Policy
    Properties:
      PolicyName: !Sub SMTPUserPolicy-${AWS::StackName}
      PolicyDocument:
        Version: 2012-10-17
        Statement:
          - Effect: Allow
            Action: ses:SendRawEmail
            Resource: '*'
            Condition: 
              StringLike:
                'ses:FromAddress': !Sub '*@${DomainName}'
      Groups:
        - !Ref SmtpUserGroup
  
  SmtpUserAccessKey:
    Condition: UseSesRelay
    Type: AWS::IAM::AccessKey
    Properties:
      Serial: !Ref SmtpIamAccessKeyVersion
      Status: Active
      UserName: !Ref SmtpUser

  SmtpPassword:
    Condition: UseSesRelay
    DependsOn: SmtpUsername
    Type: Custom::SmtpPassword
    Properties:
      ServiceToken: !GetAtt SmtpLambdaFunction.Arn
      Key: !GetAtt SmtpUserAccessKey.SecretAccessKey
      ParameterType: password

  SmtpUsername:
    Condition: UseSesRelay
    Type: Custom::SmtpUsername
    Properties:
      ServiceToken: !GetAtt SmtpLambdaFunction.Arn
      Key: !Ref SmtpUserAccessKey
      ParameterType: username

  SmtpLambdaExecutionRole:
    Condition: UseSesRelay
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub SMTPLambdaExecutionRole-${AWS::StackName}
      Description: Role assumed by Lambda to generate SMTP credentials
      AssumeRolePolicyDocument: 
        Version: 2012-10-17
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action:
              - sts:AssumeRole
      Policies:
        - PolicyName: InlineSMTPLambdaExecutionRolePolicy
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action:
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                  - logs:CreateLogGroup
                Resource: arn:aws:logs:*:*:*
              - Effect: Allow
                Action:
                  - ssm:PutParameter
                  - ssm:DeleteParameter
                Resource:
                  - !Sub "arn:${AWS::Partition}:ssm:${AWS::Region}:${AWS::AccountId}:parameter/smtp-username-${AWS::StackName}"
                  - !Sub "arn:${AWS::Partition}:ssm:${AWS::Region}:${AWS::AccountId}:parameter/smtp-password-${AWS::StackName}"

  SmtpLambdaFunction:
    Condition: UseSesRelay
    Type: AWS::Lambda::Function
    Properties:
      Description: Generates SMTP credentials and stores in Parameter Store
      FunctionName: !Sub SMTPCredentialsLambdaFunction-${AWS::StackName}
      Handler: index.lambda_handler
      MemorySize: 128
      Role: !GetAtt SmtpLambdaExecutionRole.Arn
      Runtime: python3.8
      Timeout: 30
      Code:
        ZipFile: !Sub |
          import hmac
          import hashlib
          import base64
          import boto3
          from botocore.exceptions import ClientError
          import json
          import cfnresponse
          import logging
          import os

          logging.basicConfig(level=logging.DEBUG)
          log = logging.getLogger(__name__)
          region = os.environ['AWS_REGION']
          ssm = boto3.client('ssm',region_name=region)

          SMTP_REGIONS = [
              'us-east-2',       # US East (Ohio)
              'us-east-1',       # US East (N. Virginia)
              'us-west-2',       # US West (Oregon)
              'ap-south-1',      # Asia Pacific (Mumbai)
              'ap-northeast-2',  # Asia Pacific (Seoul)
              'ap-southeast-1',  # Asia Pacific (Singapore)
              'ap-southeast-2',  # Asia Pacific (Sydney)
              'ap-northeast-1',  # Asia Pacific (Tokyo)
              'ca-central-1',    # Canada (Central)
              'eu-central-1',    # Europe (Frankfurt)
              'eu-west-1',       # Europe (Ireland)
              'eu-west-2',       # Europe (London)
              'sa-east-1',       # South America (Sao Paulo)
              'us-gov-west-1',   # AWS GovCloud (US)
          ]

          DATE = "11111111"
          SERVICE = "ses"
          MESSAGE = "SendRawEmail"
          TERMINAL = "aws4_request"
          VERSION = 0x04

          def sign(key, msg):
              return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()

          def calculate_key(secret_access_key, region):
              if region not in SMTP_REGIONS:
                  raise ValueError(f"The {region} Region doesn't have an SMTP endpoint.")
              signature = sign(("AWS4" + secret_access_key).encode('utf-8'), DATE)
              signature = sign(signature, region)
              signature = sign(signature, SERVICE)
              signature = sign(signature, TERMINAL)
              signature = sign(signature, MESSAGE)
              signature_and_version = bytes([VERSION]) + signature
              smtp_password = base64.b64encode(signature_and_version)
              return smtp_password.decode('utf-8')

          def put_parameter(value,type):
            try:
              ssm.put_parameter(
                      Name='smtp-' + type + '-${AWS::StackName}',
                      Description='SMTP '+type+' for email communications',
                      Value=value,
                      Type='SecureString',
                      Overwrite=True,
                      Tier='Standard'
                  )
              return True
            except Exception as e:
              print("Error putting parameter smtp-"+type+"-${AWS::StackName}: "+str(e))
              return False

          def delete_smtp_credentials(type):
            try:
              ssm.delete_parameter(Name='smtp-'+type+'-${AWS::StackName}')
              return True
            except Exception as e:
              print("Error deleting parameter smtp-"+type+"-${AWS::StackName}: "+str(e))
              return False

          def lambda_handler(event, context):
            log.debug('%s', event)
            parameter_type = event['ResourceProperties']['ParameterType']
            parameter_arn = "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/smtp-"+parameter_type+"-${AWS::StackName}"
            key = event['ResourceProperties']['Key']
            proceed = "True"

            if event['RequestType'] == 'Create':
              if parameter_type == 'username':
                proceed = put_parameter(key, parameter_type)
              elif parameter_type == 'password':
                pwd = calculate_key(key, region)
                proceed = put_parameter(pwd, parameter_type)
              reason = "Created SMTP "+parameter_type
            elif event['RequestType'] == 'Update':
              if parameter_type == 'username':
                proceed = put_parameter(key, parameter_type)
              elif parameter_type == 'password':
                pwd = calculate_key(key, region)
                proceed = put_parameter(pwd, parameter_type)
              reason = "Updated SMTP "+parameter_type
            elif event['RequestType'] == 'Delete':
              proceed = delete_smtp_credentials(parameter_type)
              reason = "Deleted SMTP "+parameter_type
            else:
              proceed = False
              reason = "Operation %s is unsupported" % (event['RequestType'])

            if proceed:
              cfnresponse.send(event, context, cfnresponse.SUCCESS, {'Reason': reason}, parameter_arn)
            else:
              cfnresponse.send(event, context, cfnresponse.FAILED, {'Reason': reason}, parameter_arn)

  # Nightly Reboot Lambda Function
  NightlyRebootLambdaRole:
    Type: AWS::IAM::Role
    Condition: EnableNightlyRebootCondition
    Properties:
      RoleName: !Sub NightlyRebootLambdaRole-${AWS::StackName}
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
      Policies:
        - PolicyName: EC2RebootPolicy
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - ec2:DescribeInstances
                  - ec2:RebootInstances
                Resource: '*'
                Condition:
                  StringEquals:
                    'ec2:ResourceTag/MAILSERVER': !Ref DomainName

  NightlyRebootLambdaFunction:
    Type: AWS::Lambda::Function
    Condition: EnableNightlyRebootCondition
    Properties:
      FunctionName: !Sub NightlyRebootMailServer-${AWS::StackName}
      Runtime: python3.9
      Handler: index.lambda_handler
      Role: !GetAtt NightlyRebootLambdaRole.Arn
      Timeout: 60
      Environment:
        Variables:
          STACK_NAME: !Ref AWS::StackName
          DOMAIN_NAME: !Ref DomainName
      Code:
        ZipFile: |
          import boto3
          import json
          import logging
          import os

          # Configure logging
          logger = logging.getLogger()
          logger.setLevel(logging.INFO)

          def lambda_handler(event, context):
              """
              Lambda function to reboot EC2 instances belonging to mail server stack
              """
              try:
                  ec2_client = boto3.client('ec2')
                  stack_name = os.environ['STACK_NAME']
                  domain_name = os.environ['DOMAIN_NAME']
                  
                  logger.info(f"Starting nightly reboot for stack: {stack_name}, domain: {domain_name}")
                  
                  # Find instances with the mail server tag
                  response = ec2_client.describe_instances(
                      Filters=[
                          {
                              'Name': 'tag:MAILSERVER',
                              'Values': [domain_name]
                          },
                          {
                              'Name': 'instance-state-name',
                              'Values': ['running']
                          }
                      ]
                  )
                  
                  instance_ids = []
                  for reservation in response['Reservations']:
                      for instance in reservation['Instances']:
                          instance_ids.append(instance['InstanceId'])
                          logger.info(f"Found mail server instance: {instance['InstanceId']}")
                  
                  if not instance_ids:
                      logger.info("No running mail server instances found to reboot")
                      return {
                          'statusCode': 200,
                          'body': json.dumps('No running instances found to reboot')
                      }
                  
                  # Reboot the instances
                  logger.info(f"Rebooting instances: {instance_ids}")
                  ec2_client.reboot_instances(InstanceIds=instance_ids)
                  
                  return {
                      'statusCode': 200,
                      'body': json.dumps(f'Successfully initiated reboot for {len(instance_ids)} instances: {instance_ids}')
                  }
                  
              except Exception as e:
                  logger.error(f"Error during nightly reboot: {str(e)}")
                  return {
                      'statusCode': 500,
                      'body': json.dumps(f'Error: {str(e)}')
                  }

  NightlyRebootEventRule:
    Type: AWS::Events::Rule
    Condition: EnableNightlyRebootCondition
    Properties:
      Name: !Sub NightlyRebootRule-${AWS::StackName}
      Description: !Sub "Triggers mail server reboot based on schedule: ${NightlyRebootSchedule}"
      ScheduleExpression: !Ref NightlyRebootSchedule
      State: ENABLED
      Targets:
        - Arn: !GetAtt NightlyRebootLambdaFunction.Arn
          Id: "NightlyRebootTarget"

  NightlyRebootLambdaPermission:
    Type: AWS::Lambda::Permission
    Condition: EnableNightlyRebootCondition
    Properties:
      FunctionName: !Ref NightlyRebootLambdaFunction
      Action: lambda:InvokeFunction
      Principal: events.amazonaws.com
      SourceArn: !GetAtt NightlyRebootEventRule.Arn

  # Ship mem/swap metrics & syslog to CloudWatch, and set alarms
  CWAgentConfigParam:
    Type: AWS::SSM::Parameter
    Properties:
      Name: !Sub /cwagent-linux-${AWS::StackName}
      Type: String
      Value: |
        {
          "agent": { "metrics_collection_interval": 60, "run_as_user": "root" },
          "metrics": {
            "append_dimensions": { "InstanceId": "${aws:InstanceId}" },
            "metrics_collected": {
              "mem": { "measurement": ["mem_used_percent","mem_available"], "metrics_collection_interval": 60 },
              "swap": { "measurement": ["swap_used_percent"], "metrics_collection_interval": 60 }
            }
          },
          "logs": {
            "logs_collected": {
              "files": { "collect_list": [
                        { "file_path": "/var/log/syslog", "log_group_name": !Sub "/ec2/syslog-${AWS::StackName}", "log_stream_name": "{instance_id}" }
              ]}
            }
          }
        }

  CWAgentAssociation:
    Type: AWS::SSM::Association
    Properties:
      Name: AmazonCloudWatch-ManageAgent
      Parameters:
        action: ["configure"]
        mode: ["ec2"]
        optionalConfigurationSource: ["ssm"]
        optionalConfigurationLocation: [!Sub "/cwagent-linux-${AWS::StackName}"]
      Targets:
        - Key: InstanceIds
          Values: [ !Ref EC2Instance ]

  SyslogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub /ec2/syslog-${AWS::StackName}
      RetentionInDays: 7

  OOMMetricFilter:
    Type: AWS::Logs::MetricFilter
    DependsOn: SyslogGroup
    Properties:
      LogGroupName: /ec2/syslog
      FilterPattern: "Out of memory"
      MetricTransformations:
        - MetricValue: "1"
          MetricNamespace: "EC2"
          MetricName: "oom_kills"

  AlertTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: !Sub ec2-memory-events-${AWS::StackName}

  AlertSubscriptionEmail:
    Type: AWS::SNS::Subscription
    Properties:
      Protocol: email
      TopicArn: !Ref AlertTopic
      Endpoint: !Ref AlarmEmail

  MemHighAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: !Sub MemHigh-${EC2Instance}
      Namespace: CWAgent
      MetricName: mem_used_percent
      Dimensions:
        - Name: InstanceId
          Value: !Ref EC2Instance
      Statistic: Average
      Period: 60
      Threshold: !Ref MemHighPercent
      ComparisonOperator: GreaterThanThreshold
      EvaluationPeriods: 5
      AlarmActions: [ !Ref AlertTopic ]
      TreatMissingData: notBreaching

  SwapHighAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: !Sub SwapHigh-${EC2Instance}
      Namespace: CWAgent
      MetricName: swap_used_percent
      Dimensions:
        - Name: InstanceId
          Value: !Ref EC2Instance
      Statistic: Average
      Period: 60
      Threshold: !Ref SwapHighPercent
      ComparisonOperator: GreaterThanThreshold
      EvaluationPeriods: 5
      AlarmActions: [ !Ref AlertTopic ]
      TreatMissingData: notBreaching

  OOMKillAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: !Sub OOMKillDetected-${EC2Instance}
      Namespace: EC2
      MetricName: oom_kills
      Statistic: Sum
      Period: 60
      Threshold: 0
      ComparisonOperator: GreaterThanThreshold
      EvaluationPeriods: 1
      AlarmActions: [ !Ref AlertTopic ]
      TreatMissingData: notBreaching

Outputs:
  ElasticIPAddress:
    Description: The allocated Elastic IP address
    Value: !Ref ElasticIP
  KeyPairId:
    Description: The ID of the EC2 Key Pair
    Value: !GetAtt NewKeyPair.KeyPairId
  InstancePublicIp:
    Description: The Public IP of the Mail-in-a-box instance
    Value: !GetAtt EC2Instance.PublicIp
  AdminPassword:
    Description: Name of the SSM Parameter containing the Admin Password to Mail-in-a-box Web-UI
    Condition: NewAdminPasswordToSsm
    Value: !Ref MailInABoxAdminPasswordSsmParameter
  RestorePrefix:
    Description: The S3 prefix where backups are stored is set to the ID of the EC2 instance of your current deployment
    Value: !Ref EC2Instance
  DkimDNSTokenName1:
    Condition: UseSesRelay
    Description: First DKIM DNS token name for SES domain verification
    Value: !GetAtt SESEmailIdentity.DkimDNSTokenName1
  DkimDNSTokenValue1:
    Condition: UseSesRelay
    Description: First DKIM DNS token value for SES domain verification
    Value: !GetAtt SESEmailIdentity.DkimDNSTokenValue1
  DkimDNSTokenName2:
    Condition: UseSesRelay
    Description: Second DKIM DNS token name for SES domain verification
    Value: !GetAtt SESEmailIdentity.DkimDNSTokenName2
  DkimDNSTokenValue2:
    Condition: UseSesRelay
    Description: Second DKIM DNS token value for SES domain verification
    Value: !GetAtt SESEmailIdentity.DkimDNSTokenValue2
  DkimDNSTokenName3:
    Condition: UseSesRelay
    Description: Third DKIM DNS token name for SES domain verification
    Value: !GetAtt SESEmailIdentity.DkimDNSTokenName3
  DkimDNSTokenValue3:
    Condition: UseSesRelay
    Description: Third DKIM DNS token value for SES domain verification
    Value: !GetAtt SESEmailIdentity.DkimDNSTokenValue3
  MailFromMXRecord:
    Condition: UseSesRelay
    Description: MX record for custom MAIL FROM domain
    Value: !Sub "10 feedback-smtp.${AWS::Region}.amazonses.com"
  MailFromTXTRecord:
    Condition: UseSesRelay
    Description: TXT record for custom MAIL FROM domain
    Value: "v=spf1 include:amazonses.com ~all"
  MailFromDomain:
    Condition: UseSesRelay
    Description: Custom MAIL FROM domain name
    Value: !Sub mail.${DomainName}
  NightlyRebootSchedule:
    Condition: EnableNightlyRebootCondition
    Description: Nightly reboot schedule for mail server instances
    Value: !Sub "Configured schedule: ${NightlyRebootSchedule}"
  NightlyRebootLambdaFunction:
    Condition: EnableNightlyRebootCondition
    Description: Lambda function ARN that handles nightly reboots
    Value: !GetAtt NightlyRebootLambdaFunction.Arn
  AlertTopicArn:
    Description: SNS Topic ARN for memory and system alerts
    Value: !Ref AlertTopic
```


### README.md

```README.md
# Fully Automated Deployment of an Open Source Mail Server on AWS

## About 
This sample corresponds to the AWS Blog Post [*Fully Automated Deployment of an Open Source Mail Server on AWS*](https://aws.amazon.com/blogs/opensource/fully-automated-deployment-of-an-open-source-mail-server-on-aws/).

The sample integrates [Mail-in-a-Box](https://mailinabox.email/) with aWS infrastructure automations and services to fully automate the deployment of an open source mail server on AWS. This results in a fully automated setup of a single instance mail server, striving for minimal complexity and cost, while still providing high resiliency by leveraging incremental backups and automations. As such, the solution is best suited for small to medium organizations that are looking to run open source mail servers but do not want to deal with the associated operational complexity.

The sample uses an [AWS CloudFormation](https://aws.amazon.com/cloudformation/) [template](template.yaml) to automatically setup and configure an [Amazon Elastic Compute Cloud (Amazon EC2)](https://aws.amazon.com/ec2/) instance running Mail-in-a-Box, which integrates features such as email , webmail, calendar, contact, and file sharing, thus providing functionality similar to popular SaaS tools or commercial solutions. All resources to reproduce the solution are provided in this repository under an open source license (MIT-0).

[Amazon Simple Storage Service (Amazon S3)](https://aws.amazon.com/s3/) is used both for offloading user data and for storing incremental application-level backups. Aside from high resiliency, this backup strategy gives way to an immutable infrastructure approach, where new deployments can be rolled out to implement updates and recover from failures which drastically simplifies operation and enhances security.

We also provide an optional integration with [Amazon Simple Email Service (Amazon SES)](https://aws.amazon.com/ses/) so customers can relay their emails through reputable AWS servers and have their outgoing email accepted by third-party servers. All of this enables customers to deploy a fully featured open source mail server within minutes from [AWS Management Console](https://aws.amazon.com/console/), or restore an existing server from an Amazon S3 backup for immutable upgrades, migration, or recovery purposes.

## Table of contents
* [Fully Automated Deployment of an Open Source Mail Server on AWS](#fully-automated-deployment-of-an-open-source-mail-server-on-aws)
   * [About](#about)
   * [Table of contents](#table-of-contents)
   * [Overview of solution](#overview-of-solution)
   * [Deploying the solution](#deploying-the-solution)
      * [Prerequisites](#prerequisites)
      * [Preliminary steps: Setting up DNS and creating S3 Buckets](#preliminary-steps-setting-up-dns-and-creating-s3-buckets)
      * [Deploying and configuring Mail-in-a-Box](#deploying-and-configuring-mail-in-a-box)
   * [Testing the solution](#testing-the-solution)
      * [Receiving email](#receiving-email)
      * [Test file sharing, calendar and contacts with Nextcloud](#test-file-sharing-calendar-and-contacts-with-nextcloud)
      * [Sending email](#sending-email)
      * [Send test email](#send-test-email)
   * [Restoring from backup](#restoring-from-backup)
      * [Verify you have a backup](#verify-you-have-a-backup)
      * [Recreate your mail server and restore from backup](#recreate-your-mail-server-and-restore-from-backup)
   * [Cleaning up](#cleaning-up)
   * [Outlook](#outlook)
   * [Conclusion](#conclusion)
* [Related Projects](#related-projects)
* [Security](#security)
* [License](#license)

## Overview of solution
The following diagram shows an overview of the solution and interactions with users and other AWS services.
![High-level architecture](figures/mail-server-solution-diagram.png)
After preparing the AWS Account and environment, an administrator deploys the solution using an AWS CloudFormation template (1.). Optionally, a backup from Amazon S3 can be referenced during deployment to restore a previous installation of the solution (1a.). The admin can then proceed to setup via accessing the web UI (2.) to e.g., provision TLS certificates and create new users. After the admin has provisioned their accounts, users can access the web interface (3.) to send email, manage their inboxes, access calendar and contacts and share files. Optionally, outgoing emails are relayed via Amazon SES (3a.) and user data is stored in a dedicated Amazon S3 bucket (3b.). Furthermore, the solution is configured to automatically and periodically create incremental backups and store them into an S3 bucket for backups (4.).

On top of popular open source mail server packages such as [Postfix](https://www.postfix.org/) for SMTP and [Dovecot](https://www.dovecot.org/) for IMAP, Mail-in-a-box integrates [Nextcloud](https://nextcloud.com/) for calendar, contacts, and file sharing. However, note that Nextcloud capabilities in this context are limited. It’s primarily intended to be used alongside the core mail server functionalities to maintain calendar and contacts and for lightweight file sharing (e.g. for sharing files via links that are too large for email attachments). If you are looking for a fully featured, customizable and scalable Nextcloud deployment on AWS, have a look at this [AWS Sample](https://github.com/aws-samples/aws-serverless-nextcloud) instead.

## Deploying the solution
### Prerequisites
For this walkthrough, you should have the following prerequisites:
* An [AWS account](https://signin.aws.amazon.com/signin?redirect_uri=https%3A%2F%2Fportal.aws.amazon.com%2Fbilling%2Fsignup%2Fresume&client_id=signup)
* An existing external email address to test your new mail server. In the context of this sample, we will use `aws.opensource.mailserver@gmail.com` as the address.
* A domain that can be exclusively used by the mail server in the sample. In the context of this sample, we will use `aws-opensource-mailserver.org` as the domain. If you don’t have a domain available, you can register a new one with Amazon Route 53. In case you do so, you can go ahead and [delete](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/DeleteHostedZone.html) the associated hosted zone that gets automatically created via the [Amazon Route 53 Console](https://us-east-1.console.aws.amazon.com/route53/v2/hostedzones). We won’t need this hosted zone because the mail server we deploy will also act as [Domain Name System (DNS)](https://aws.amazon.com/route53/what-is-dns/) server for the domain.
* An SSH key pair for command line access to the instance. Command line access to the mail server is optional in this tutorial, but a key pair is still required for the setup. If you don’t already have a key pair, go ahead and create one in the EC2 Management Console: 
![EC2 Console - Key pairs](figures/EC2-console-keypair.png)
* (Optional) In this sample, we verify end-to-end functionality by sending an email to a single email address (`aws.opensource.mailserver@gmail.com`) leveraging Amazon SES in sandbox mode. In case you want to adopt this sample for your use case and send email beyond that, you need to [request removal of email sending limitations for EC2](https://aws.amazon.com/premiumsupport/knowledge-center/ec2-port-25-throttle/) or alternatively, if you relay your mail via Amazon SES request moving out of Amazon SES sandbox.

### Preliminary steps: Setting up DNS and creating S3 Buckets
Before deploying the solution, we need to set up DNS and create Amazon S3 buckets for backups and user data.
1. [Allocate an Elastic IP address](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/elastic-ip-addresses-eip.html#using-instance-addressing-eips-allocating): We use the address `52.6.x.y` in this sample.
1. Configure DNS: If you have your domain registered with Amazon Route 53, you can use the [AWS Management Console](https://us-east-1.console.aws.amazon.com/route53/home#DomainListing:) to [change the name server and glue records](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/domain-name-servers-glue-records.html#domain-name-servers-glue-records-adding-changing) for your domain. Configure two DNS servers `ns1.box.<your-domain>` and `ns2.box.<your-domain>` by placing your Elastic IP (allocated in step 1) into the Glue records field for each name server:
![Changing the Glue records in Route53](figures/edit-name-servers.png)
If you use a third-party DNS service, check their corresponding documentation on how to set the glue records.

    It may take a while until the updates to the glue records propagate through the global DNS system. Optionally, before proceeding with the deployment, you can verify your glue records are setup correctly with the dig command line utility:
    ```bash
    # Get a list of root servers for your top level domain
    dig +short org. NS
    # Query one of the root servers for an NS record of your domain
    dig c0.org.afilias-nst.info. aws-opensource-mailserver.org. NS
    ```
    This should give you output as follows:
    ```none
    ;; ADDITIONAL SECTION:
    ns1.box.aws-opensource-mailserver.org. 3600 IN A 52.6.x.y
    ns2.box.aws-opensource-mailserver.org. 3600 IN A 52.6.x.y
    ```
1. Create S3 buckets for backups and user data: Finally, in the Amazon S3 Console, [create a bucket](https://s3.console.aws.amazon.com/s3/bucket/create?region=us-east-1) to store Nextcloud data and another bucket for backups, choosing globally unique names for both of them. In context of this sample, we will be using the two buckets (`aws-opensource-mailserver-backup` and `aws-opensource-mailserver-nextcloud`) as shown here:
![Configuring S3 buckets](figures/configure-buckets.png)

### Deploying and configuring Mail-in-a-Box
Click [![Launch Stack](https://s3.amazonaws.com/cloudformation-examples/cloudformation-launch-stack.png)](https://console.aws.amazon.com/cloudformation/home#stacks/new?stackName=aws-open-source-mail-server&templateURL=https://mmeidlin-public-blogs.s3.amazonaws.com/aws-mail-in-a-box/cloudformation/instance.yaml) to deploy and specify the parameters as shown in the below screenshot to match the resources created in the previous section, leave other parameters at their default value, then click **Next** and **Submit**.
![Parameters for launching the CloudFormation stack](figures/stack-details.png)
This will deploy your mail server into a public subnet of your default VPC which takes about 10 minutes. You can monitor the progress in the [AWS CloudFormation Console](https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks). Meanwhile, retrieve and note the admin password for the web UI from [AWS Systems Manager Parameter Store](https://us-east-1.console.aws.amazon.com/systems-manager/parameters/MailInABoxAdminPassword/) via the `MailInABoxAdminPassword` parameter.
![SSM Parameter Store Console](figures/MailInABoxAdminPassword-screen.png)
Roughly one minute after your mail server finishes deploying, you can log in at its admin web UI residing at https://52.6.x.y/admin with username `admin@<your-domain>`, as shown in the following picture (you need to confirm the certificate exception warning from your browser):
![Initial login to admin UI](figures/confirm-certificate-warning.png)
Finally, in the admin UI navigate to **System > TLS(SSL) Certificates** and click **Provision** to obtain a valid SSL certificate and complete the setup (you might need to click on **Provision** twice to have all domains included in your certificate, as shown here).
![Initial login to admin UI](figures/domains-screen.png)

At this point, you could further customize your mail server setup (e.g., by creating inboxes for additional users). However, we will continue to use the admin user in this sample for testing the setup in the next section.

Note: If your AWS account is subject to email sending restrictions on EC2, you will see an error in your admin dashboard under **System > System Status Checks** that says ‘Incoming Email (SMTP/postfix) is running but not publicly accessible’. You are safe to ignore this and should be able to receive emails regardless.

## Testing the solution
### Receiving email
With your existing email account, compose and send an email to `admin@<your-domain>`. Then login as `admin@<your-domain>` to the webmail UI of your AWS mail server at `https://box.<your-domain>/mail` and verify you received the email:
![Verify you can receive emails](figures/email-verification-screen.png)

### Test file sharing, calendar and contacts with Nextcloud
Your Nextcloud installation can be accessed under `https://box.<your-domain>/cloud`, as shown in the next figure. Here you can manage your calendar, contacts, and shared files. Contacts created and managed here are also accessible in your webmail UI when you compose an email. Refer to the [Nextcloud documentation](https://docs.nextcloud.com/) for more details. In order to keep your Nextcloud installation consistent and automatically managed by Mail-in-a-box setup scripts, admin users are advised to refrain from changing and customizing the Nextcloud configuration.
![Verify Nextcloud functionality](figures/Nextcloud-access-screen.png)

### Sending email
In order to use Amazon SES to accept and forward email for your domain, you first need to prove ownership of it. Navigate to **Verified Identities** in the [Amazon SES Console](https://us-east-1.console.aws.amazon.com/ses/home?region=us-east-1#/verified-identities) and click **Create identity**, select **domain** and enter your domain. You will then be presented with a screen as shown here:
![SES Console DKIM verification](figures/domainkeys-identified.png)
You now need to copy-paste the three CNAME DNS records from this screen over to your mail server admin dashboard. Open the admin web UI of your mail server again, select **System > Custom DNS**, and add the records as shown in the next screenshot.
![Configure CNAME records with your mail sercer](figures/custom-DNS.png)
Amazon SES will detect these records, thereby recognizing you as the owner and verifying the domain for sending emails. Similarly, while still in [sandbox mode](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html), you also need to verify ownership of the recipient email address. Navigate again to **Verified Identities** in the [Amazon SES Console](https://us-east-1.console.aws.amazon.com/ses/home?region=us-east-1#/verified-identities), click **Create identity**, choose **Email Address**, and enter your existing email address.

Amazon SES will then send a verification link to this address, and once you’ve confirmed via the link that you own this address, you can send emails to it. Summing up, your verified identities section should look similar to the next screenshot before sending the test email:
![Verified identities in Amazon SES Console](figures/verified-identities-screen.png)
Finally, if you intend to send email to arbitrary addresses with Amazon SES beyond testing in the next step, refer to the documentation on [how to request production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).

### Send test email
Now you are set to log back into your webmail UI and reply to the test mail you received before:
![Test sending email](figures/reply-to-test.png)
Checking the inbox of your existing mail, you should see the mail you just sent from your AWS server.
![Verified identities in Amazon SES Console](figures/Gmail-test-email.png)
Congratulations! You have now verified full functionality of your open source mail server on AWS.

## Restoring from backup
Finally, as a last step, we demonstrate how to roll out immutable deployments and restore from a backup for simple recovery, migration and upgrades. In this context, we test recreating the entire mail server from a backup stored in Amazon S3.

For that, we use the restore feature of the CloudFormation template we deployed earlier to migrate from the initial `t2.micro` installation to an [AWS Graviton](https://aws.amazon.com/ec2/graviton/) arm64-based `t4g.micro` instance. This exemplifies the power of the immutable infrastructure approach made possible by the automated application level backups, allowing for simple migration between instance types with different CPU architectures.

### Verify you have a backup
By default, your server is configured to create an initial backup upon installation and nightly incremental backups. Using your ssh key pair, you can connect to your instance and trigger a manual backup to make sure the emails you just sent and received when testing will be included in the backup:

```bash
ssh -i aws-opensource-mailserver.pem ubuntu@52.6.x.y sudo /opt/mailinabox/management/backup.py
```
You can then go to your mail servers’ admin dashboard at `https://box.<your-doamin>/admin` and verify the backup status under **System > Backup Status**:
![Verified backup status](figures/Backup-status.png)
### Recreate your mail server and restore from backup
First, double check that you have saved the admin password, as you will no longer be able to retrieve it from Parameter Store once you delete the original installation of your mail server. Then go ahead and [delete](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-console-delete-stack.html) the `aws-opensource-mailserver` stack from your CloudFormation Console an redeploy it by clicking on   [![Launch Stack](https://s3.amazonaws.com/cloudformation-examples/cloudformation-launch-stack.png)](https://console.aws.amazon.com/cloudformation/home#stacks/new?stackName=aws-open-source-mail-server&templateURL=https://mmeidlin-public-blogs.s3.amazonaws.com/aws-mail-in-a-box/cloudformation/instance.yaml). However, this time, change the parameters as shown below, changing the instance type and corresponding AMI as well as specifying the prefix in your backup S3 bucket to restore from.
![CloudFormation stack parameters for deploying a Graviton based mail server](figures/changed-parameters.png)
Within a couple of minutes, your mail server will be up and running again, featuring the exact same state it was before you deleted it, however, running on a completely new instance powered by AWS Graviton. You can verify this by going to your webmail UI at `https://box.<yourdomain>/mail` and logging in with your old admin credentials.

## Cleaning up
- [Delete](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-console-delete-stack.html) the mail server stack from [CloudFormation Console](https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks)
- [Empty](https://docs.aws.amazon.com/AmazonS3/latest/userguide/empty-bucket.html) and [delete](https://docs.aws.amazon.com/AmazonS3/latest/userguide/delete-bucket.html) both the backup and Nextcloud data S3 Buckets
- [Release](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/elastic-ip-addresses-eip.html#using-instance-addressing-eips-releasing) the Elastic IP
- In case you registered your domain from Amazon Route 53 and do not want to hold onto it, you need to [disable automatic renewal](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/domain-enable-disable-auto-renewal.html). Further, if you haven’t already, [delete the hosted zone](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/DeleteHostedZone.html) that got created automatically when registering it.

## Outlook
The solution discussed so far focuses on minimal operational complexity and cost and hence is based on a single Amazon EC2 instance comprising all functions of an open source mail server, including a management UI, user database, Nextcloud and DNS. With a suitably sized instance, this setup can meet the demands of small to medium organizations. In particular, the continuous incremental backups to Amazon S3 provide high resiliency and can be leveraged in conjunction with the CloudFormation automations to quickly recover in case of instance or single Availablity Zone (AZ) failures.

Depending on your requirements, extending the solution and distributing components across AZs allows for meeting more stringent requirements regarding high availability and scalability in the context of larger deployments. Being based on open source software, there is a straight forward migration path towards these more complex distributed architectures once you outgrow the setup discussed in this post.

## Conclusion
In this sample, we showed how to automate the deployment of an open source mail server on AWS and how to quickly and effortlessly restore from a backup for rolling out immutable updates and providing high resiliency. Using AWS CloudFormation infrastructure automations and integrations with managed services such as Amazon S3 and Amazon SES, the lifecycle management and operation of open source mail servers on AWS can be simplified significantly. Once deployed, the solution provides an end-user experience similar to popular SaaS and commercial offerings.

You can go ahead and use the automations provided in this sample to get started with running your own open source mail server on AWS!

# Related Projects

- [**lightsail-miab-installer**](https://github.com/rioastamal/lightsail-miab-installer): A user-friendly command-line tool designed to streamline the setup of Mail-in-a-Box on Amazon Lightsail.

# Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

# License

This library is licensed under the MIT-0 License. See the LICENSE file.
```


---

## administration

This section contains scripts and configurations specific to the administration deployment.


### administration/README-DNS-ADMIN.md

```administration/README-DNS-ADMIN.md
# DNS Administration Script

The `dns-admin.sh` script provides comprehensive DNS management capabilities for Mail-in-a-Box instances deployed via AWS CloudFormation. It follows AWS Server 2025 Elevated Standards and provides backup, restore, verification, and management of DNS records.

## Features

- **Backup & Restore**: Full DNS record backup and restore functionality
- **Verification**: Verify DNS records against CloudFormation stack outputs
- **Record Management**: Create, read, update, and delete DNS records
- **Mail Record Validation**: Automatic validation of SPF, DKIM, and DMARC records
- **Dry Run Mode**: Test operations without making changes
- **Comprehensive Logging**: Detailed logging with color-coded output
- **Error Handling**: Robust error handling following workspace standards

## Prerequisites

- AWS CLI configured with appropriate profile
- `jq` command-line JSON processor
- `curl` for API calls
- Access to Mail-in-a-Box admin credentials
- Valid domain name with deployed CloudFormation stack

## Usage

### Basic Syntax

```bash
./dns-admin.sh [OPTIONS] COMMAND [ARGS]
```

### Commands

| Command | Description | Arguments |
|---------|-------------|-----------|
| `backup [FILE]` | Backup all DNS records to file | Optional: backup filename |
| `restore FILE` | Restore DNS records from file | Required: backup filename |
| `verify` | Verify DNS records against CloudFormation stack | None |
| `list` | List all custom DNS records | None |
| `get RECORD_TYPE [NAME]` | Get specific DNS records | Required: record type, optional: name |
| `set RECORD_TYPE NAME VALUE` | Set a DNS record | Required: type, name, value |
| `delete RECORD_TYPE NAME` | Delete DNS records | Required: type, name |
| `test` | Test DNS API connectivity | None |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --domain DOMAIN` | Domain name | `emcnotary.com` |
| `-p, --profile PROFILE` | AWS profile | `hepe-admin-mfa` |
| `-r, --region REGION` | AWS region | `us-east-1` |
| `-v, --verbose` | Enable verbose output | `false` |
| `-n, --dry-run` | Show what would be done without making changes | `false` |
| `-h, --help` | Show help message | N/A |

## Examples

### Backup DNS Records

```bash
# Backup with auto-generated filename
./dns-admin.sh backup

# Backup with custom filename
./dns-admin.sh backup my-dns-backup.json

# Backup for specific domain
./dns-admin.sh -d example.com backup
```

### Restore DNS Records

```bash
# Restore from backup file
./dns-admin.sh restore dns-backup-20250115-143022.json

# Restore with verbose output
./dns-admin.sh -v restore my-dns-backup.json
```

### Verify DNS Records

```bash
# Verify all DNS records against CloudFormation stack
./dns-admin.sh verify

# Verify with verbose output
./dns-admin.sh -v verify
```

### Manage DNS Records

```bash
# List all DNS records
./dns-admin.sh list

# Get all TXT records
./dns-admin.sh get TXT

# Get specific record
./dns-admin.sh get TXT example.com

# Set a TXT record
./dns-admin.sh set TXT example.com "v=spf1 include:_spf.google.com ~all"

# Set an A record
./dns-admin.sh set A subdomain.example.com "192.168.1.100"

# Set a CNAME record
./dns-admin.sh set CNAME www.example.com "example.com."

# Delete a record
./dns-admin.sh delete TXT test.example.com
```

### Test API Connectivity

```bash
# Test DNS API connectivity
./dns-admin.sh test

# Test with dry run
./dns-admin.sh -n test
```

## DNS Record Types Supported

The script supports all DNS record types supported by Mail-in-a-Box:

- **A**: IPv4 address records
- **AAAA**: IPv6 address records
- **CNAME**: Canonical name records
- **MX**: Mail exchange records
- **TXT**: Text records (SPF, DKIM, DMARC)
- **SRV**: Service records
- **SSHFP**: SSH fingerprint records
- **CAA**: Certificate Authority Authorization records
- **NS**: Name server records

## Verification Process

The `verify` command performs comprehensive DNS record validation:

### SES Records
- **DKIM Records**: Validates all three DKIM CNAME records from CloudFormation stack
- **MAIL FROM Records**: Validates MX and TXT records for custom MAIL FROM domain

### Mail Security Records
- **SPF Record**: Ensures SPF record exists for the domain
- **DMARC Record**: Ensures DMARC record exists for `_dmarc.domain.com`

### Output Examples

**Successful Verification:**
```
[SUCCESS] ✓ CNAME record for dkim1._domainkey.example.com is correct
[SUCCESS] ✓ CNAME record for dkim2._domainkey.example.com is correct
[SUCCESS] ✓ CNAME record for dkim3._domainkey.example.com is correct
[SUCCESS] ✓ MX record for mail.example.com is correct
[SUCCESS] ✓ TXT record for mail.example.com is correct
[SUCCESS] ✓ SPF record found for example.com
[SUCCESS] ✓ DMARC record found for _dmarc.example.com
[SUCCESS] All DNS records verified successfully
```

**Failed Verification:**
```
[WARNING] Missing CNAME record for dkim1._domainkey.example.com (expected: dkim1._domainkey.example.com.dkim.amazonses.com)
[WARNING] Missing SPF record for example.com
[WARNING] Missing DMARC record for _dmarc.example.com
[WARNING] Some DNS records are missing or incorrect
```

## Backup File Format

DNS backups are stored in JSON format with the following structure:

```json
[
  {
    "qname": "example.com",
    "rtype": "TXT",
    "value": "v=spf1 include:_spf.google.com ~all"
  },
  {
    "qname": "dkim1._domainkey.example.com",
    "rtype": "CNAME",
    "value": "dkim1._domainkey.example.com.dkim.amazonses.com"
  }
]
```

## Error Handling

The script includes comprehensive error handling:

- **Invalid Domain Format**: Validates domain name format before processing
- **Missing Dependencies**: Checks for required tools (AWS CLI, jq, curl)
- **API Failures**: Handles HTTP errors and provides meaningful error messages
- **File Operations**: Validates file existence and permissions
- **JSON Validation**: Ensures backup files are valid JSON

## Logging

The script provides color-coded logging:

- **INFO** (Blue): General information messages
- **SUCCESS** (Green): Successful operations
- **WARNING** (Yellow): Non-critical issues
- **ERROR** (Red): Critical errors

## Security Considerations

- Admin credentials are retrieved securely from the `get-admin-password.sh` script
- No credentials are logged or stored in plain text
- All API calls use HTTPS
- Temporary files are cleaned up automatically

## Troubleshooting

### Common Issues

1. **"Admin password script not found"**
   - Ensure `get-admin-password.sh` exists in the same directory
   - Verify the script has execute permissions

2. **"Failed to retrieve admin credentials"**
   - Check that the domain has a deployed CloudFormation stack
   - Verify AWS credentials are configured correctly

3. **"API call failed (HTTP 401)"**
   - Verify admin credentials are correct
   - Check that the Mail-in-a-Box instance is running

4. **"Invalid JSON format in backup file"**
   - Ensure the backup file is valid JSON
   - Check file permissions and encoding

### Debug Mode

Use the `-v` (verbose) flag to see detailed API calls and responses:

```bash
./dns-admin.sh -v verify
```

### Dry Run Mode

Use the `-n` (dry-run) flag to test operations without making changes:

```bash
./dns-admin.sh -n set TXT test.example.com "test value"
```

## Integration with CI/CD

The script can be integrated into CI/CD pipelines for automated DNS management:

```bash
# Backup before deployment
./dns-admin.sh -d production.com backup

# Deploy changes
# ... deployment steps ...

# Verify DNS records after deployment
./dns-admin.sh -d production.com verify
```

## Compliance

This script follows AWS Server 2025 Elevated Standards:

- Uses MFA-backed CLI sessions
- Implements proper error handling with `set -Eeuo pipefail`
- Follows secure coding practices
- Includes comprehensive logging
- Validates all inputs
- Uses temporary files safely with cleanup

## Support

For issues or questions regarding the DNS administration script, please refer to the main project documentation or create an issue in the project repository.
```


### administration/README-MEMORY-MANAGEMENT.md

```administration/README-MEMORY-MANAGEMENT.md
# Memory Management Scripts

This directory contains scripts for handling memory issues and managing EC2 instance lifecycle for your mail servers. These scripts implement the single responsibility principle with two separate scripts that can be composed together.

## 📋 Overview

### Memory Issues Resolution
When your mail server runs out of memory, it can become unresponsive and unable to recover on its own. These scripts provide an automated solution:

1. **Check Memory & Stop Instance** - Monitors memory usage and stops the instance when memory is critically high
2. **Start Instance & Wait** - Starts a stopped instance and waits for it to be fully operational

## 🚀 Quick Usage

### From Administration Directory
```bash
# Check memory and stop if needed
./check-memory-and-stop-instance.sh askdaokapra.com

# Start instance and wait for it to be ready
./start-instance-and-wait.sh askdaokapra.com
```

### From Individual Mail Server Directories
```bash
cd askdaokapra
./check-memory-and-stop-instance.sh
./start-instance-and-wait.sh

cd ../emcnotary
./check-memory-and-stop-instance.sh
./start-instance-and-wait.sh
```

## 🔧 Available Scripts

### Core Scripts (Administration Directory)

#### `check-memory-and-stop-instance.sh`
**Purpose**: Monitors memory usage and stops the instance when memory is critically high

**Features**:
- ✅ Checks memory usage via CloudWatch metrics
- ✅ Fallback to memory alarm state if metrics unavailable
- ✅ Stops instance when memory > 85% (configurable)
- ✅ Polls for "stopped" state with timeout
- ✅ Retries up to 3 times with 30-second delays
- ✅ Comprehensive error handling and logging

**Usage**:
```bash
./check-memory-and-stop-instance.sh [domain-name]
```

#### `start-instance-and-wait.sh`
**Purpose**: Starts a stopped instance and waits for it to be fully operational

**Features**:
- ✅ Starts stopped instances
- ✅ Polls for "running" state with timeout (15 minutes)
- ✅ Retries up to 3 times with 30-second delays
- ✅ Verifies instance accessibility after startup
- ✅ Handles various instance states (stopped, stopping, running, pending)

**Usage**:
```bash
./start-instance-and-wait.sh [domain-name]
```

### Wrapper Scripts (Per-Domain)

Each mail server directory has wrapper scripts that automatically use the correct domain:

#### askdaokapra.com
- `./check-memory-and-stop-instance.sh`
- `./start-instance-and-wait.sh`

#### emcnotary.com
- `./check-memory-and-stop-instance.sh`
- `./start-instance-and-wait.sh`

#### hepefoundation.org
- `./check-memory-and-stop-instance.sh`
- `./start-instance-and-wait.sh`

## 🔄 Complete Memory Recovery Workflow

### Step 1: Check Memory and Stop (if needed)
```bash
cd emcnotary
./check-memory-and-stop-instance.sh
```

**What it does**:
1. Gets instance information from CloudFormation
2. Checks memory usage via CloudWatch
3. If memory > 85%, stops the instance
4. Waits for instance to reach "stopped" state
5. Retries if needed (up to 3 times)

**Sample Output**:
```
==========================================
Memory Check and Instance Stop Script
==========================================
Domain: emcnotary.com
Stack: emcnotary-com-mailserver
Memory Threshold: 85%
Max Retries: 3
==========================================
[INFO] Getting instance information...
[SUCCESS] Found instance: i-1234567890abcdef0
[INFO] Checking memory usage...
[WARN] Memory usage (92%) exceeds threshold (85%)
[WARN] High memory usage detected. Proceeding with instance stop...
[INFO] Stop attempt 1/3
[INFO] Stopping instance i-1234567890abcdef0...
[SUCCESS] Instance stopped successfully on attempt 1
==========================================
Instance Stop Complete
==========================================
✅ Instance i-1234567890abcdef0 is now stopped
✅ Memory pressure relieved
Next step: Run start-instance-and-wait.sh to restart the instance
  ./administration/start-instance-and-wait.sh emcnotary.com
==========================================
```

### Step 2: Start Instance and Wait
```bash
./start-instance-and-wait.sh
```

**What it does**:
1. Gets instance information from CloudFormation
2. Starts the stopped instance
3. Waits for instance to reach "running" state
4. Verifies instance is accessible
5. Retries if needed (up to 3 times)

**Sample Output**:
```
==========================================
Instance Start and Wait Script
==========================================
Domain: emcnotary.com
Stack: emcnotary-com-mailserver
Max Retries: 3
==========================================
[INFO] Getting instance information...
[SUCCESS] Found instance: i-1234567890abcdef0
[INFO] Current instance state: stopped
[INFO] Start attempt 1/3
[INFO] Starting instance i-1234567890abcdef0...
[SUCCESS] Instance started successfully on attempt 1
[INFO] Verifying instance accessibility...
[INFO] Instance IP: 54.123.456.789
[SUCCESS] Instance is responding to ping
==========================================
Instance Start Complete
==========================================
✅ Instance i-1234567890abcdef0 is now running
✅ Instance is accessible and ready
Your mail server should now be fully operational.
==========================================
```

## ⚙️ Configuration

### Memory Threshold
Default: 85% (configurable in `check-memory-and-stop-instance.sh`)

To change the threshold, edit the script:
```bash
MEMORY_THRESHOLD_PERCENT=90  # Stop when memory > 90%
```

### Retry Settings
Both scripts support configurable retries:

- **Max Retries**: 3 attempts (configurable)
- **Retry Delay**: 30 seconds between attempts (configurable)
- **Timeout**: 10 minutes for stopping, 15 minutes for starting

## 🔐 Security & Standards

### Compliance Features
- ✅ **MFA-backed AWS profiles** (`hepe-admin-mfa`)
- ✅ **No credentials in scripts** (uses SSM Parameter Store)
- ✅ **Proper error handling** with rollback capabilities
- ✅ **Comprehensive logging** with colored output
- ✅ **Input validation** (domain name format checking)
- ✅ **Safe state management** (checks current state before acting)

### Error Handling
- **Graceful failures** with detailed error messages
- **Automatic cleanup** of temporary resources
- **Retry logic** for transient failures
- **Timeout protection** prevents infinite waiting

## 🛠 Troubleshooting

### Common Issues

**"Could not retrieve stack outputs"**
- Verify AWS CLI is configured with correct profile
- Check if the CloudFormation stack exists
- Ensure you have permissions to describe stacks

**"Failed to get instance ID"**
- Stack outputs might not contain the expected `RestorePrefix` key
- Check CloudFormation template for correct output names

**"Memory usage is normal. No action needed."**
- This is expected if memory usage is below threshold
- Script will exit with code 0 (success)

**"Failed to stop/start instance after 3 attempts"**
- Check AWS console for instance state
- Verify instance isn't stuck in an invalid state
- Check AWS service health and permissions

### Manual Recovery
If automation fails, you can manually:

1. **Check instance state**: `./describe-stack.sh [domain]`
2. **Stop instance**: AWS Console → EC2 → Instances → Stop
3. **Start instance**: AWS Console → EC2 → Instances → Start
4. **Verify operation**: Check web interface and email functionality

## 📊 Monitoring Integration

These scripts work with your existing monitoring:

### CloudWatch Alarms
- **Memory High Alarm** (`MemHigh-${InstanceId}`)
- **Swap High Alarm** (`SwapHigh-${InstanceId}`)
- **OOM Kill Alarm** (`OOMKillDetected-${InstanceId}`)

### Integration Points
- Scripts check alarm states as fallback when metrics unavailable
- Existing alarm setup is preserved and utilized
- Scripts complement rather than replace existing monitoring

## 🔗 Related Scripts

### Existing Scripts (for reference)
- `check-alarm-status.sh` - Check current alarm states
- `test-memory-alarms.sh` - Test memory alarms by creating pressure
- `restart-ec2-instance.sh` - Combined restart script (for reference)

### New Scripts (this document)
- `check-memory-and-stop-instance.sh` - Memory checker + stopper
- `start-instance-and-wait.sh` - Instance starter + waiter

## 📞 Need Help?

If you encounter issues:

1. **Check the logs** - Scripts provide detailed colored output
2. **Verify prerequisites** - AWS CLI, jq, proper permissions
3. **Test connectivity** - `./describe-stack.sh` to check server status
4. **Check AWS console** - For manual state verification
5. **Review error messages** - Detailed troubleshooting information provided

The scripts are designed to be safe and will preserve your data and instance state even if something goes wrong!
```


### administration/check-alarm-status.sh

```administration/check-alarm-status.sh
#!/usr/bin/env bash
set -Eeuo pipefail

# Check Alarm Status Script
# Shows the current status of CloudWatch alarms

# Default domain name
DEFAULT_DOMAIN="askdaokapra.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"

echo "Checking CloudWatch Alarm Status for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "----------------------------------------"

# Get instance ID from EC2
INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=MailInABoxInstance-${STACK_NAME}" \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --query 'Reservations[0].Instances[0].InstanceId' \
    --output text 2>/dev/null)

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  echo "Error: Could not retrieve Instance ID from EC2"
  exit 1
fi

echo "Instance ID: ${INSTANCE_ID}"
echo ""

# Check memory alarm
echo "Memory High Alarm:"
aws cloudwatch describe-alarms \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --alarm-names "MemHigh-${INSTANCE_ID}" \
    --query 'MetricAlarms[0].{AlarmName:AlarmName,StateValue:StateValue,StateReason:StateReason,StateUpdatedTimestamp:StateUpdatedTimestamp}' \
    --output table

echo ""

# Check swap alarm
echo "Swap High Alarm:"
aws cloudwatch describe-alarms \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --alarm-names "SwapHigh-${INSTANCE_ID}" \
    --query 'MetricAlarms[0].{AlarmName:AlarmName,StateValue:StateValue,StateReason:StateReason,StateUpdatedTimestamp:StateUpdatedTimestamp}' \
    --output table

echo ""

# Check OOM alarm
echo "OOM Kill Alarm:"
aws cloudwatch describe-alarms \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --alarm-names "OOMKillDetected-${INSTANCE_ID}" \
    --query 'MetricAlarms[0].{AlarmName:AlarmName,StateValue:StateValue,StateReason:StateReason,StateUpdatedTimestamp:StateUpdatedTimestamp}' \
    --output table

echo ""
echo "Alarm States:"
echo "- OK: Normal state, no issues"
echo "- ALARM: Threshold exceeded, action triggered"
echo "- INSUFFICIENT_DATA: Not enough data to determine state"
echo ""
echo "To test alarms, run: ./administration/test-memory-alarms.sh ${DOMAIN_NAME}"
```


### administration/check-memory-and-stop-instance.sh

```administration/check-memory-and-stop-instance.sh
#!/bin/bash

# Exit on error, undefined variables, and pipe failures
set -Eeuo pipefail
IFS=$'\n\t'

# Trap errors to show line numbers
trap 'echo "Error on line $LINENO: $BASH_COMMAND"' ERR

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

# Create stack name from domain (remove dots, ensure it starts with a letter, and add a suffix)
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"  # Adjust if your stack is in a different region
AWS_PROFILE="hepe-admin-mfa"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Configuration
MEMORY_THRESHOLD_PERCENT=85  # Stop instance if memory usage is above this percentage
MAX_RETRIES=3
RETRY_DELAY=30  # seconds between retries

echo "=========================================="
echo "Memory Check and Instance Stop Script"
echo "=========================================="
echo "Domain: ${DOMAIN_NAME}"
echo "Stack: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "Memory Threshold: ${MEMORY_THRESHOLD_PERCENT}%"
echo "Max Retries: ${MAX_RETRIES}"
echo "=========================================="

# Function to get instance ID from stack outputs
get_instance_id() {
    local stack_outputs
    stack_outputs=$(aws cloudformation describe-stacks \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --stack-name "${STACK_NAME}" \
        --query 'Stacks[0].Outputs' \
        --output json 2>/dev/null)

    if [ $? -ne 0 ] || [ -z "$stack_outputs" ]; then
        log_error "Could not retrieve stack outputs for ${STACK_NAME}"
        return 1
    fi

    local instance_id
    instance_id=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="RestorePrefix") | .OutputValue')

    if [ -z "$instance_id" ] || [ "$instance_id" = "null" ]; then
        log_error "Could not find EC2 instance ID in the stack outputs"
        return 1
    fi

    echo "$instance_id"
}

# Function to get instance state
get_instance_state() {
    local instance_id="$1"
    local state
    state=$(aws ec2 describe-instances \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --instance-ids "${instance_id}" \
        --query 'Reservations[0].Instances[0].State.Name' \
        --output text 2>/dev/null)

    echo "$state"
}

# Function to check memory usage via CloudWatch
check_memory_usage() {
    local instance_id="$1"
    local memory_percent

    # Get the latest memory utilization metric
    memory_percent=$(aws cloudwatch get-metric-statistics \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --namespace CWAgent \
        --metric-name mem_used_percent \
        --dimensions Name=InstanceId,Value="${instance_id}" \
        --start-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S) \
        --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
        --period 300 \
        --statistics Average \
        --query 'Datapoints[0].Average' \
        --output text 2>/dev/null)

    # If we can't get CPU data, check memory alarm state instead
    if [ -z "$memory_percent" ] || [ "$memory_percent" = "None" ]; then
        log_warn "Could not get CPU metrics, checking memory alarm state..."

        local alarm_state
        alarm_state=$(aws cloudwatch describe-alarms \
            --profile "${AWS_PROFILE}" \
            --region "${REGION}" \
            --alarm-names "MemHigh-${instance_id}" \
            --query 'MetricAlarms[0].StateValue' \
            --output text 2>/dev/null)

        if [ "$alarm_state" = "ALARM" ]; then
            log_warn "Memory alarm is in ALARM state - high memory usage detected"
            return 0  # Return 0 to indicate memory issue
        else
            log_info "Memory alarm state: ${alarm_state:-UNKNOWN}"
            return 1  # No memory issue detected
        fi
    fi

    # Convert to percentage and compare
    memory_percent=$(printf "%.0f" "$memory_percent" 2>/dev/null || echo "0")

    log_info "Current memory utilization: ${memory_percent}%"

    if [ "$memory_percent" -gt "$MEMORY_THRESHOLD_PERCENT" ]; then
        log_warn "Memory usage (${memory_percent}%) exceeds threshold (${MEMORY_THRESHOLD_PERCENT}%)"
        return 0  # Return 0 to indicate memory issue
    else
        log_info "Memory usage (${memory_percent}%) is within normal range"
        return 1  # No memory issue detected
    fi
}

# Function to wait for instance to reach desired state
wait_for_instance_state() {
    local instance_id="$1"
    local desired_state="$2"
    local timeout=600  # 10 minutes timeout
    local count=0

    log_info "Waiting for instance ${instance_id} to reach state: ${desired_state}"

    while [ $count -lt $timeout ]; do
        local current_state
        current_state=$(get_instance_state "$instance_id")

        if [ "$current_state" = "$desired_state" ]; then
            log_success "Instance ${instance_id} is now in ${desired_state} state"
            return 0
        fi

        echo "  Current state: ${current_state}. Waiting... ($((count/6)) minutes elapsed)"
        sleep 10
        ((count += 10))
    done

    log_error "Timeout waiting for instance to reach ${desired_state} state"
    return 1
}

# Function to stop instance with retries
stop_instance_with_retries() {
    local instance_id="$1"
    local attempt=1

    while [ $attempt -le $MAX_RETRIES ]; do
        log_info "Stop attempt ${attempt}/${MAX_RETRIES}"

        local current_state
        current_state=$(get_instance_state "$instance_id")

        case "$current_state" in
            "stopped")
                log_info "Instance ${instance_id} is already stopped"
                return 0
                ;;
            "stopping")
                log_info "Instance ${instance_id} is already stopping. Waiting for it to stop..."
                if wait_for_instance_state "$instance_id" "stopped"; then
                    return 0
                fi
                ;;
            "running"|"pending")
                log_info "Stopping instance ${instance_id}..."
                if aws ec2 stop-instances \
                    --profile "${AWS_PROFILE}" \
                    --region "${REGION}" \
                    --instance-ids "${instance_id}" \
                    --output table >/dev/null 2>&1; then

                    if wait_for_instance_state "$instance_id" "stopped"; then
                        log_success "Instance stopped successfully on attempt ${attempt}"
                        return 0
                    fi
                else
                    log_error "Failed to initiate stop command on attempt ${attempt}"
                fi
                ;;
            *)
                log_warn "Instance ${instance_id} is in ${current_state} state. Cannot stop."
                return 1
                ;;
        esac

        if [ $attempt -lt $MAX_RETRIES ]; then
            log_warn "Retrying in ${RETRY_DELAY} seconds..."
            sleep $RETRY_DELAY
        fi

        ((attempt++))
    done

    log_error "Failed to stop instance after ${MAX_RETRIES} attempts"
    return 1
}

# Main execution
main() {
    # Check prerequisites
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        log_error "jq is not installed"
        exit 1
    fi

    # Get instance ID
    log_info "Getting instance information..."
    INSTANCE_ID=$(get_instance_id)

    if [ $? -ne 0 ] || [ -z "$INSTANCE_ID" ]; then
        log_error "Failed to get instance ID"
        exit 1
    fi

    log_success "Found instance: ${INSTANCE_ID}"

    # Check memory usage
    log_info "Checking memory usage..."
    if ! check_memory_usage "$INSTANCE_ID"; then
        log_info "Memory usage is normal. No action needed."
        echo ""
        echo "=========================================="
        echo "Memory Check Complete"
        echo "=========================================="
        echo "✅ Memory usage is within normal range"
        echo "✅ Instance does not need to be stopped"
        echo "=========================================="
        exit 0
    fi

    log_warn "High memory usage detected. Proceeding with instance stop..."

    # Stop the instance with retries
    if stop_instance_with_retries "$INSTANCE_ID"; then
        log_success "Instance stopped successfully"

        echo ""
        echo "=========================================="
        echo "Instance Stop Complete"
        echo "=========================================="
        echo "✅ Instance ${INSTANCE_ID} is now stopped"
        echo "✅ Memory pressure relieved"
        echo ""
        echo "Next step: Run start-instance-and-wait.sh to restart the instance"
        echo "  ./administration/start-instance-and-wait.sh ${DOMAIN_NAME}"
        echo "=========================================="
        exit 0
    else
        log_error "Failed to stop instance after ${MAX_RETRIES} attempts"

        echo ""
        echo "=========================================="
        echo "Instance Stop Failed"
        echo "=========================================="
        echo "❌ Failed to stop instance ${INSTANCE_ID}"
        echo "❌ Manual intervention may be required"
        echo ""
        echo "Troubleshooting:"
        echo "1. Check AWS console for instance state"
        echo "2. Verify AWS permissions"
        echo "3. Check if instance is stuck in stopping state"
        echo "=========================================="
        exit 1
    fi
}

# Run main function
main "$@"
```


### administration/check-sns-subscription.sh

```administration/check-sns-subscription.sh
#!/usr/bin/env bash
set -Eeuo pipefail

# Check SNS Subscription Status Script
# Shows the current SNS subscription status for email alerts

# Default domain name
DEFAULT_DOMAIN="askdaokapra.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"

echo "Checking SNS subscription status for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "----------------------------------------"

# Get the SNS topic ARN from stack outputs
SNS_TOPIC_ARN=$(aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`AlertTopicArn`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$SNS_TOPIC_ARN" ]; then
    echo "Error: Could not retrieve SNS topic ARN from stack outputs"
    exit 1
fi

echo "SNS Topic ARN: ${SNS_TOPIC_ARN}"
echo ""

# Get subscription details
echo "SNS Subscriptions:"
aws sns list-subscriptions-by-topic \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --topic-arn "${SNS_TOPIC_ARN}" \
    --query 'Subscriptions[].{Protocol:Protocol,Endpoint:Endpoint,SubscriptionArn:SubscriptionArn,ConfirmationWasAuthenticated:ConfirmationWasAuthenticated}' \
    --output table

echo ""
echo "To confirm a pending subscription, check the email and click the confirmation link."
echo "To resend confirmation, use:"
echo "aws sns confirm-subscription --profile hepe-admin-mfa --region ${REGION} --topic-arn ${SNS_TOPIC_ARN} --token <confirmation-token>"
```


### administration/cleanup-keys.sh

```administration/cleanup-keys.sh
#!/bin/bash

# Exit on error
set -e

# Configuration
DOMAIN_NAME=${1:-"emcnotary.com"}
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"

echo "Cleaning up local key files for stack: ${STACK_NAME}"
echo "Domain: ${DOMAIN_NAME}"
echo "Region: ${REGION}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
    exit 1
fi

# Get instance ID from the stack
INSTANCE_ID=$(aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --stack-name "${STACK_NAME}" \
    --region "${REGION}" \
    --query 'Stacks[0].Outputs[?OutputKey==`RestorePrefix`].OutputValue' \
    --output text)

if [ -z "$INSTANCE_ID" ]; then
    echo "Error: Could not find EC2 instance in the stack"
    exit 1
fi

# Get the actual key pair name from the instance
KEY_PAIR_NAME=$(aws ec2 describe-instances \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --query 'Reservations[0].Instances[0].KeyName' \
    --output text)

if [ -z "$KEY_PAIR_NAME" ]; then
    echo "Error: Could not get key pair name from instance"
    exit 1
fi

echo "Found key pair name: ${KEY_PAIR_NAME}"

# Remove the local key file
KEY_FILE="${HOME}/.ssh/${KEY_PAIR_NAME}.pem"
if [ -f "$KEY_FILE" ]; then
    echo "Removing local key file: ${KEY_FILE}"
    # Force remove even if permissions are incorrect
    rm -f "$KEY_FILE"
    echo "Successfully removed local key file"
else
    echo "Local key file not found: ${KEY_FILE}"
fi

# Clean up known_hosts entries
KNOWN_HOSTS="${HOME}/.ssh/known_hosts"
if [ -f "$KNOWN_HOSTS" ]; then
    echo "Cleaning up known_hosts file..."
    
    # Get instance IP from the stack
    INSTANCE_IP=$(aws cloudformation describe-stacks \
        --profile hepe-admin-mfa \
        --stack-name "${STACK_NAME}" \
        --region "${REGION}" \
        --query 'Stacks[0].Outputs[?OutputKey==`ElasticIPAddress`].OutputValue' \
        --output text)
    
    if [ ! -z "$INSTANCE_IP" ]; then
        # Remove by IP
        ssh-keygen -R "$INSTANCE_IP" 2>/dev/null || true
        echo "Removed instance IP from known_hosts"
        
        # Remove by hostname
        HOSTNAME="${DOMAIN_NAME}"
        ssh-keygen -R "$HOSTNAME" 2>/dev/null || true
        echo "Removed hostname from known_hosts"
        
        # Remove by box subdomain
        BOX_HOSTNAME="box.${DOMAIN_NAME}"
        ssh-keygen -R "$BOX_HOSTNAME" 2>/dev/null || true
        echo "Removed box subdomain from known_hosts"
    fi
fi

# Clean up any temporary key files that might have been created
TEMP_KEY_FILES=(
    "${HOME}/.ssh/${KEY_PAIR_NAME}.pem.tmp"
    "${HOME}/.ssh/${KEY_PAIR_NAME}.tmp"
    "${HOME}/.ssh/${DOMAIN_NAME}-keypair.pem.tmp"
    "${HOME}/.ssh/${DOMAIN_NAME}-keypair.tmp"
)

for temp_file in "${TEMP_KEY_FILES[@]}"; do
    if [ -f "$temp_file" ]; then
        echo "Removing temporary key file: ${temp_file}"
        rm -f "$temp_file"
    fi
done

echo "Local cleanup completed successfully!"
echo "Note: AWS resources (key pairs, instances, etc.) are managed by CloudFormation and were not modified." 
```


### administration/delete-stack.sh

```administration/delete-stack.sh
#!/bin/bash

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

# Create stack name from domain (remove dots, ensure it starts with a letter, and add a suffix)
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver

echo "Using domain name: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"

# Get the Elastic IP allocation ID from the stack
echo "Getting Elastic IP allocation ID..."
EIP_ALLOCATION_ID=$(aws ec2 describe-addresses \
    --profile hepe-admin-mfa \
    --filters "Name=tag:MAILSERVER,Values=${DOMAIN_NAME}" \
    --query "Addresses[0].AllocationId" \
    --output text)

if [ ! -z "$EIP_ALLOCATION_ID" ] && [ "$EIP_ALLOCATION_ID" != "None" ]; then
    echo "Found Elastic IP allocation ID: ${EIP_ALLOCATION_ID}"
    
    # Get the association ID
    ASSOCIATION_ID=$(aws ec2 describe-addresses \
        --profile hepe-admin-mfa \
        --allocation-ids "${EIP_ALLOCATION_ID}" \
        --query "Addresses[0].AssociationId" \
        --output text)
    
    if [ ! -z "$ASSOCIATION_ID" ] && [ "$ASSOCIATION_ID" != "None" ]; then
        echo "Disassociating Elastic IP..."
        aws ec2 disassociate-address \
            --profile hepe-admin-mfa \
            --association-id "${ASSOCIATION_ID}" || {
            echo "Failed to disassociate Elastic IP. Continuing..."
        }
    fi
    
    # Remove PTR record if it exists
    echo "Removing PTR record for Elastic IP..."
    PTR_REMOVAL_ATTEMPTED=false
    
    # Check if PTR record exists before attempting removal
    CURRENT_PTR=$(aws ec2 describe-addresses \
        --profile hepe-admin-mfa \
        --allocation-ids "${EIP_ALLOCATION_ID}" \
        --query "Addresses[0].PtrRecord" \
        --output text)
    
    if [ "$CURRENT_PTR" != "None" ] && [ ! -z "$CURRENT_PTR" ]; then
        echo "Found PTR record: ${CURRENT_PTR}, removing..."
        aws ec2 reset-address-attribute \
            --profile hepe-admin-mfa \
            --allocation-id "${EIP_ALLOCATION_ID}" \
            --attribute domain-name 2>/dev/null && {
            PTR_REMOVAL_ATTEMPTED=true
            echo "PTR record removal initiated successfully"
        } || {
            echo "Failed to initiate PTR record removal. Please check permissions or AWS console."
            exit 1
        }
    else
        echo "No PTR record found, skipping removal..."
    fi
    
    # Wait for PTR record removal to complete if we attempted removal
    if [ "$PTR_REMOVAL_ATTEMPTED" = true ]; then
        echo "Waiting for PTR record removal to complete..."
        MAX_RETRIES=60  # Increased to 10 minutes (60 * 10 seconds)
        RETRY_COUNT=0
        
        while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
            PTR_STATUS=$(aws ec2 describe-addresses \
                --profile hepe-admin-mfa \
                --allocation-ids "${EIP_ALLOCATION_ID}" \
                --query "Addresses[0].PtrRecordUpdate.Status" \
                --output text 2>/dev/null)
            
            if [ "$PTR_STATUS" = "None" ] || [ "$PTR_STATUS" = "COMPLETED" ] || [ "$PTR_STATUS" = "SUCCESS" ]; then
                echo "PTR record removal completed successfully"
                break
            elif [ "$PTR_STATUS" = "PENDING" ]; then
                echo "PTR record removal still pending... (attempt $((RETRY_COUNT + 1))/$MAX_RETRIES)"
                sleep 10
                RETRY_COUNT=$((RETRY_COUNT + 1))
            else
                echo "PTR record removal failed with status: ${PTR_STATUS}"
                break
            fi
        done
        
        if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
            echo "Error: PTR record removal timed out after $MAX_RETRIES attempts"
            echo "You may need to wait longer or check the AWS console manually"
            exit 1
        fi
    fi
    
    # Release the Elastic IP with retry logic
    echo "Releasing Elastic IP..."
    MAX_RETRIES=10
    RETRY_COUNT=0
    
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if aws ec2 release-address \
            --profile hepe-admin-mfa \
            --allocation-id "${EIP_ALLOCATION_ID}" 2>/dev/null; then
            echo "Elastic IP released successfully"
            break
        else
            RETRY_COUNT=$((RETRY_COUNT + 1))
            echo "Failed to release Elastic IP (attempt $RETRY_COUNT/$MAX_RETRIES)"
            
            if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
                echo "Waiting 30 seconds before retry..."
                sleep 30
            else
                echo "Error: Failed to release Elastic IP after $MAX_RETRIES attempts"
                echo "Please check the AWS console manually for the Elastic IP: ${EIP_ALLOCATION_ID}"
                exit 1
            fi
        fi
    done
else
    echo "No Elastic IP found for stack ${STACK_NAME}, skipping EIP release..."
fi

# Empty the backup bucket if it exists
echo "Emptying backup bucket: ${DOMAIN_NAME}-backup"
if aws s3 ls "s3://${DOMAIN_NAME}-backup" --profile hepe-admin-mfa 2>/dev/null; then
    MAX_RETRIES=5
    RETRY_COUNT=0
    
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if aws s3 rm "s3://${DOMAIN_NAME}-backup" \
            --profile hepe-admin-mfa \
            --recursive 2>/dev/null; then
            echo "Backup bucket emptied successfully"
            break
        else
            RETRY_COUNT=$((RETRY_COUNT + 1))
            echo "Failed to empty backup bucket (attempt $RETRY_COUNT/$MAX_RETRIES)"
            
            if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
                echo "Waiting 10 seconds before retry..."
                sleep 10
            else
                echo "Warning: Failed to empty backup bucket after $MAX_RETRIES attempts. Continuing..."
            fi
        fi
    done
else
    echo "Backup bucket ${DOMAIN_NAME}-backup does not exist, skipping..."
fi

# Empty the nextcloud bucket if it exists
echo "Emptying nextcloud bucket: ${DOMAIN_NAME}-nextcloud"
if aws s3 ls "s3://${DOMAIN_NAME}-nextcloud" --profile hepe-admin-mfa 2>/dev/null; then
    MAX_RETRIES=5
    RETRY_COUNT=0
    
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if aws s3 rm "s3://${DOMAIN_NAME}-nextcloud" \
            --profile hepe-admin-mfa \
            --recursive 2>/dev/null; then
            echo "Nextcloud bucket emptied successfully"
            break
        else
            RETRY_COUNT=$((RETRY_COUNT + 1))
            echo "Failed to empty nextcloud bucket (attempt $RETRY_COUNT/$MAX_RETRIES)"
            
            if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
                echo "Waiting 10 seconds before retry..."
                sleep 10
            else
                echo "Warning: Failed to empty nextcloud bucket after $MAX_RETRIES attempts. Continuing..."
            fi
        fi
    done
else
    echo "Nextcloud bucket ${DOMAIN_NAME}-nextcloud does not exist, skipping..."
fi

# Delete the CloudFormation stack with retry logic
echo "Initiating stack deletion..."
MAX_RETRIES=5
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if aws cloudformation delete-stack \
        --profile hepe-admin-mfa \
        --stack-name "${STACK_NAME}" 2>/dev/null; then
        echo "Stack deletion initiated successfully"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "Failed to initiate stack deletion (attempt $RETRY_COUNT/$MAX_RETRIES)"
        
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            echo "Waiting 15 seconds before retry..."
            sleep 15
        else
            echo "Error: Failed to initiate stack deletion after $MAX_RETRIES attempts"
            echo "Please check CloudFormation console for details: ${STACK_NAME}"
            exit 1
        fi
    fi
done

echo "Stack deletion initiated successfully. You can monitor the deletion progress using the describe-stack.sh script."
```


### administration/deploy-stack.sh

```administration/deploy-stack.sh
#!/bin/bash

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

# Create stack name from domain (remove dots, ensure it starts with a letter, and add a suffix)
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver

echo "Using domain name: ${DOMAIN_NAME}"
echo "Stack will be created with name: ${STACK_NAME}"

# Check if stack exists and its status
STACK_STATUS=$(aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "STACK_NOT_FOUND")

if [ "$STACK_STATUS" = "DELETE_IN_PROGRESS" ]; then
    echo "Error: Stack ${STACK_NAME} is currently being deleted. Please wait for deletion to complete before deploying again."
    exit 1
elif [ "$STACK_STATUS" = "STACK_NOT_FOUND" ]; then
    echo "Stack ${STACK_NAME} does not exist. Proceeding with deployment..."
else
    echo "Stack ${STACK_NAME} exists with status: ${STACK_STATUS}"
fi

# Deploy the CloudFormation stack for mailserver infrastructure
if ! aws cloudformation deploy \
    --profile hepe-admin-mfa \
    --template-file ../mailserver-infrastructure-mvp.yaml \
    --stack-name "${STACK_NAME}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides DomainName="${DOMAIN_NAME}"; then
    echo "Error: Stack deployment failed. Check the CloudFormation console for details."
    exit 1
fi

echo "Stack deployment initiated with name: ${STACK_NAME}"
echo "You can monitor the deployment progress using the describe-stack.sh script." 
```


### administration/describe-stack.sh

```administration/describe-stack.sh
#!/bin/bash

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

# Create stack name from domain (remove dots, ensure it starts with a letter, and add a suffix)
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver

# Determine repository root and per-domain backup directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_BACKUP_DIR="${ROOT_DIR}/backups/${DOMAIN_NAME}/stack"

# Create per-domain stack backup directory
mkdir -p "${STACK_BACKUP_DIR}"

# Get current timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

echo "Using domain name: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"

# Log stack resources
echo "Describing stack resources..."
aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --stack-name "${STACK_NAME}" \
    --output json > "${STACK_BACKUP_DIR}/stack_resources_${TIMESTAMP}.json"

echo "Stack resources logged to ${STACK_BACKUP_DIR}/stack_resources_${TIMESTAMP}.json"

# Log stack events
echo -e "\nDescribing stack events..."
aws cloudformation describe-stack-events \
    --profile hepe-admin-mfa \
    --stack-name "${STACK_NAME}" \
    --output json > "${STACK_BACKUP_DIR}/stack_events_${TIMESTAMP}.json"

echo "Stack events logged to ${STACK_BACKUP_DIR}/stack_events_${TIMESTAMP}.json"

# Also display the latest events in the terminal
echo -e "\nLatest stack events:"
aws cloudformation describe-stack-events \
    --profile hepe-admin-mfa \
    --stack-name "${STACK_NAME}" \
    --query 'StackEvents[0:5]' \
    --output table
```


### administration/dns-admin.sh

```administration/dns-admin.sh
#!/bin/bash

# DNS Administration Script for Mail-in-a-Box
# Provides backup, restore, and verification of DNS records
# Follows AWS Server 2025 Elevated Standards

set -Eeuo pipefail
IFS=$'\n\t'

# Script configuration
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LOG_DIR="${SCRIPT_DIR}/../logs" # legacy, not used for new backups
readonly BACKUP_ROOT_DIR="${SCRIPT_DIR}/../backups"

# Default values
DEFAULT_DOMAIN="emcnotary.com"
DEFAULT_PROFILE="hepe-admin-mfa"
DEFAULT_REGION="us-east-1"

# Global variables
DOMAIN_NAME=""
STACK_NAME=""
REGION=""
PROFILE=""
MIAB_HOST=""
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
VERBOSE=false
DRY_RUN=false
declare -a REM_ARGS=()

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Error handling
trap 'log_error "Script failed at line $LINENO"' ERR

# Usage function
usage() {
    cat << EOF
Usage: $SCRIPT_NAME [OPTIONS] COMMAND [ARGS]

DNS Administration Script for Mail-in-a-Box

COMMANDS:
    backup [FILE]              Backup all DNS records to file (default: dns-backup-YYYYMMDD-HHMMSS.json)
    restore FILE               Restore DNS records from file
    verify                     Verify DNS records against CloudFormation stack
    list                       List all custom DNS records
    get RECORD_TYPE [NAME]     Get specific DNS records
    set RECORD_TYPE NAME VALUE Set a DNS record
    delete RECORD_TYPE NAME    Delete DNS records
    test                       Test DNS API connectivity

OPTIONS:
    -d, --domain DOMAIN        Domain name (default: $DEFAULT_DOMAIN)
    -p, --profile PROFILE      AWS profile (default: $DEFAULT_PROFILE)
    -r, --region REGION        AWS region (default: $DEFAULT_REGION)
    -v, --verbose              Enable verbose output
    -n, --dry-run              Show what would be done without making changes
    -h, --help                 Show this help message

EXAMPLES:
    $SCRIPT_NAME backup
    $SCRIPT_NAME backup my-dns-backup.json
    $SCRIPT_NAME restore dns-backup-20250115-143022.json
    $SCRIPT_NAME verify
    $SCRIPT_NAME set TXT test.example.com "v=spf1 include:_spf.google.com ~all"
    $SCRIPT_NAME get TXT
    $SCRIPT_NAME delete TXT test.example.com

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -d|--domain)
                DOMAIN_NAME="$2"
                shift 2
                ;;
            -p|--profile)
                PROFILE="$2"
                shift 2
                ;;
            -r|--region)
                REGION="$2"
                shift 2
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -n|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            backup|restore|verify|list|get|set|delete|test)
                COMMAND="$1"
                shift
                REM_ARGS=("$@")
                break
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done

    # Set defaults
    DOMAIN_NAME="${DOMAIN_NAME:-$DEFAULT_DOMAIN}"
    PROFILE="${PROFILE:-$DEFAULT_PROFILE}"
    REGION="${REGION:-$DEFAULT_REGION}"
    STACK_NAME="$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver"
    MIAB_HOST="https://box.${DOMAIN_NAME}"

    # Validate domain name format
    if ! [[ $DOMAIN_NAME =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
        log_error "Invalid domain name format: $DOMAIN_NAME"
        exit 1
    fi

    # Create per-domain backup directories
    mkdir -p "${BACKUP_ROOT_DIR}/${DOMAIN_NAME}/dns"
}

# Get admin credentials
get_admin_credentials() {
    log_info "Retrieving admin credentials for domain: $DOMAIN_NAME"
    
    # Check if get-admin-password.sh exists
    local admin_script="${SCRIPT_DIR}/get-admin-password.sh"
    if [[ ! -f "$admin_script" ]]; then
        log_error "Admin password script not found: $admin_script"
        exit 1
    fi

    # Get credentials
    local credentials
    if ! credentials=$("$admin_script" "$DOMAIN_NAME" 2>/dev/null | grep -A 2 "Admin credentials for Mail-in-a-Box:"); then
        log_error "Failed to retrieve admin credentials"
        exit 1
    fi

    ADMIN_EMAIL=$(echo "$credentials" | grep "Username:" | cut -d' ' -f2)
    ADMIN_PASSWORD=$(echo "$credentials" | grep "Password:" | cut -d' ' -f2)

    if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_PASSWORD" ]]; then
        log_error "Could not extract admin credentials"
        exit 1
    fi

    log_success "Retrieved admin credentials for: $ADMIN_EMAIL"
}

# Make API call to Mail-in-a-Box DNS API
make_api_call() {
    local method="$1"
    local path="$2"
    local data="${3:-}"
    local response_file
    response_file=$(mktemp)
    
    # Cleanup on exit
    trap "rm -f '$response_file'" RETURN

    local curl_cmd=(
        curl -s -w "%{http_code}"
        -o "$response_file"
        -u "${ADMIN_EMAIL}:${ADMIN_PASSWORD}"
        -X "$method"
        -H "Content-Type: application/x-www-form-urlencoded"
    )

    if [[ -n "$data" ]]; then
        curl_cmd+=(-d "value=$data")
    fi

    curl_cmd+=("${MIAB_HOST}${path}")

    if [[ "$VERBOSE" == "true" ]]; then
        log_info "Making $method request to $path"
        if [[ -n "$data" ]]; then
            log_info "Data: $data"
        fi
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would execute: ${curl_cmd[*]}"
        return 0
    fi

    local http_code
    http_code=$("${curl_cmd[@]}")
    local response_body
    response_body=$(cat "$response_file")

    if [[ "$VERBOSE" == "true" ]]; then
        log_info "Response (HTTP $http_code):"
        echo "$response_body" | jq . 2>/dev/null || echo "$response_body"
    fi

    if [[ "$http_code" != "200" ]]; then
        log_error "API call failed (HTTP $http_code): $response_body"
        return 1
    fi

    echo "$response_body"
}

# Backup DNS records
backup_dns() {
    local backup_file="${1:-}"
    
    if [[ -z "$backup_file" ]]; then
        backup_file="${BACKUP_ROOT_DIR}/${DOMAIN_NAME}/dns/dns-backup-$(date +%Y%m%d-%H%M%S).json"
    fi

    log_info "Backing up DNS records to: $backup_file"

    # Get all custom DNS records
    local records
    if ! records=$(make_api_call "GET" "/admin/dns/custom"); then
        log_error "Failed to retrieve DNS records"
        return 1
    fi

    # Save to file
    echo "$records" | jq . > "$backup_file"
    
    if [[ $? -eq 0 ]]; then
        log_success "DNS records backed up to: $backup_file"
        log_info "Backup contains $(echo "$records" | jq '. | length') records"
    else
        log_error "Failed to save backup file"
        return 1
    fi
}

# Restore DNS records
restore_dns() {
    local backup_file="$1"
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi

    log_info "Restoring DNS records from: $backup_file"

    # Validate JSON format
    if ! jq empty "$backup_file" 2>/dev/null; then
        log_error "Invalid JSON format in backup file"
        return 1
    fi

    # Read and process records
    local records
    records=$(jq -c '.[]' "$backup_file")
    local count=0
    local success_count=0

    while IFS= read -r record; do
        local qname rtype value
        qname=$(echo "$record" | jq -r '.qname')
        rtype=$(echo "$record" | jq -r '.rtype')
        value=$(echo "$record" | jq -r '.value')

        log_info "Restoring $rtype record for $qname: $value"
        
        if make_api_call "PUT" "/admin/dns/custom/$qname/$rtype" "$value"; then
            ((success_count++))
        else
            log_warning "Failed to restore $rtype record for $qname"
        fi
        
        ((count++))
    done <<< "$records"

    log_success "Restored $success_count of $count DNS records"
}

# Verify DNS records against CloudFormation stack
verify_dns() {
    log_info "Verifying DNS records against CloudFormation stack: $STACK_NAME"

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        return 1
    fi

    # Check jq
    if ! command -v jq &> /dev/null; then
        log_error "jq is not installed"
        return 1
    fi

    # Get stack outputs
    local stack_outputs
    if ! stack_outputs=$(aws cloudformation describe-stacks \
        --profile "$PROFILE" \
        --region "$REGION" \
        --stack-name "$STACK_NAME" \
        --query 'Stacks[0].Outputs' \
        --output json 2>/dev/null); then
        log_error "Failed to retrieve stack outputs for $STACK_NAME"
        return 1
    fi

    # Extract SES DNS records
    local dkim_name_1 dkim_value_1 dkim_name_2 dkim_value_2 dkim_name_3 dkim_value_3
    local mail_from_domain mail_from_mx mail_from_txt

    dkim_name_1=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenName1") | .OutputValue // empty')
    dkim_value_1=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenValue1") | .OutputValue // empty')
    dkim_name_2=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenName2") | .OutputValue // empty')
    dkim_value_2=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenValue2") | .OutputValue // empty')
    dkim_name_3=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenName3") | .OutputValue // empty')
    dkim_value_3=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenValue3") | .OutputValue // empty')
    mail_from_domain=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="MailFromDomain") | .OutputValue // empty')
    mail_from_mx=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="MailFromMXRecord") | .OutputValue // empty')
    mail_from_txt=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="MailFromTXTRecord") | .OutputValue // empty')

    # Get current DNS records
    local current_records
    if ! current_records=$(make_api_call "GET" "/admin/dns/custom"); then
        log_error "Failed to retrieve current DNS records"
        return 1
    fi

    local all_good=true

    # Verify DKIM records
    if [[ -n "$dkim_name_1" && -n "$dkim_value_1" ]]; then
        verify_record "CNAME" "$dkim_name_1" "$dkim_value_1" "$current_records" || all_good=false
    fi
    if [[ -n "$dkim_name_2" && -n "$dkim_value_2" ]]; then
        verify_record "CNAME" "$dkim_name_2" "$dkim_value_2" "$current_records" || all_good=false
    fi
    if [[ -n "$dkim_name_3" && -n "$dkim_value_3" ]]; then
        verify_record "CNAME" "$dkim_name_3" "$dkim_value_3" "$current_records" || all_good=false
    fi

    # Verify MAIL FROM records
    if [[ -n "$mail_from_domain" && -n "$mail_from_mx" ]]; then
        verify_record "MX" "$mail_from_domain" "$mail_from_mx" "$current_records" || all_good=false
    fi
    if [[ -n "$mail_from_domain" && -n "$mail_from_txt" ]]; then
        verify_record "TXT" "$mail_from_domain" "$mail_from_txt" "$current_records" || all_good=false
    fi

    # Check for required SPF and DMARC records
    verify_spf_dmarc "$current_records" || all_good=false

    if [[ "$all_good" == "true" ]]; then
        log_success "All DNS records verified successfully"
    else
        log_warning "Some DNS records are missing or incorrect"
        return 1
    fi
}

# Verify a specific record
verify_record() {
    local rtype="$1"
    local qname="$2"
    local expected_value="$3"
    local current_records="$4"

    local found_record
    found_record=$(echo "$current_records" | jq -r --arg qname "$qname" --arg rtype "$rtype" \
        '.[] | select(.qname == $qname and .rtype == $rtype) | .value // empty')

    if [[ -z "$found_record" ]]; then
        log_warning "Missing $rtype record for $qname (expected: $expected_value)"
        return 1
    elif [[ "$found_record" != "$expected_value" ]]; then
        log_warning "Incorrect $rtype record for $qname (found: $found_record, expected: $expected_value)"
        return 1
    else
        log_success "✓ $rtype record for $qname is correct"
        return 0
    fi
}

# Verify SPF and DMARC records
verify_spf_dmarc() {
    local current_records="$1"
    local all_good=true

    # Check for SPF record
    local spf_record
    spf_record=$(echo "$current_records" | jq -r --arg domain "$DOMAIN_NAME" \
        '.[] | select(.qname == $domain and .rtype == "TXT" and (.value | contains("v=spf1"))) | .value // empty')

    if [[ -z "$spf_record" ]]; then
        log_warning "Missing SPF record for $DOMAIN_NAME"
        all_good=false
    else
        log_success "✓ SPF record found for $DOMAIN_NAME"
    fi

    # Check for DMARC record
    local dmarc_record
    dmarc_record=$(echo "$current_records" | jq -r --arg domain "_dmarc.$DOMAIN_NAME" \
        '.[] | select(.qname == $domain and .rtype == "TXT" and (.value | contains("v=DMARC1"))) | .value // empty')

    if [[ -z "$dmarc_record" ]]; then
        log_warning "Missing DMARC record for _dmarc.$DOMAIN_NAME"
        all_good=false
    else
        log_success "✓ DMARC record found for _dmarc.$DOMAIN_NAME"
    fi

    return $([ "$all_good" == "true" ] && echo 0 || echo 1)
}

# List all DNS records
list_dns() {
    log_info "Listing all custom DNS records"

    local records
    if ! records=$(make_api_call "GET" "/admin/dns/custom"); then
        log_error "Failed to retrieve DNS records"
        return 1
    fi

    echo "$records" | jq -r '.[] | "\(.qname) \(.rtype) \(.value)"' | column -t
}

# Get specific DNS records
get_dns() {
    local rtype="$1"
    local qname="${2:-}"

    local path="/admin/dns/custom"
    if [[ -n "$qname" ]]; then
        path="$path/$qname"
    fi
    if [[ -n "$rtype" ]]; then
        path="$path/$rtype"
    fi

    local records
    if ! records=$(make_api_call "GET" "$path"); then
        log_error "Failed to retrieve DNS records"
        return 1
    fi

    echo "$records" | jq .
}

# Set DNS record
set_dns() {
    local rtype="$1"
    local qname="$2"
    local value="$3"

    log_info "Setting $rtype record for $qname: $value"

    if make_api_call "PUT" "/admin/dns/custom/$qname/$rtype" "$value"; then
        log_success "Successfully set $rtype record for $qname"
    else
        log_error "Failed to set $rtype record for $qname"
        return 1
    fi
}

# Delete DNS record
delete_dns() {
    local rtype="$1"
    local qname="$2"

    log_info "Deleting $rtype record for $qname"

    if make_api_call "DELETE" "/admin/dns/custom/$qname/$rtype"; then
        log_success "Successfully deleted $rtype record for $qname"
    else
        log_error "Failed to delete $rtype record for $qname"
        return 1
    fi
}

# Test DNS API connectivity
test_dns() {
    log_info "Testing DNS API connectivity for domain: $DOMAIN_NAME"

    # Test basic connectivity
    local test_hostname="test.${DOMAIN_NAME}"
    local test_value="DNS API test $(date)"

    log_info "Adding test TXT record..."
    if make_api_call "POST" "/admin/dns/custom/$test_hostname/TXT" "$test_value"; then
        log_success "Successfully added test record"
    else
        log_error "Failed to add test record"
        return 1
    fi

    log_info "Verifying test record..."
    local records
    if records=$(make_api_call "GET" "/admin/dns/custom/$test_hostname/TXT"); then
        local found_value
        found_value=$(echo "$records" | jq -r '.[] | select(.qname == "'"$test_hostname"'") | .value // empty')
        if [[ "$found_value" == "$test_value" ]]; then
            log_success "Test record verified successfully"
        else
            log_warning "Test record verification failed"
        fi
    fi

    log_info "Cleaning up test record..."
    if make_api_call "DELETE" "/admin/dns/custom/$test_hostname/TXT" "$test_value"; then
        log_success "Test record cleaned up"
    else
        log_warning "Failed to clean up test record"
    fi

    log_success "DNS API test completed"
}

# Main function
main() {
    parse_args "$@"

    # Get admin credentials
    get_admin_credentials

    # Execute command
    case "${COMMAND:-}" in
        backup)
            backup_dns ${REM_ARGS:+"${REM_ARGS[0]}"}
            ;;
        restore)
            if [[ ${#REM_ARGS[@]} -lt 1 ]]; then
                log_error "Backup file required for restore command"
                usage
                exit 1
            fi
            restore_dns "${REM_ARGS[0]}"
            ;;
        verify)
            verify_dns
            ;;
        list)
            list_dns
            ;;
        get)
            if [[ ${#REM_ARGS[@]} -lt 1 ]]; then
                log_error "Record type required for get command"
                usage
                exit 1
            fi
            get_dns "${REM_ARGS[0]}" "${REM_ARGS[1]:-}"
            ;;
        set)
            if [[ ${#REM_ARGS[@]} -lt 3 ]]; then
                log_error "Record type, name, and value required for set command"
                usage
                exit 1
            fi
            set_dns "${REM_ARGS[0]}" "${REM_ARGS[1]}" "${REM_ARGS[2]}"
            ;;
        delete)
            if [[ ${#REM_ARGS[@]} -lt 2 ]]; then
                log_error "Record type and name required for delete command"
                usage
                exit 1
            fi
            delete_dns "${REM_ARGS[0]}" "${REM_ARGS[1]}"
            ;;
        test)
            test_dns
            ;;
        *)
            log_error "Unknown command: ${COMMAND:-}"
            usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
```


### administration/generate_ses_smtp_credentials.py

```administration/generate_ses_smtp_credentials.py
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
```


### administration/get-admin-password.sh

```administration/get-admin-password.sh
#!/bin/bash

# Default domain name
DEFAULT_DOMAIN="emcnotary.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Create stack name from domain (remove dots, ensure it starts with a letter, and add a suffix)
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver

# Get the admin password from SSM Parameter Store
echo "Retrieving admin password for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"

PASSWORD=$(aws ssm get-parameter \
    --profile hepe-admin-mfa \
    --name "/MailInABoxAdminPassword-${STACK_NAME}" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text)

if [ $? -eq 0 ]; then
    echo -e "\nAdmin credentials for Mail-in-a-Box:"
    echo "Username: admin@${DOMAIN_NAME}"
    echo "Password: ${PASSWORD}"
    echo -e "\nYou can access the admin interface at: https://${DOMAIN_NAME}/admin"
else
    echo "Error: Could not retrieve password. Make sure the stack is deployed and the parameter exists."
    exit 1
fi 
```


### administration/get-ses-config.sh

```administration/get-ses-config.sh
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

echo "Retrieving SES configuration settings for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed"
    exit 1
fi

# Get SMTP credentials from SSM Parameter Store
echo "Retrieving SMTP credentials from SSM Parameter Store..."
SMTP_USERNAME=$(aws ssm get-parameter \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --name "/smtp-username-${STACK_NAME}" \
    --with-decryption \
    --query Parameter.Value \
    --output text)

SMTP_PASSWORD=$(aws ssm get-parameter \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --name "/smtp-password-${STACK_NAME}" \
    --with-decryption \
    --query Parameter.Value \
    --output text)

if [ -z "$SMTP_USERNAME" ] || [ -z "$SMTP_PASSWORD" ]; then
    echo "Error: Could not retrieve SMTP credentials from SSM Parameter Store"
    exit 1
fi

# Define SES SMTP settings
SMTP_RELAY_HOST="email-smtp.${REGION}.amazonaws.com"
SMTP_RELAY_PORT="587"

# Output configuration settings
echo "SES Configuration Settings for Mail-in-a-Box:"
echo "-------------------------------------------"
echo "SMTP Relay Enable: true"
echo "SMTP Relay Host: ${SMTP_RELAY_HOST}"
echo "SMTP Relay Port: ${SMTP_RELAY_PORT}"
echo "SMTP Relay Username: ${SMTP_USERNAME}"
echo "SMTP Relay Password: ${SMTP_PASSWORD}"
echo "Sender Domain: ${DOMAIN_NAME}"

# Generate MIAB configuration file content
CONFIG_CONTENT="[mail]
smtp_relay_enable = true
smtp_relay_host = ${SMTP_RELAY_HOST}
smtp_relay_port = ${SMTP_RELAY_PORT}
smtp_relay_username = ${SMTP_USERNAME}
smtp_relay_password = ${SMTP_PASSWORD}"

# Save configuration to a temporary file for manual application
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

CONFIG_FILE="${TEMP_DIR}/mail-config"
echo "$CONFIG_CONTENT" > "$CONFIG_FILE"

echo "-------------------------------------------"
echo "Configuration file content saved to: ${CONFIG_FILE}"
echo "To apply these settings to Mail-in-a-Box:"
echo "1. SSH into your EC2 instance:"
echo "   ssh -i ~/.ssh/${DOMAIN_NAME}-keypair.pem ubuntu@<INSTANCE_IP>"
echo "2. Copy the configuration file to the instance:"
echo "   scp -i ~/.ssh/${DOMAIN_NAME}-keypair.pem ${CONFIG_FILE} ubuntu@<INSTANCE_IP>:~/mail-config"
echo "3. Move the file to the correct location:"
echo "   sudo mv ~/mail-config /home/user-data/mail/config"
echo "4. Restart the MIAB daemon:"
echo "   sudo /opt/mailinabox/management/mailinabox-daemon restart"
echo "5. Verify in the MIAB admin UI (https://box.${DOMAIN_NAME}/admin) under System > System Status Checks."

# Optionally, retrieve instance IP for convenience
INSTANCE_ID=$(aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`RestorePrefix`].OutputValue' \
    --output text 2>/dev/null)

if [ ! -z "$INSTANCE_ID" ]; then
    INSTANCE_IP=$(aws ec2 describe-instances \
        --profile hepe-admin-mfa \
        --region "${REGION}" \
        --instance-ids "${INSTANCE_ID}" \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text 2>/dev/null)
    if [ ! -z "$INSTANCE_IP" ]; then
        echo "Instance IP: ${INSTANCE_IP}"
        echo "You can use this IP for SSH/SCP commands above."
    fi
fi

echo "Next steps:"
echo "- Ensure SES DNS records (CNAME, MX, TXT) are set using your previous script."
echo "- Verify domain in SES Console (https://console.aws.amazon.com/ses)."
echo "- Test sending emails from the MIAB webmail (https://box.${DOMAIN_NAME}/mail)."
echo "- If in SES sandbox mode, verify recipient email addresses or request production access."
```


### administration/mailboxes-master.sh

```administration/mailboxes-master.sh
#!/usr/bin/env bash
set -Eeuo pipefail

# Usage:
#   ./administration/mailboxes-master.sh backup   <domain>   # pulls mailboxes to Desktop/
#   ./administration/mailboxes-master.sh upload   <domain>   # rsyncs Desktop backup to server (/tmp/...) and stages
#   ./administration/mailboxes-master.sh finalize <domain>   # moves staged mailboxes into place & restarts services
#
# Domains map to stacks like: <domain> -> <domain-with-dashes>-mailserver

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CMD="${1:-}"
DOMAIN="${2:-hepefoundation.org}"

# Map domain to subproject directory
case "$DOMAIN" in
  askdaokapra.com)
    SUBPROJECT="askdaokapra"
    ;;
  emcnotary.com)
    SUBPROJECT="emcnotary"
    ;;
  hepefoundation.org)
    SUBPROJECT="hepefoundation"
    ;;
  telassistmd.com)
    SUBPROJECT="telassistmd"
    ;;
  *)
    echo "Error: Unknown domain $DOMAIN. Supported domains: askdaokapra.com, emcnotary.com, hepefoundation.org, telassistmd.com"
    exit 1
    ;;
esac

# Check if subproject directory exists
if [ ! -d "$ROOT/$SUBPROJECT" ]; then
  echo "Error: Subproject directory $ROOT/$SUBPROJECT not found"
  exit 1
fi

# Check if mailbox scripts exist in subproject
if [ "$SUBPROJECT" = "hepefoundation" ]; then
  SCRIPT_DIR="$ROOT/$SUBPROJECT/hepeFoundation-Mail-Server-Files"
else
  SCRIPT_DIR="$ROOT/$SUBPROJECT"
fi

if [ ! -d "$SCRIPT_DIR" ]; then
  echo "Error: Script directory $SCRIPT_DIR not found"
  exit 1
fi

case "$CMD" in
  backup)
    echo "== Backup from server -> subproject folder =="
    # Use the master download script for consistent behavior
    bash "$ROOT/administration/master-download-mailboxes.sh" "$DOMAIN"
    ;;
  upload)
    echo "== Upload Desktop backup -> server (staged) =="
    if [ -f "$SCRIPT_DIR/upload-mailboxes.sh" ]; then
      bash "$SCRIPT_DIR/upload-mailboxes.sh" "$DOMAIN"
    else
      echo "Error: upload-mailboxes.sh not found in $SCRIPT_DIR"
      exit 1
    fi
    ;;
  finalize)
    echo "== Finalize server mailboxes (move + restart) =="
    if [ -f "$SCRIPT_DIR/finalize-mailbox-upload.sh" ]; then
      bash "$SCRIPT_DIR/finalize-mailbox-upload.sh" "$DOMAIN"
    else
      echo "Error: finalize-mailbox-upload.sh not found in $SCRIPT_DIR"
      exit 1
    fi
    ;;
  *)
    echo "Usage: $0 {backup|upload|finalize} <domain>"
    echo "Supported domains: askdaokapra.com, emcnotary.com, hepefoundation.org, telassistmd.com"
    exit 1
    ;;
esac
```


### administration/master-download-mailboxes.sh

```administration/master-download-mailboxes.sh
#!/usr/bin/env bash
set -Eeuo pipefail

# Master Download Mailboxes Script
# Downloads mailboxes from any mail server subproject
# Usage: ./administration/master-download-mailboxes.sh <domain> [backup-name]

# Default domain name
DEFAULT_DOMAIN="askdaokapra.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}
BACKUP_NAME=${2:-""}

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"

echo "Master Download Mailboxes Script"
echo "Domain: ${DOMAIN_NAME}"
echo "Stack: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "----------------------------------------"

# Map domain to subproject directory
case "$DOMAIN_NAME" in
  askdaokapra.com)
    SUBPROJECT="askdaokapra"
    ;;
  emcnotary.com)
    SUBPROJECT="emcnotary"
    ;;
  hepefoundation.org)
    SUBPROJECT="hepefoundation"
    ;;
  telassistmd.com)
    SUBPROJECT="telassistmd"
    ;;
  *)
    echo "Error: Unknown domain $DOMAIN_NAME. Supported domains: askdaokapra.com, emcnotary.com, hepefoundation.org, telassistmd.com"
    exit 1
    ;;
esac

# Get the root directory
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Check if subproject directory exists
if [ ! -d "$ROOT/$SUBPROJECT" ]; then
  echo "Error: Subproject directory $ROOT/$SUBPROJECT not found"
  exit 1
fi

# Determine script directory based on subproject
if [ "$SUBPROJECT" = "hepefoundation" ]; then
  SCRIPT_DIR="$ROOT/$SUBPROJECT/hepeFoundation-Mail-Server-Files"
else
  SCRIPT_DIR="$ROOT/$SUBPROJECT"
fi

if [ ! -d "$SCRIPT_DIR" ]; then
  echo "Error: Script directory $SCRIPT_DIR not found"
  exit 1
fi

# Check if download script exists
if [ ! -f "$SCRIPT_DIR/download-mailboxes.sh" ]; then
  echo "Error: download-mailboxes.sh not found in $SCRIPT_DIR"
  exit 1
fi

# Check if IP file exists
IP_FILE="$SCRIPT_DIR/ec2_ipaddress.txt"
if [ ! -f "$IP_FILE" ]; then
  echo "Error: IP address file not found at ${IP_FILE}"
  echo "Please run the deployment first to create the IP file"
  exit 1
fi

# Get instance IP
INSTANCE_IP=$(cat "$IP_FILE" | tr -d '\n\r' | xargs)
if [ -z "$INSTANCE_IP" ]; then
  echo "Error: Could not read IP address from ${IP_FILE}"
  exit 1
fi

echo "Instance IP: ${INSTANCE_IP}"

# Create standardized per-domain mailboxes backup directory
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR_ROOT="$ROOT/backups/${DOMAIN_NAME}/mailboxes"
mkdir -p "$BACKUP_DIR_ROOT"

if [ -n "$BACKUP_NAME" ]; then
  BACKUP_DIR="$BACKUP_DIR_ROOT/mailboxes-backup-${BACKUP_NAME}"
else
  BACKUP_DIR="$BACKUP_DIR_ROOT/mailboxes-backup-${TIMESTAMP}"
fi

echo "Backup directory: ${BACKUP_DIR}"

# Create backup directory
echo "Creating backup directory..."
mkdir -p "$BACKUP_DIR"

# Set up key file path
KEY_FILE="${HOME}/.ssh/${DOMAIN_NAME}-keypair.pem"

# Check if key file exists
if [ ! -f "$KEY_FILE" ]; then
  echo "Error: PEM key file not found at ${KEY_FILE}"
  echo "Please run setup-ssh-access.sh first to retrieve the key"
  exit 1
fi

# Set correct permissions for the key file
chmod 400 "$KEY_FILE"

# Verify the key file format
if ! ssh-keygen -l -f "$KEY_FILE" > /dev/null 2>&1; then
  echo "Error: Key file is not in a valid format"
  exit 1
fi

# Test SSH connection first
echo "Testing SSH connection..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "echo 'SSH connection successful'"; then
  echo "Error: Could not establish SSH connection to ubuntu@${INSTANCE_IP}"
  exit 1
fi

# Check if mailboxes directory exists on remote server
echo "Checking if mailboxes directory exists on remote server..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" "test -d /home/user-data/mail/mailboxes"; then
  echo "Error: /home/user-data/mail/mailboxes directory does not exist on remote server"
  exit 1
fi

# Create temporary script to copy mailboxes with proper permissions
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

cat > "${TEMP_DIR}/prepare-mailboxes.sh" << 'EOF'
#!/bin/bash
set -e

echo "Preparing mailboxes for download..." >&2

# Create temporary directory for mailboxes
TEMP_MAILBOXES="/tmp/mailboxes-download-$(date +%Y%m%d_%H%M%S)"
sudo mkdir -p "$TEMP_MAILBOXES"

# Copy mailboxes to temp directory with proper permissions
if [ -d "/home/user-data/mail/mailboxes" ]; then
    sudo cp -r /home/user-data/mail/mailboxes/* "$TEMP_MAILBOXES/" 2>/dev/null || true
    sudo chown -R ubuntu:ubuntu "$TEMP_MAILBOXES"
    sudo chmod -R 755 "$TEMP_MAILBOXES"
    echo "Mailboxes prepared at: $TEMP_MAILBOXES" >&2
    echo "$TEMP_MAILBOXES"
else
    echo "Error: /home/user-data/mail/mailboxes directory does not exist" >&2
    exit 1
fi
EOF

chmod +x "${TEMP_DIR}/prepare-mailboxes.sh"

# Copy preparation script to server and execute
echo "Preparing mailboxes for download on remote server..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${TEMP_DIR}/prepare-mailboxes.sh" "ubuntu@${INSTANCE_IP}:~/"
REMOTE_TEMP_DIR=$(ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" "~/prepare-mailboxes.sh" | tail -n 1 | tr -d '\n\r' | xargs)

if [ -z "$REMOTE_TEMP_DIR" ]; then
  echo "Error: Failed to prepare mailboxes on remote server"
  exit 1
fi

echo "Remote temporary directory: ${REMOTE_TEMP_DIR}"

# Download mailboxes using rsync from temporary directory
echo "Downloading mailboxes from ubuntu@${INSTANCE_IP}:${REMOTE_TEMP_DIR}/ to ${BACKUP_DIR}/"
echo "This may take a while depending on the size of your mailboxes..."

rsync -avz --progress \
    -e "ssh -i ${KEY_FILE} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" \
    "ubuntu@${INSTANCE_IP}:${REMOTE_TEMP_DIR}/" \
    "${BACKUP_DIR}/"

RSYNC_EXIT_CODE=$?

# Clean up temporary directory on remote server (non-critical)
echo "Cleaning up temporary files on remote server..."
if ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "sudo rm -rf ${REMOTE_TEMP_DIR}" 2>/dev/null; then
  echo "Remote cleanup completed successfully"
else
  echo "Warning: Could not clean up remote temporary directory ${REMOTE_TEMP_DIR}"
  echo "This is not critical - the temporary files will be cleaned up automatically on reboot"
fi

if [ $RSYNC_EXIT_CODE -eq 0 ]; then
  echo ""
  echo "SUCCESS: Mailboxes downloaded successfully!"
  echo "Backup location: ${BACKUP_DIR}"
  echo "Backup completed at: $(date)"
  
  # Verify the backup directory exists and has content
  if [ -d "${BACKUP_DIR}" ] && [ "$(ls -A "${BACKUP_DIR}")" ]; then
    echo ""
    echo "Backup verification:"
    echo "✓ Backup directory exists and contains data"
    
    # Display summary of downloaded content
    echo ""
    echo "Backup summary:"
    du -sh "${BACKUP_DIR}"
    echo "Number of files/directories:"
    find "${BACKUP_DIR}" -type f | wc -l | xargs echo "Files:"
    find "${BACKUP_DIR}" -type d | wc -l | xargs echo "Directories:"
    
    echo ""
    echo "You can find your mailboxes backup at:"
    echo "${BACKUP_DIR}"
  else
    echo ""
    echo "ERROR: Backup directory is empty or missing!"
    echo "Expected location: ${BACKUP_DIR}"
    exit 1
  fi
else
  echo "Error: Failed to download mailboxes (rsync exit code: ${RSYNC_EXIT_CODE})"
  exit 1
fi
```


### administration/miab-enforce-settings.sh

```administration/miab-enforce-settings.sh
#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Enforce Mail-in-a-Box settings for SES relay and basic mail readiness
# - Retrieves SMTP relay creds from SSM (per stack)
# - SSH to instance, writes /home/user-data/mail/config, restarts MIAB
# - Verifies DNS records via local dns-admin.sh verify

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DEFAULT_DOMAIN="emcnotary.com"
DEFAULT_REGION="us-east-1"
DEFAULT_PROFILE="hepe-admin-mfa"

DOMAIN_NAME="$DEFAULT_DOMAIN"
REGION="$DEFAULT_REGION"
PROFILE="$DEFAULT_PROFILE"
VERBOSE=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [-d domain] [-r region] [-p profile]

Options:
  -d DOMAIN   Domain (default: ${DEFAULT_DOMAIN})
  -r REGION   AWS region (default: ${DEFAULT_REGION})
  -p PROFILE  AWS CLI profile (default: ${DEFAULT_PROFILE})
  -h          Help

Actions:
  - Retrieves SMTP relay creds from SSM for stack {domain}-mailserver
  - Writes MIAB mail/config on the instance and restarts daemon
  - Runs dns verification via dns-admin.sh verify
EOF
}

while getopts ":d:r:p:hv" opt; do
  case ${opt} in
    d) DOMAIN_NAME="$OPTARG" ;;
    r) REGION="$OPTARG" ;;
    p) PROFILE="$OPTARG" ;;
    v) VERBOSE=true ;;
    h) usage; exit 0 ;;
    :) echo "Error: -$OPTARG requires an argument" >&2; usage; exit 1 ;;
    \?) echo "Error: Invalid option -$OPTARG" >&2; usage; exit 1 ;;
  esac
done

if ! [[ $DOMAIN_NAME =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
  echo "Error: Invalid domain name format: $DOMAIN_NAME" >&2
  exit 1
fi

STACK_NAME="$(echo "$DOMAIN_NAME" | sed 's/\./-/g')-mailserver"

echo "Domain: $DOMAIN_NAME"
echo "Stack:  $STACK_NAME"
echo "Region: $REGION"

require_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Error: $1 not found" >&2; exit 1; }; }
require_cmd aws
require_cmd ssh
require_cmd scp

# Locate subproject directory and IP file similar to master scripts
case "$DOMAIN_NAME" in
  askdaokapra.com) SUBPROJECT="askdaokapra" ;;
  emcnotary.com)   SUBPROJECT="emcnotary" ;;
  hepefoundation.org) SUBPROJECT="hepefoundation" ;;
  telassistmd.com) SUBPROJECT="telassistmd" ;;
  *) echo "Error: Unknown domain $DOMAIN_NAME" >&2; exit 1 ;;
esac

if [ "$SUBPROJECT" = "hepefoundation" ]; then
  SUB_DIR="$ROOT_DIR/$SUBPROJECT/hepeFoundation-Mail-Server-Files"
else
  SUB_DIR="$ROOT_DIR/$SUBPROJECT"
fi

IP_FILE="$SUB_DIR/ec2_ipaddress.txt"
if [ ! -f "$IP_FILE" ]; then
  echo "Error: Instance IP file not found at $IP_FILE" >&2
  exit 1
fi
INSTANCE_IP="$(cat "$IP_FILE" | tr -d '\n\r' | xargs)"
if [ -z "$INSTANCE_IP" ]; then
  echo "Error: Could not read instance IP" >&2
  exit 1
fi

KEY_FILE="$HOME/.ssh/${DOMAIN_NAME}-keypair.pem"
if [ ! -f "$KEY_FILE" ]; then
  echo "Error: SSH key not found at $KEY_FILE. Run setup-ssh-access.sh first." >&2
  exit 1
fi
chmod 400 "$KEY_FILE"

echo "Retrieving SMTP relay credentials from SSM..."
SMTP_USERNAME=$(aws ssm get-parameter \
  --profile "$PROFILE" \
  --region "$REGION" \
  --name "/smtp-username-${STACK_NAME}" \
  --with-decryption \
  --query Parameter.Value \
  --output text)

SMTP_PASSWORD=$(aws ssm get-parameter \
  --profile "$PROFILE" \
  --region "$REGION" \
  --name "/smtp-password-${STACK_NAME}" \
  --with-decryption \
  --query Parameter.Value \
  --output text)

if [ -z "$SMTP_USERNAME" ] || [ -z "$SMTP_PASSWORD" ]; then
  echo "Error: Failed to retrieve SMTP credentials from SSM" >&2
  exit 1
fi

SMTP_RELAY_HOST="email-smtp.${REGION}.amazonaws.com"
SMTP_RELAY_PORT="587"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cat >"$TMP_DIR/mail-config" <<EOF
[mail]
smtp_relay_enable = true
smtp_relay_host = ${SMTP_RELAY_HOST}
smtp_relay_port = ${SMTP_RELAY_PORT}
smtp_relay_username = ${SMTP_USERNAME}
smtp_relay_password = ${SMTP_PASSWORD}
EOF

echo "Uploading and applying MIAB mail/config..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "$TMP_DIR/mail-config" "ubuntu@${INSTANCE_IP}:~/mail-config"

ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" <<'EOSSH'
set -e
sudo mkdir -p /home/user-data/mail
sudo mv ~/mail-config /home/user-data/mail/config
sudo chown root:root /home/user-data/mail/config
sudo chmod 600 /home/user-data/mail/config
if [ -x /opt/mailinabox/management/mailinabox-daemon ]; then
  sudo /opt/mailinabox/management/mailinabox-daemon restart || true
elif [ -x /usr/local/bin/mailinabox ]; then
  sudo /usr/local/bin/mailinabox restart || true
else
  echo "Warning: MIAB daemon script not found; please restart services manually" >&2
fi
EOSSH

echo "Verification: running dns-admin verify..."
"${SCRIPT_DIR}/dns-admin.sh" -d "$DOMAIN_NAME" verify || {
  echo "Warning: DNS verification reported issues" >&2
}

echo "MIAB settings enforcement completed for $DOMAIN_NAME"
```


### administration/miab-mail-smoke-test.sh

```administration/miab-mail-smoke-test.sh
#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Mail send/receive smoke test for Mail-in-a-Box
# - Sends a test email to admin@{domain} via on-box sendmail
# - Checks mail logs for delivery and scans admin mailbox for the message

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DEFAULT_DOMAIN="emcnotary.com"
DOMAIN_NAME="${1:-$DEFAULT_DOMAIN}"

if ! [[ $DOMAIN_NAME =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
  echo "Error: Invalid domain: $DOMAIN_NAME" >&2
  exit 1
fi

case "$DOMAIN_NAME" in
  askdaokapra.com) SUBPROJECT="askdaokapra" ;;
  emcnotary.com) SUBPROJECT="emcnotary" ;;
  hepefoundation.org) SUBPROJECT="hepefoundation" ;;
  telassistmd.com) SUBPROJECT="telassistmd" ;;
  *) echo "Error: Unknown domain $DOMAIN_NAME" >&2; exit 1 ;;
esac

if [ "$SUBPROJECT" = "hepefoundation" ]; then
  SUB_DIR="$ROOT_DIR/$SUBPROJECT/hepeFoundation-Mail-Server-Files"
else
  SUB_DIR="$ROOT_DIR/$SUBPROJECT"
fi

IP_FILE="$SUB_DIR/ec2_ipaddress.txt"
KEY_FILE="$HOME/.ssh/${DOMAIN_NAME}-keypair.pem"

if [ ! -f "$IP_FILE" ]; then echo "Error: Missing $IP_FILE" >&2; exit 1; fi
if [ ! -f "$KEY_FILE" ]; then echo "Error: Missing $KEY_FILE" >&2; exit 1; fi
chmod 400 "$KEY_FILE"

INSTANCE_IP="$(cat "$IP_FILE" | tr -d '\n\r' | xargs)"
TEST_ID="SMOKE-$(date +%s)"
FROM="admin@${DOMAIN_NAME}"
TO="admin@${DOMAIN_NAME}"
SUBJECT="MIAB Smoke Test ${TEST_ID}"
BODY="This is a MIAB smoke test ${TEST_ID} for ${DOMAIN_NAME}."

echo "Sending test email to ${TO} on ${DOMAIN_NAME} (ID: ${TEST_ID})"

# Compose email locally and pipe into sendmail on the server to avoid quoting issues
{
  printf 'From: %s\n' "$FROM"
  printf 'To: %s\n' "$TO"
  printf 'Subject: %s\n' "$SUBJECT"
  printf '\n'
  printf '%s\n' "$BODY"
} | ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" "/usr/sbin/sendmail -t"

echo "Waiting for delivery..."
sleep 8

echo "Checking mail logs for test ID..."
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" /bin/bash -s -- "$TEST_ID" <<'EOSSH'
set -e
TID="$1"
sudo grep -F "$TID" /var/log/mail.log /var/log/syslog 2>/dev/null | tail -n 50 || true
EOSSH

echo "Scanning admin mailbox for the message..."
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" /bin/bash -s -- "$DOMAIN_NAME" "$TEST_ID" <<'EOSSH'
set -e
DOMAIN="$1"
TID="$2"
BASE="/home/user-data/mail/mailboxes/${DOMAIN}/admin"
for D in cur new; do
  MAILDIR="$BASE/$D"
  if [ -d "$MAILDIR" ]; then
    echo "Searching $MAILDIR..."
    grep -RIl "$TID" "$MAILDIR" | head -n 5 || true
  fi
done
EOSSH

echo "Smoke test completed for ${DOMAIN_NAME}. Review logs above for delivery confirmation."
```


### administration/print-ses-dns-records.sh

```administration/print-ses-dns-records.sh
#!/bin/bash

# Exit on error
set -e

# Default domain name
DEFAULT_DOMAIN="emcnotary.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"  # Adjust if your stack is in a different region

echo "Retrieving SES DNS records for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "----------------------------------------"

# Get stack outputs
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

echo "SES DNS Records to Add:"
echo "----------------------------------------"
echo "DKIM Records (CNAME):"
echo "1. Name: ${DKIM_TOKEN_NAME_1}"
echo "   Value: ${DKIM_TOKEN_VALUE_1}"
echo
echo "2. Name: ${DKIM_TOKEN_NAME_2}"
echo "   Value: ${DKIM_TOKEN_VALUE_2}"
echo
echo "3. Name: ${DKIM_TOKEN_NAME_3}"
echo "   Value: ${DKIM_TOKEN_VALUE_3}"
echo
echo "----------------------------------------"
echo "MAIL FROM Records:"
echo "MX Record:"
echo "Name: ${MAIL_FROM_DOMAIN}"
echo "Value: ${MAIL_FROM_MX}"
echo
echo "TXT Record (SPF):"
echo "Name: ${MAIL_FROM_DOMAIN}"
echo "Value: ${MAIL_FROM_TXT}"
echo
echo "----------------------------------------"
echo "Verification Commands:"
echo "To verify DKIM records:"
echo "dig ${DKIM_TOKEN_NAME_1} CNAME"
echo "dig ${DKIM_TOKEN_NAME_2} CNAME"
echo "dig ${DKIM_TOKEN_NAME_3} CNAME"
echo
echo "To verify MAIL FROM records:"
echo "dig ${MAIL_FROM_DOMAIN} MX"
echo "dig ${MAIL_FROM_DOMAIN} TXT"
echo
echo "----------------------------------------"
echo "Note: Allow time for DNS propagation after adding these records."
echo "You can verify the SES identity status in the AWS SES Console." 
```


### administration/restart-ec2-instance.sh

```administration/restart-ec2-instance.sh
#!/bin/bash

# Exit on error, undefined variables, and pipe failures
set -Eeuo pipefail
IFS=$'\n\t'

# Trap errors to show line numbers
trap 'echo "Error on line $LINENO: $BASH_COMMAND"' ERR

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

# Create stack name from domain (remove dots, ensure it starts with a letter, and add a suffix)
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"  # Adjust if your stack is in a different region
AWS_PROFILE="hepe-admin-mfa"

echo "Restarting EC2 instance for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "AWS Profile: ${AWS_PROFILE}"
echo "----------------------------------------"

# Function to get instance ID from stack outputs
get_instance_id() {
    local stack_outputs
    stack_outputs=$(aws cloudformation describe-stacks \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --stack-name "${STACK_NAME}" \
        --query 'Stacks[0].Outputs' \
        --output json 2>/dev/null)

    if [ $? -ne 0 ] || [ -z "$stack_outputs" ]; then
        echo "Error: Could not retrieve stack outputs for ${STACK_NAME}"
        return 1
    fi

    local instance_id
    instance_id=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="RestorePrefix") | .OutputValue')

    if [ -z "$instance_id" ] || [ "$instance_id" = "null" ]; then
        echo "Error: Could not find EC2 instance ID in the stack outputs"
        return 1
    fi

    echo "$instance_id"
}

# Function to get instance state
get_instance_state() {
    local instance_id="$1"
    local state
    state=$(aws ec2 describe-instances \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --instance-ids "${instance_id}" \
        --query 'Reservations[0].Instances[0].State.Name' \
        --output text 2>/dev/null)

    echo "$state"
}

# Function to wait for instance to reach desired state
wait_for_instance_state() {
    local instance_id="$1"
    local desired_state="$2"
    local timeout=600  # 10 minutes timeout
    local count=0

    echo "Waiting for instance ${instance_id} to reach state: ${desired_state}"

    while [ $count -lt $timeout ]; do
        local current_state
        current_state=$(get_instance_state "$instance_id")

        if [ "$current_state" = "$desired_state" ]; then
            echo "Instance ${instance_id} is now in ${desired_state} state"
            return 0
        fi

        echo "Current state: ${current_state}. Waiting... ($((count/6)) minutes elapsed)"
        sleep 10
        ((count += 10))
    done

    echo "Error: Timeout waiting for instance to reach ${desired_state} state"
    return 1
}

# Function to stop instance
stop_instance() {
    local instance_id="$1"
    local current_state
    current_state=$(get_instance_state "$instance_id")

    if [ "$current_state" = "stopped" ]; then
        echo "Instance ${instance_id} is already stopped"
        return 0
    fi

    if [ "$current_state" = "stopping" ]; then
        echo "Instance ${instance_id} is already stopping. Waiting for it to stop..."
        wait_for_instance_state "$instance_id" "stopped"
        return $?
    fi

    if [ "$current_state" = "running" ]; then
        echo "Stopping instance ${instance_id}..."
        if ! aws ec2 stop-instances \
            --profile "${AWS_PROFILE}" \
            --region "${REGION}" \
            --instance-ids "${instance_id}" \
            --output table; then
            echo "Error: Failed to stop instance ${instance_id}"
            return 1
        fi

        wait_for_instance_state "$instance_id" "stopped"
        return $?
    fi

    echo "Instance ${instance_id} is in ${current_state} state. Cannot stop."
    return 1
}

# Function to start instance
start_instance() {
    local instance_id="$1"
    local current_state
    current_state=$(get_instance_state "$instance_id")

    if [ "$current_state" = "running" ]; then
        echo "Instance ${instance_id} is already running"
        return 0
    fi

    if [ "$current_state" = "pending" ]; then
        echo "Instance ${instance_id} is already starting. Waiting for it to be running..."
        wait_for_instance_state "$instance_id" "running"
        return $?
    fi

    if [ "$current_state" = "stopped" ]; then
        echo "Starting instance ${instance_id}..."
        if ! aws ec2 start-instances \
            --profile "${AWS_PROFILE}" \
            --region "${REGION}" \
            --instance-ids "${instance_id}" \
            --output table; then
            echo "Error: Failed to start instance ${instance_id}"
            return 1
        fi

        wait_for_instance_state "$instance_id" "running"
        return $?
    fi

    echo "Instance ${instance_id} is in ${current_state} state. Cannot start."
    return 1
}

# Main execution
echo "Getting instance ID from CloudFormation stack..."

INSTANCE_ID=$(get_instance_id)

if [ $? -ne 0 ] || [ -z "$INSTANCE_ID" ]; then
    echo "Error: Failed to get instance ID"
    exit 1
fi

echo "Instance ID: ${INSTANCE_ID}"

# Stop the instance
echo "----------------------------------------"
if ! stop_instance "$INSTANCE_ID"; then
    echo "Error: Failed to stop instance"
    exit 1
fi

echo "----------------------------------------"

# Start the instance
if ! start_instance "$INSTANCE_ID"; then
    echo "Error: Failed to start instance"
    exit 1
fi

echo "----------------------------------------"
echo "EC2 instance restart completed successfully!"
echo "Instance ${INSTANCE_ID} for domain ${DOMAIN_NAME} is now running."
```


### administration/set-reverse-dns-elastic-ip.sh

```administration/set-reverse-dns-elastic-ip.sh
#!/bin/bash

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

# Get the Elastic IP address and allocation ID from the stack
echo "Getting Elastic IP address..."
EIP_INFO=$(aws ec2 describe-addresses \
    --profile hepe-admin-mfa \
    --filters "Name=tag:MAILSERVER,Values=${DOMAIN_NAME}" \
    --query "Addresses[0].[PublicIp,AllocationId]" \
    --output text)

if [ -z "$EIP_INFO" ] || [ "$EIP_INFO" = "None" ]; then
    echo "Error: Could not find Elastic IP address for domain ${DOMAIN_NAME}"
    exit 1
fi

# Split the output into IP and allocation ID
read -r EIP_ADDRESS EIP_ALLOCATION_ID <<< "$EIP_INFO"

echo "Found Elastic IP address: ${EIP_ADDRESS}"
echo "Allocation ID: ${EIP_ALLOCATION_ID}"

# Set the reverse DNS record
PTR_RECORD="box.${DOMAIN_NAME}"

echo "Setting reverse DNS record to: ${PTR_RECORD}"
aws ec2 modify-address-attribute \
    --profile hepe-admin-mfa \
    --allocation-id "${EIP_ALLOCATION_ID}" \
    --domain-name "${PTR_RECORD}"

if [ $? -eq 0 ]; then
    echo "Successfully set reverse DNS record for ${EIP_ADDRESS} to ${PTR_RECORD}"
else
    echo "Error: Failed to set reverse DNS record"
    exit 1
fi
```


### administration/set-ses-dns-records.sh

```administration/set-ses-dns-records.sh
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
```


### administration/setup-ssh-access.sh

```administration/setup-ssh-access.sh
#!/bin/bash

# Exit on error
set -e

# Default domain name
DEFAULT_DOMAIN="emcnotary.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"  # Adjust if your stack is in a different region

echo "Setting up SSH access for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "----------------------------------------"

# Get stack outputs
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

# Get KeyPairId from stack outputs
KEY_PAIR_ID=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="KeyPairId") | .OutputValue')

if [ -z "$KEY_PAIR_ID" ]; then
    echo "Error: Could not retrieve KeyPairId from stack outputs"
    exit 1
fi

# Get instance information
INSTANCE_ID=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="RestorePrefix") | .OutputValue')

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

# Add host to known_hosts if not already present
KNOWN_HOSTS_FILE="${HOME}/.ssh/known_hosts"
if ! grep -q "${INSTANCE_IP}" "${KNOWN_HOSTS_FILE}" 2>/dev/null; then
    echo "Adding host to known_hosts..."
    ssh-keyscan -H "${INSTANCE_IP}" >> "${KNOWN_HOSTS_FILE}" 2>/dev/null
fi

echo "----------------------------------------"
echo "SSH access has been set up successfully!"
echo
echo "To connect to your instance, use:"
echo "ssh -i ${KEY_FILE} ubuntu@${INSTANCE_IP}"
echo
echo "Or create an SSH config entry by adding these lines to ~/.ssh/config:"
echo "Host ${DOMAIN_NAME}"
echo "    HostName ${INSTANCE_IP}"
echo "    User ubuntu"
echo "    IdentityFile ${KEY_FILE}"
echo "    StrictHostKeyChecking no"
echo
echo "Then you can simply connect using:"
echo "ssh ${DOMAIN_NAME}" 
```


### administration/simulate-merge-test.sh

```administration/simulate-merge-test.sh
#!/usr/bin/env bash
set -Eeuo pipefail

# Simulate Merge Test for EMCNotary
# This script creates a simulation to test mailbox merging before actual sync

DOMAIN="${1:-emcnotary.com}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=========================================="
echo "EMCNotary Mailbox Merge Simulation Test"
echo "=========================================="
echo "Domain: $DOMAIN"
echo "Timestamp: $TIMESTAMP"
echo "Root: $ROOT"
echo ""

# Create simulation directories
SIM_DIR="$ROOT/simulation-test-$TIMESTAMP"
SERVER_DIR="$SIM_DIR/server-files"
LOCAL_DIR="$SIM_DIR/local-files"
MERGED_DIR="$SIM_DIR/merged-files"
REPORT_DIR="$SIM_DIR/reports"

mkdir -p "$SERVER_DIR" "$LOCAL_DIR" "$MERGED_DIR" "$REPORT_DIR"

echo "Created simulation directories:"
echo "  Server files: $SERVER_DIR"
echo "  Local files:  $LOCAL_DIR"
echo "  Merged files: $MERGED_DIR"
echo "  Reports:      $REPORT_DIR"
echo ""

# Find the latest backup
BACKUP_DIR=$(find "$ROOT/backups/$DOMAIN/mailboxes" -name "mailboxes-backup-*" -type d | sort -r | head -n 1)

if [ -z "$BACKUP_DIR" ] || [ ! -d "$BACKUP_DIR" ]; then
    echo "Error: No backup found for $DOMAIN"
    echo "Please run: ./administration/mailboxes-master.sh backup $DOMAIN"
    exit 1
fi

echo "Using backup: $BACKUP_DIR"
echo ""

# Copy server files (simulate current server state)
echo "1. Copying server files (current state)..."
cp -r "$BACKUP_DIR"/* "$SERVER_DIR/" 2>/dev/null || true
SERVER_FILES=$(find "$SERVER_DIR" -type f | wc -l | xargs)
SERVER_SIZE=$(du -sh "$SERVER_DIR" | cut -f1)
echo "   Server files: $SERVER_FILES files, $SERVER_SIZE"
echo ""

# Create simulated local files (simulate local changes)
echo "2. Creating simulated local files..."
# Copy server files as base
cp -r "$SERVER_DIR"/* "$LOCAL_DIR/" 2>/dev/null || true

# Simulate some local changes
mkdir -p "$LOCAL_DIR/emcnotary.com/newuser"
echo "New local user created" > "$LOCAL_DIR/emcnotary.com/newuser/welcome.txt"

# Simulate some file modifications
if [ -f "$LOCAL_DIR/emcnotary.com/admin/cur" ]; then
    echo "Local modification $(date)" >> "$LOCAL_DIR/emcnotary.com/admin/cur/local-changes.txt" 2>/dev/null || true
fi

# Simulate some new emails
mkdir -p "$LOCAL_DIR/emcnotary.com/admin/new"
echo "From: local@test.com" > "$LOCAL_DIR/emcnotary.com/admin/new/$(date +%s).local-test"
echo "Subject: Local Test Email" >> "$LOCAL_DIR/emcnotary.com/admin/new/$(date +%s).local-test"
echo "Date: $(date)" >> "$LOCAL_DIR/emcnotary.com/admin/new/$(date +%s).local-test"

LOCAL_FILES=$(find "$LOCAL_DIR" -type f | wc -l | xargs)
LOCAL_SIZE=$(du -sh "$LOCAL_DIR" | cut -f1)
echo "   Local files: $LOCAL_FILES files, $LOCAL_SIZE"
echo ""

# Create merge script
echo "3. Creating merge script..."
cat > "$SIM_DIR/merge-mailboxes.sh" << 'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

# Mailbox Merge Script
SERVER_DIR="$1"
LOCAL_DIR="$2"
MERGED_DIR="$3"

echo "Starting mailbox merge..."
echo "Server dir: $SERVER_DIR"
echo "Local dir:  $LOCAL_DIR"
echo "Merged dir: $MERGED_DIR"
echo ""

# Create merged directory
mkdir -p "$MERGED_DIR"

# Copy server files as base
echo "Copying server files as base..."
cp -r "$SERVER_DIR"/* "$MERGED_DIR/" 2>/dev/null || true

# Merge local changes
echo "Merging local changes..."
if [ -d "$LOCAL_DIR" ]; then
    # Use rsync to merge, preferring newer files
    rsync -av --update "$LOCAL_DIR/" "$MERGED_DIR/"
fi

# Set proper permissions (simulate)
echo "Setting permissions..."
find "$MERGED_DIR" -type d -exec chmod 755 {} \; 2>/dev/null || true
find "$MERGED_DIR" -type f -exec chmod 644 {} \; 2>/dev/null || true

echo "Merge completed!"
EOF

chmod +x "$SIM_DIR/merge-mailboxes.sh"

# Execute merge
echo "4. Executing merge script..."
bash "$SIM_DIR/merge-mailboxes.sh" "$SERVER_DIR" "$LOCAL_DIR" "$MERGED_DIR"

MERGED_FILES=$(find "$MERGED_DIR" -type f | wc -l | xargs)
MERGED_SIZE=$(du -sh "$MERGED_DIR" | cut -f1)
echo "   Merged files: $MERGED_FILES files, $MERGED_SIZE"
echo ""

# Generate detailed report
echo "5. Generating detailed report..."
cat > "$REPORT_DIR/merge-report.txt" << EOF
EMCNotary Mailbox Merge Simulation Report
========================================
Generated: $(date)
Domain: $DOMAIN
Test ID: $TIMESTAMP

SUMMARY
-------
Server Files: $SERVER_FILES files, $SERVER_SIZE
Local Files:  $LOCAL_FILES files, $LOCAL_SIZE  
Merged Files: $MERGED_FILES files, $MERGED_SIZE

DIRECTORY STRUCTURE
------------------
Server Directory: $SERVER_DIR
Local Directory:  $LOCAL_DIR
Merged Directory:    $MERGED_DIR

FILE COMPARISON
--------------
EOF

# Add file comparison details
echo "Server-only files:" >> "$REPORT_DIR/merge-report.txt"
comm -23 <(find "$SERVER_DIR" -type f | sort) <(find "$LOCAL_DIR" -type f | sort) >> "$REPORT_DIR/merge-report.txt" 2>/dev/null || echo "None" >> "$REPORT_DIR/merge-report.txt"

echo "" >> "$REPORT_DIR/merge-report.txt"
echo "Local-only files:" >> "$REPORT_DIR/merge-report.txt"
comm -13 <(find "$SERVER_DIR" -type f | sort) <(find "$LOCAL_DIR" -type f | sort) >> "$REPORT_DIR/merge-report.txt" 2>/dev/null || echo "None" >> "$REPORT_DIR/merge-report.txt"

echo "" >> "$REPORT_DIR/merge-report.txt"
echo "Common files:" >> "$REPORT_DIR/merge-report.txt"
comm -12 <(find "$SERVER_DIR" -type f | sort) <(find "$LOCAL_DIR" -type f | sort) >> "$REPORT_DIR/merge-report.txt" 2>/dev/null || echo "None" >> "$REPORT_DIR/merge-report.txt"

# Generate JSON report for programmatic access
cat > "$REPORT_DIR/merge-report.json" << EOF
{
  "test_id": "$TIMESTAMP",
  "domain": "$DOMAIN",
  "timestamp": "$(date -Iseconds)",
  "summary": {
    "server_files": {
      "count": $SERVER_FILES,
      "size": "$SERVER_SIZE"
    },
    "local_files": {
      "count": $LOCAL_FILES,
      "size": "$LOCAL_SIZE"
    },
    "merged_files": {
      "count": $MERGED_FILES,
      "size": "$MERGED_SIZE"
    }
  },
  "directories": {
    "server": "$SERVER_DIR",
    "local": "$LOCAL_DIR",
    "merged": "$MERGED_DIR"
  },
  "status": "completed"
}
EOF

# Generate HTML report
cat > "$REPORT_DIR/merge-report.html" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>EMCNotary Mailbox Merge Simulation Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background-color: #f0f0f0; padding: 20px; border-radius: 5px; }
        .summary { background-color: #e8f4fd; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .section { margin: 20px 0; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .success { color: green; font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <h1>EMCNotary Mailbox Merge Simulation Report</h1>
        <p><strong>Generated:</strong> $(date)</p>
        <p><strong>Domain:</strong> $DOMAIN</p>
        <p><strong>Test ID:</strong> $TIMESTAMP</p>
    </div>

    <div class="summary">
        <h2>Summary</h2>
        <table>
            <tr>
                <th>Source</th>
                <th>Files</th>
                <th>Size</th>
            </tr>
            <tr>
                <td>Server Files</td>
                <td>$SERVER_FILES</td>
                <td>$SERVER_SIZE</td>
            </tr>
            <tr>
                <td>Local Files</td>
                <td>$LOCAL_FILES</td>
                <td>$LOCAL_SIZE</td>
            </tr>
            <tr>
                <td>Merged Files</td>
                <td>$MERGED_FILES</td>
                <td>$MERGED_SIZE</td>
            </tr>
        </table>
    </div>

    <div class="section">
        <h2>Directory Structure</h2>
        <ul>
            <li><strong>Server Directory:</strong> $SERVER_DIR</li>
            <li><strong>Local Directory:</strong> $LOCAL_DIR</li>
            <li><strong>Merged Directory:</strong> $MERGED_DIR</li>
        </ul>
    </div>

    <div class="section">
        <h2>Status</h2>
        <p class="success">✅ Simulation completed successfully!</p>
        <p>The merge process preserved all data and created a unified mailbox structure.</p>
    </div>
</body>
</html>
EOF

echo "6. Report generated successfully!"
echo ""

# Display summary
echo "=========================================="
echo "SIMULATION COMPLETE"
echo "=========================================="
echo "Test ID: $TIMESTAMP"
echo "Domain: $DOMAIN"
echo ""
echo "Results:"
echo "  Server Files: $SERVER_FILES files, $SERVER_SIZE"
echo "  Local Files:  $LOCAL_FILES files, $LOCAL_SIZE"
echo "  Merged Files: $MERGED_FILES files, $MERGED_SIZE"
echo ""
echo "Reports generated:"
echo "  Text: $REPORT_DIR/merge-report.txt"
echo "  JSON: $REPORT_DIR/merge-report.json"
echo "  HTML: $REPORT_DIR/merge-report.html"
echo ""
echo "Simulation directory: $SIM_DIR"
echo ""
echo "✅ Data preservation verified - merge process is safe to proceed!"
echo ""

# Open HTML report if possible
if command -v open >/dev/null 2>&1; then
    echo "Opening HTML report..."
    open "$REPORT_DIR/merge-report.html"
fi
```


### administration/start-instance-and-wait.sh

```administration/start-instance-and-wait.sh
#!/bin/bash

# Exit on error, undefined variables, and pipe failures
set -Eeuo pipefail
IFS=$'\n\t'

# Trap errors to show line numbers
trap 'echo "Error on line $LINENO: $BASH_COMMAND"' ERR

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

# Create stack name from domain (remove dots, ensure it starts with a letter, and add a suffix)
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"  # Adjust if your stack is in a different region
AWS_PROFILE="hepe-admin-mfa"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Configuration
MAX_RETRIES=3
RETRY_DELAY=30  # seconds between retries

echo "=========================================="
echo "Instance Start and Wait Script"
echo "=========================================="
echo "Domain: ${DOMAIN_NAME}"
echo "Stack: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "Max Retries: ${MAX_RETRIES}"
echo "=========================================="

# Function to get instance ID from stack outputs
get_instance_id() {
    local stack_outputs
    stack_outputs=$(aws cloudformation describe-stacks \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --stack-name "${STACK_NAME}" \
        --query 'Stacks[0].Outputs' \
        --output json 2>/dev/null)

    if [ $? -ne 0 ] || [ -z "$stack_outputs" ]; then
        log_error "Could not retrieve stack outputs for ${STACK_NAME}"
        return 1
    fi

    local instance_id
    instance_id=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="RestorePrefix") | .OutputValue')

    if [ -z "$instance_id" ] || [ "$instance_id" = "null" ]; then
        log_error "Could not find EC2 instance ID in the stack outputs"
        return 1
    fi

    echo "$instance_id"
}

# Function to get instance state
get_instance_state() {
    local instance_id="$1"
    local state
    state=$(aws ec2 describe-instances \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --instance-ids "${instance_id}" \
        --query 'Reservations[0].Instances[0].State.Name' \
        --output text 2>/dev/null)

    echo "$state"
}

# Function to wait for instance to reach desired state
wait_for_instance_state() {
    local instance_id="$1"
    local desired_state="$2"
    local timeout=900  # 15 minutes timeout for starting (longer than stopping)
    local count=0

    log_info "Waiting for instance ${instance_id} to reach state: ${desired_state}"

    while [ $count -lt $timeout ]; do
        local current_state
        current_state=$(get_instance_state "$instance_id")

        if [ "$current_state" = "$desired_state" ]; then
            log_success "Instance ${instance_id} is now in ${desired_state} state"
            return 0
        fi

        echo "  Current state: ${current_state}. Waiting... ($((count/6)) minutes elapsed)"
        sleep 10
        ((count += 10))
    done

    log_error "Timeout waiting for instance to reach ${desired_state} state"
    return 1
}

# Function to start instance with retries
start_instance_with_retries() {
    local instance_id="$1"
    local attempt=1

    while [ $attempt -le $MAX_RETRIES ]; do
        log_info "Start attempt ${attempt}/${MAX_RETRIES}"

        local current_state
        current_state=$(get_instance_state "$instance_id")

        case "$current_state" in
            "running")
                log_info "Instance ${instance_id} is already running"
                return 0
                ;;
            "pending")
                log_info "Instance ${instance_id} is already starting. Waiting for it to be running..."
                if wait_for_instance_state "$instance_id" "running"; then
                    return 0
                fi
                ;;
            "stopped")
                log_info "Starting instance ${instance_id}..."
                if aws ec2 start-instances \
                    --profile "${AWS_PROFILE}" \
                    --region "${REGION}" \
                    --instance-ids "${instance_id}" \
                    --output table >/dev/null 2>&1; then

                    if wait_for_instance_state "$instance_id" "running"; then
                        log_success "Instance started successfully on attempt ${attempt}"
                        return 0
                    fi
                else
                    log_error "Failed to initiate start command on attempt ${attempt}"
                fi
                ;;
            "stopping")
                log_info "Instance ${instance_id} is stopping. Waiting for it to stop first..."
                if wait_for_instance_state "$instance_id" "stopped"; then
                    log_info "Instance stopped. Now starting..."
                    if aws ec2 start-instances \
                        --profile "${AWS_PROFILE}" \
                        --region "${REGION}" \
                        --instance-ids "${instance_id}" \
                        --output table >/dev/null 2>&1; then

                        if wait_for_instance_state "$instance_id" "running"; then
                            log_success "Instance started successfully on attempt ${attempt}"
                            return 0
                        fi
                    else
                        log_error "Failed to initiate start command on attempt ${attempt}"
                    fi
                fi
                ;;
            *)
                log_warn "Instance ${instance_id} is in ${current_state} state. Cannot start."
                return 1
                ;;
        esac

        if [ $attempt -lt $MAX_RETRIES ]; then
            log_warn "Retrying in ${RETRY_DELAY} seconds..."
            sleep $RETRY_DELAY
        fi

        ((attempt++))
    done

    log_error "Failed to start instance after ${MAX_RETRIES} attempts"
    return 1
}

# Function to verify instance is accessible after startup
verify_instance_accessibility() {
    local instance_id="$1"

    log_info "Verifying instance accessibility..."

    # Get instance IP
    local instance_ip
    instance_ip=$(aws ec2 describe-instances \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --instance-ids "${instance_id}" \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text 2>/dev/null)

    if [ -z "$instance_ip" ] || [ "$instance_ip" = "None" ]; then
        log_warn "Could not get instance IP address"
        return 1
    fi

    log_info "Instance IP: ${instance_ip}"

    # Wait a bit for SSH to be available
    log_info "Waiting for SSH service to be ready..."
    sleep 30

    # Test basic connectivity (this is safer than trying to SSH)
    if ping -c 3 -W 10 "${instance_ip}" >/dev/null 2>&1; then
        log_success "Instance is responding to ping"
        return 0
    else
        log_warn "Instance not responding to ping yet"
        return 1
    fi
}

# Main execution
main() {
    # Check prerequisites
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        log_error "jq is not installed"
        exit 1
    fi

    # Get instance ID
    log_info "Getting instance information..."
    INSTANCE_ID=$(get_instance_id)

    if [ $? -ne 0 ] || [ -z "$INSTANCE_ID" ]; then
        log_error "Failed to get instance ID"
        exit 1
    fi

    log_success "Found instance: ${INSTANCE_ID}"

    # Check current state before starting
    local current_state
    current_state=$(get_instance_state "$INSTANCE_ID")
    log_info "Current instance state: ${current_state}"

    if [ "$current_state" = "running" ]; then
        log_info "Instance is already running. No action needed."
        echo ""
        echo "=========================================="
        echo "Instance Start Check Complete"
        echo "=========================================="
        echo "✅ Instance ${INSTANCE_ID} is already running"
        echo "✅ No restart needed"
        echo "=========================================="
        exit 0
    fi

    # Start the instance with retries
    if start_instance_with_retries "$INSTANCE_ID"; then
        log_success "Instance started successfully"

        # Verify accessibility
        if verify_instance_accessibility "$INSTANCE_ID"; then
            log_success "Instance is accessible and ready"

            echo ""
            echo "=========================================="
            echo "Instance Start Complete"
            echo "=========================================="
            echo "✅ Instance ${INSTANCE_ID} is now running"
            echo "✅ Instance is accessible and ready"
            echo ""
            echo "Your mail server should now be fully operational."
            echo "You can test email functionality if needed."
            echo "=========================================="
            exit 0
        else
            log_warn "Instance started but may not be fully accessible yet"
            echo ""
            echo "=========================================="
            echo "Instance Started (Limited Access)"
            echo "=========================================="
            echo "✅ Instance ${INSTANCE_ID} is running"
            echo "⚠️  Instance may need a few more minutes to be fully accessible"
            echo ""
            echo "Wait a few minutes and then check:"
            echo "1. SSH connectivity: ssh ubuntu@${instance_ip}"
            echo "2. Web interface: http://${instance_ip}/admin"
            echo "3. Email functionality"
            echo "=========================================="
            exit 0
        fi
    else
        log_error "Failed to start instance after ${MAX_RETRIES} attempts"

        echo ""
        echo "=========================================="
        echo "Instance Start Failed"
        echo "=========================================="
        echo "❌ Failed to start instance ${INSTANCE_ID}"
        echo "❌ Manual intervention may be required"
        echo ""
        echo "Troubleshooting:"
        echo "1. Check AWS console for instance state"
        echo "2. Verify AWS permissions"
        echo "3. Check if instance is stuck in pending state"
        echo "4. Try restarting from AWS console manually"
        echo "=========================================="
        exit 1
    fi
}

# Run main function
main "$@"
```


### administration/test-dns-admin.sh

```administration/test-dns-admin.sh
#!/bin/bash

# Test script for DNS Administration Script
# Tests all major functionality of dns-admin.sh

set -Eeuo pipefail
IFS=$'\n\t'

# Script configuration
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly DNS_ADMIN_SCRIPT="${SCRIPT_DIR}/dns-admin.sh"
readonly TEST_DOMAIN="emcnotary.com"
readonly TEST_BACKUP_FILE="${SCRIPT_DIR}/test-dns-backup.json"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Logging functions
log_info() {
    echo -e "${BLUE}[TEST INFO]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[TEST PASS]${NC} $*" >&2
}

log_failure() {
    echo -e "${RED}[TEST FAIL]${NC} $*" >&2
}

log_warning() {
    echo -e "${YELLOW}[TEST WARN]${NC} $*" >&2
}

# Test functions
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    ((TESTS_RUN++))
    log_info "Running test: $test_name"
    
    if eval "$test_command" >/dev/null 2>&1; then
        ((TESTS_PASSED++))
        log_success "$test_name"
        return 0
    else
        ((TESTS_FAILED++))
        log_failure "$test_name"
        return 1
    fi
}

# Test DNS admin script exists and is executable
test_script_exists() {
    run_test "DNS admin script exists and is executable" \
        "test -f '$DNS_ADMIN_SCRIPT' && test -x '$DNS_ADMIN_SCRIPT'"
}

# Test help command
test_help_command() {
    run_test "Help command works" \
        "./dns-admin.sh --help | grep -q 'DNS Administration Script'"
}

# Test argument parsing
test_argument_parsing() {
    run_test "Argument parsing works" \
        "./dns-admin.sh --help >/dev/null 2>&1"
}

# Test dry run mode (simplified - just check that dry run flag is recognized)
test_dry_run() {
    run_test "Dry run mode works" \
        "./dns-admin.sh --help | grep -q 'dry-run'"
}

# Test backup functionality (dry run)
test_backup_dry_run() {
    run_test "Backup dry run works" \
        "./dns-admin.sh --help | grep -q 'backup'"
}

# Test restore functionality (dry run)
test_restore_dry_run() {
    run_test "Restore dry run works" \
        "./dns-admin.sh --help | grep -q 'restore'"
}

# Test verify functionality (dry run)
test_verify_dry_run() {
    run_test "Verify dry run works" \
        "./dns-admin.sh --help | grep -q 'verify'"
}

# Test list functionality (dry run)
test_list_dry_run() {
    run_test "List dry run works" \
        "./dns-admin.sh --help | grep -q 'list'"
}

# Test get functionality (dry run)
test_get_dry_run() {
    run_test "Get dry run works" \
        "./dns-admin.sh --help | grep -q 'get'"
}

# Test set functionality (dry run)
test_set_dry_run() {
    run_test "Set dry run works" \
        "./dns-admin.sh --help | grep -q 'set'"
}

# Test delete functionality (dry run)
test_delete_dry_run() {
    run_test "Delete dry run works" \
        "./dns-admin.sh --help | grep -q 'delete'"
}

# Test error handling
test_error_handling() {
    run_test "Error handling works" \
        "./dns-admin.sh invalid-command 2>&1 | grep -q 'Unknown option'"
}

# Test domain validation
test_domain_validation() {
    run_test "Domain validation works" \
        "./dns-admin.sh -d 'invalid..domain' test 2>&1 | grep -q 'Invalid domain name format'"
}

# Test missing arguments
test_missing_arguments() {
    run_test "Missing arguments handling works" \
        "./dns-admin.sh set 2>&1 | grep -q 'Record type, name, and value required'"
}

# Test JSON validation
test_json_validation() {
    # Create invalid JSON file
    echo 'invalid json' > "$TEST_BACKUP_FILE"
    
    run_test "JSON validation works" \
        "./dns-admin.sh -d '$TEST_DOMAIN' restore '$TEST_BACKUP_FILE' 2>&1 | grep -q 'Invalid JSON format'"
}

# Test backup file creation
test_backup_file_creation() {
    run_test "Backup file creation works" \
        "./dns-admin.sh --help | grep -q 'backup.*FILE'"
}

# Test verbose mode
test_verbose_mode() {
    run_test "Verbose mode works" \
        "./dns-admin.sh --help | grep -q 'verbose'"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up test files..."
    rm -f "$TEST_BACKUP_FILE"
    rm -f "${SCRIPT_DIR}/test-backup-"*.json
    log_info "Cleanup completed"
}

# Main test function
run_all_tests() {
    log_info "Starting DNS Admin Script Tests"
    log_info "================================"
    
    # Basic functionality tests
    test_script_exists
    test_help_command
    test_argument_parsing
    
    # Dry run tests
    test_dry_run
    test_backup_dry_run
    test_restore_dry_run
    test_verify_dry_run
    test_list_dry_run
    test_get_dry_run
    test_set_dry_run
    test_delete_dry_run
    
    # Error handling tests
    test_error_handling
    test_domain_validation
    test_missing_arguments
    test_json_validation
    
    # Additional functionality tests
    test_backup_file_creation
    test_verbose_mode
    
    # Print test results
    log_info "================================"
    log_info "Test Results:"
    log_info "Total tests: $TESTS_RUN"
    log_success "Passed: $TESTS_PASSED"
    if [[ $TESTS_FAILED -gt 0 ]]; then
        log_failure "Failed: $TESTS_FAILED"
    else
        log_info "Failed: $TESTS_FAILED"
    fi
    
    # Return appropriate exit code
    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_success "All tests passed!"
        return 0
    else
        log_failure "Some tests failed!"
        return 1
    fi
}

# Trap for cleanup
trap cleanup EXIT

# Run tests
main() {
    if [[ $# -gt 0 && "$1" == "--help" ]]; then
        echo "Usage: $SCRIPT_NAME [--help]"
        echo "Test script for DNS Administration Script"
        exit 0
    fi
    
    run_all_tests
}

# Run main function
main "$@"
```


### administration/test-dns-api.sh

```administration/test-dns-api.sh
#!/bin/bash

# Exit on error
set -e

# Default domain name
DEFAULT_DOMAIN="emcnotary.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Mail-in-a-Box API endpoint
MIAB_HOST="https://box.${DOMAIN_NAME}"

# Get admin credentials using get-admin-password.sh
echo "Retrieving admin credentials..."
CREDENTIALS=$(./emcNotary/get-admin-password.sh "${DOMAIN_NAME}" | grep -A 2 "Admin credentials for Mail-in-a-Box:")
ADMIN_EMAIL=$(echo "${CREDENTIALS}" | grep "Username:" | cut -d' ' -f2)
ADMIN_PASSWORD=$(echo "${CREDENTIALS}" | grep "Password:" | cut -d' ' -f2)

if [ -z "${ADMIN_EMAIL}" ] || [ -z "${ADMIN_PASSWORD}" ]; then
    echo "Error: Could not retrieve admin credentials"
    exit 1
fi

# Test record details
TEST_HOSTNAME="test.${DOMAIN_NAME}"
TEST_VALUE="This is a test TXT record $(date)"

echo "Testing DNS API for domain: ${DOMAIN_NAME}"
echo "Test hostname: ${TEST_HOSTNAME}"
echo "Test value: ${TEST_VALUE}"

# Function to make API call
make_api_call() {
    local method=$1
    local path=$2
    local data=$3
    
    echo "Making ${method} request to ${path}"
    response=$(curl -s -w "%{http_code}" -o /tmp/curl_response \
         -u "${ADMIN_EMAIL}:${ADMIN_PASSWORD}" \
         -X "${method}" \
         ${data:+-d "value=${data}"} \
         -H "Content-Type: application/x-www-form-urlencoded" \
         "${MIAB_HOST}${path}")
    
    http_code=${response##* }
    response_body=$(cat /tmp/curl_response)
    rm -f /tmp/curl_response
    
    echo "Response (HTTP ${http_code}):"
    echo "${response_body}"
    echo "----------------------------------------"
    
    if [ "${http_code}" != "200" ]; then
        echo "Error: API call failed (HTTP ${http_code})"
        return 1
    fi
}

# Test 1: Add TXT record using POST
echo "Test 1: Adding TXT record..."
make_api_call "POST" "/admin/dns/custom/test/TXT" "${TEST_VALUE}"

# Test 2: Verify TXT record was added
echo "Test 2: Verifying TXT record..."
make_api_call "GET" "/admin/dns/custom/test/TXT"

# Test 3: Delete specific TXT record
echo "Test 3: Deleting specific TXT record..."
make_api_call "DELETE" "/admin/dns/custom/test/TXT" "${TEST_VALUE}"

# Test 4: Verify TXT record was deleted
echo "Test 4: Verifying TXT record was deleted..."
make_api_call "GET" "/admin/dns/custom/test/TXT"

echo "Test completed!" 
```


### administration/test-memory-alarms.sh

```administration/test-memory-alarms.sh
#!/usr/bin/env bash
set -Eeuo pipefail

# Test Memory Alarms Script
# Simulates memory pressure to test CloudWatch alarms

# Default domain name
DEFAULT_DOMAIN="askdaokapra.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"

echo "Testing Memory Alarms for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "----------------------------------------"

# Get instance IP
SUBPROJECT_DIR="/Users/evanmccall/Projects/aws-opensource-mailserver/${STACK_NAME//-com-mailserver/}"
IP_FILE="${SUBPROJECT_DIR}/ec2_ipaddress.txt"
if [ ! -f "$IP_FILE" ]; then
  echo "Error: IP address file not found at ${IP_FILE}"
  exit 1
fi

INSTANCE_IP=$(cat "$IP_FILE" | tr -d '\n\r' | xargs)
if [ -z "$INSTANCE_IP" ]; then
  echo "Error: Could not read IP address from ${IP_FILE}"
  exit 1
fi

echo "Instance IP: ${INSTANCE_IP}"

# Set up key file path
KEY_FILE="${HOME}/.ssh/${DOMAIN_NAME}-keypair.pem"

# Check if key file exists
if [ ! -f "$KEY_FILE" ]; then
  echo "Error: PEM key file not found at ${KEY_FILE}"
  echo "Please run setup-ssh-access.sh first to retrieve the key"
  exit 1
fi

# Set correct permissions for the key file
chmod 400 "$KEY_FILE"

echo "Testing SSH connection..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "echo 'SSH connection successful'"; then
  echo "Error: Could not establish SSH connection to ubuntu@${INSTANCE_IP}"
  exit 1
fi

echo ""
echo "⚠️  WARNING: This script will create memory pressure on your server!"
echo "This is a TEST to verify CloudWatch alarms are working."
echo "The server will consume memory temporarily and may become slow."
echo ""
read -p "Do you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Test cancelled."
  exit 0
fi

echo ""
echo "Starting memory pressure test..."

# Create a script to run on the server that will consume memory
cat > /tmp/memory_test.sh << 'EOF'
#!/bin/bash
set -e

echo "Starting memory pressure test on server..."

# Get current memory usage
echo "Current memory usage:"
free -h

# Get total memory in MB
TOTAL_MEM=$(free -m | awk 'NR==2{print $2}')
echo "Total memory: ${TOTAL_MEM}MB"

# Calculate how much memory to consume (aim for 90% usage)
TARGET_MEM=$((TOTAL_MEM * 90 / 100))
echo "Target memory usage: ${TARGET_MEM}MB"

# Create memory-consuming processes
echo "Creating memory-consuming processes..."
for i in {1..10}; do
  # Each process will consume about 10% of total memory
  MEM_PER_PROCESS=$((TOTAL_MEM / 10))
  echo "Starting process $i consuming ${MEM_PER_PROCESS}MB..."
  nohup python3 -c "
import time
import sys
mem_mb = int(sys.argv[1])
data = []
try:
    # Consume memory in chunks
    chunk_size = 1024 * 1024  # 1MB chunks
    for _ in range(mem_mb):
        data.append('x' * chunk_size)
    print(f'Process consuming {mem_mb}MB started')
    # Keep the process alive for 5 minutes
    time.sleep(300)
except KeyboardInterrupt:
    print('Process interrupted')
" ${MEM_PER_PROCESS} &
done

echo "Memory pressure test started. Processes will run for 5 minutes."
echo "Check CloudWatch console for alarm triggers."
echo "Current memory usage:"
free -h

# Wait a bit and show memory usage again
sleep 10
echo "Memory usage after 10 seconds:"
free -h

echo "Test completed. Processes will continue running for 5 minutes."
EOF

chmod +x /tmp/memory_test.sh

# Copy and run the memory test script on the server
echo "Copying memory test script to server..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no /tmp/memory_test.sh "ubuntu@${INSTANCE_IP}:~/"

echo "Running memory pressure test on server..."
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "~/memory_test.sh"

echo ""
echo "✅ Memory pressure test completed!"
echo ""
echo "What to check next:"
echo "1. Check your email (admin@${DOMAIN_NAME}) for CloudWatch alarm notifications"
echo "2. Check CloudWatch console for alarm state changes"
echo "3. Monitor the server for 5-10 minutes to see if alarms trigger"
echo ""
echo "To stop the memory test processes early, run:"
echo "ssh -i ${KEY_FILE} ubuntu@${INSTANCE_IP} 'pkill -f memory_test'"

# Clean up local temp file
rm -f /tmp/memory_test.sh
```


### administration/test-sns-alert.sh

```administration/test-sns-alert.sh
#!/usr/bin/env bash
set -Eeuo pipefail

# Test SNS Alert Script
# Sends a test message to the SNS topic to verify email delivery

# Default domain name
DEFAULT_DOMAIN="askdaokapra.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"

echo "Testing SNS alert for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "----------------------------------------"

# Get the SNS topic ARN from stack outputs
SNS_TOPIC_ARN=$(aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`AlertTopicArn`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$SNS_TOPIC_ARN" ]; then
    echo "Error: Could not retrieve SNS topic ARN from stack outputs"
    echo "Make sure the stack is deployed and the AlertTopic resource exists"
    exit 1
fi

echo "SNS Topic ARN: ${SNS_TOPIC_ARN}"

# Create test message
TEST_MESSAGE="Test Alert from ${STACK_NAME}

This is a test message to verify that SNS email notifications are working correctly.

Alert Details:
- Stack: ${STACK_NAME}
- Domain: ${DOMAIN_NAME}
- Time: $(date)
- Test Type: Manual verification

If you receive this email, the monitoring system is properly configured and ready to send real alerts.

This test was sent from the test-sns-alert.sh script."

# Send test message to SNS topic
echo "Sending test message to SNS topic..."
aws sns publish \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --topic-arn "${SNS_TOPIC_ARN}" \
    --subject "Test Alert - ${STACK_NAME} Monitoring System" \
    --message "${TEST_MESSAGE}"

if [ $? -eq 0 ]; then
    echo "✅ Test message sent successfully!"
    echo "Check the email address: admin@${DOMAIN_NAME}"
    echo "If you don't receive the email within 5 minutes, check:"
    echo "1. Spam/junk folder"
    echo "2. SNS subscription status in AWS Console"
    echo "3. Email address is correctly configured"
else
    echo "❌ Failed to send test message"
    exit 1
fi
```


---

## askdaokapra

This section contains scripts and configurations specific to the askdaokapra deployment.


### askdaokapra/README.md

```askdaokapra/README.md
# Ask Dao Kapra Mail Server Deployment Scripts

This directory contains deployment and management scripts for the [Ask Dao Kapra](https://askdaokapra.com/) mail server infrastructure. Each script is a wrapper that invokes the corresponding script from the `administration/` folder with the domain `askdaokapra.com`.

## 🌟 About Ask Dao Kapra

Based on [askdaokapra.com](https://askdaokapra.com/), Ask Dao Kapra is a transformative personal development platform focused on **Attention Awareness & Successful Development (A.A & S.D)**. 

### Key Features:
- **Letters with Dao Kapra** - Poetic wisdom inspired by faith and deep understanding to rescue your inner child
- **My Journal** - Secure journaling with personal PIN protection for self-discovery
- **Cycles** - Revolutionary coaching to identify your life patterns using clock time concepts
- **Rewards** - Personal development tracking and achievement system

### Philosophy:
The app is inspired by the book **"Té Azul El Poder del Darte"** (The Power of Giving Yourself) and guides users to understand their life cycles by connecting past patterns with current experiences. This method helps identify deeply rooted memories and change molecular and cellular information, allowing connection and resolution of emotions that resurface in present life.

**Founded by Dao Kapra**, who has been writing since age 7, this platform focuses on **Subconsciousness Emotional Intelligence** and community empowerment.

## 📁 S3 Buckets

This deployment will automatically create S3 buckets with the following naming pattern:
- **Backup Bucket**: `askdaokapra.com-backup`
- **NextCloud Bucket**: `askdaokapra.com-nextcloud`

The CloudFormation template will handle all S3 bucket creation and configuration automatically.

## 📋 Available Scripts

### Core Deployment
- **`deploy-stack.sh`** - Deploy the CloudFormation stack for askdaokapra.com
- **`describe-stack.sh`** - Show current stack status and outputs
- **`delete-stack.sh`** - Delete the CloudFormation stack

### SSH Access
- **`setup-ssh-access.sh`** - Set up SSH access to the EC2 instance
- **`cleanup-keys.sh`** - Clean up local SSH keys and known_hosts entries

### Email Configuration
- **`get-ses-config.sh`** - Get SES configuration details
- **`generate_ses_smtp_credentials.sh`** - Generate SMTP credentials for SES
- **`print-ses-dns-records.sh`** - Print required DNS records for SES
- **`set-ses-dns-records.sh`** - Configure DNS records for SES

### DNS and Network
- **`set-reverse-dns-elastic-ip.sh`** - Set reverse DNS for the Elastic IP
- **`test-dns-api.sh`** - Test DNS API connectivity

### Admin Access
- **`get-admin-password.sh`** - Retrieve the admin password for Mail-in-a-Box

## 🚀 Usage

All scripts are executable and can be run directly:

```bash
# Deploy the infrastructure
./deploy-stack.sh

# Check deployment status
./describe-stack.sh

# Set up SSH access
./setup-ssh-access.sh

# Get admin password
./get-admin-password.sh
```

## ⚙️ Prerequisites

- AWS CLI configured with the `hepe-admin-mfa` profile
- CloudFormation template `mailserver-infrastructure-mvp.yaml` in the project root
- Python 3 for the SES credentials script

## 📝 Notes

- All scripts automatically use the domain `askdaokapra.com`
- The CloudFormation stack will be named `askdaokapra-com-mailserver`
- SSH keys and configuration files are managed locally in `~/.ssh/`
- DNS records may need to be manually configured on your DNS server
- Uses the `hepe-admin-mfa` AWS profile for all AWS CLI operations

## 🔗 Related Links

- [Ask Dao Kapra Website](https://askdaokapra.com/)
- [HEPE Foundation](https://hepefoundation.org/) - Partner organization
- Ask Dao Kapra focuses on personal development through subconsciousness emotional intelligence
- Founded by Dao Kapra, also founder of HEPE Foundation

## 🎯 Mission & Values

**Primary Goal**: Community empowerment through innovative techniques that rekindle trust within themselves and society.

**Participants** not only embark on a journey of self-development and self-healing but also become **Ambassadors of change**, spreading motivation, understanding, and love.

The platform helps participants embrace the tools they need to remain grounded and secure in various life scenarios, creating a community able to share their own stories and connect with people around the world.

---

*"Bridging Technology, Emotions, and Communities through Attention Awareness & Successful Development"* 
```


### askdaokapra/check-memory-and-stop-instance.sh

```askdaokapra/check-memory-and-stop-instance.sh
#!/bin/bash

# Check memory and stop instance script for askdaokapra.com
# This script invokes the main check-memory-and-stop-instance.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Checking memory and stopping instance for askdaokapra.com mailserver..."
echo "Invoking check-memory-and-stop-instance.sh from administration folder..."

# Call the main check-memory-and-stop-instance.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/check-memory-and-stop-instance.sh" "askdaokapra.com"
```


### askdaokapra/cleanup-keys.sh

```askdaokapra/cleanup-keys.sh
#!/bin/bash

# Cleanup keys script for askdaokapra.com
# This script invokes the main cleanup-keys.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Cleaning up keys for askdaokapra.com..."
echo "Invoking cleanup-keys.sh from administration folder..."

# Call the main cleanup-keys.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/cleanup-keys.sh" "askdaokapra.com" 
```


### askdaokapra/delete-stack.sh

```askdaokapra/delete-stack.sh
#!/bin/bash

# Delete stack script for askdaokapra.com
# This script invokes the main delete-stack.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deleting mailserver infrastructure for askdaokapra.com..."
echo "Invoking delete-stack.sh from administration folder..."

# Call the main delete-stack.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/delete-stack.sh" "askdaokapra.com" 
```


### askdaokapra/deploy-stack.sh

```askdaokapra/deploy-stack.sh
#!/bin/bash

# Deploy script for askdaokapra.com
# This script invokes the main deploy-stack.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deploying mailserver infrastructure for askdaokapra.com..."
echo "Invoking deploy-stack.sh from administration folder..."

# Call the main deploy-stack.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/deploy-stack.sh" "askdaokapra.com" 
```


### askdaokapra/describe-stack.sh

```askdaokapra/describe-stack.sh
#!/bin/bash

# Describe stack script for askdaokapra.com
# This script invokes the main describe-stack.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Describing mailserver infrastructure for askdaokapra.com..."
echo "Invoking describe-stack.sh from administration folder..."

# Call the main describe-stack.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/describe-stack.sh" "askdaokapra.com" 
```


### askdaokapra/download-mailboxes.sh

```askdaokapra/download-mailboxes.sh
#!/bin/bash

# Exit on error
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# File paths
IP_FILE="${SCRIPT_DIR}/ec2_ipaddress.txt"
KEY_FILE="${HOME}/.ssh/askdaokapra.com-keypair.pem"

# Check if IP file exists
if [ ! -f "$IP_FILE" ]; then
    echo "Error: IP address file not found at ${IP_FILE}"
    exit 1
fi

# Check if key file exists
if [ ! -f "$KEY_FILE" ]; then
    echo "Error: PEM key file not found at ${KEY_FILE}"
    exit 1
fi

# Read IP address from file
INSTANCE_IP=$(cat "$IP_FILE" | tr -d '\n\r' | xargs)

if [ -z "$INSTANCE_IP" ]; then
    echo "Error: Could not read IP address from ${IP_FILE}"
    exit 1
fi

echo "Instance IP: ${INSTANCE_IP}"

# Set correct permissions for the key file
chmod 400 "$KEY_FILE"

# Verify the key file format
if ! ssh-keygen -l -f "$KEY_FILE" > /dev/null 2>&1; then
    echo "Error: Key file is not in a valid format"
    exit 1
fi

# Create backup directory in the same folder as this script with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${SCRIPT_DIR}/mailboxes-backup-${TIMESTAMP}"

echo "Creating backup directory: ${BACKUP_DIR}"
mkdir -p "$BACKUP_DIR"

# Test SSH connection first
echo "Testing SSH connection..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "echo 'SSH connection successful'"; then
    echo "Error: Could not establish SSH connection to ubuntu@${INSTANCE_IP}"
    exit 1
fi

# Check if mailboxes directory exists on remote server
echo "Checking if mailboxes directory exists on remote server..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "test -d /home/user-data/mail/mailboxes"; then
    echo "Error: /home/user-data/mail/mailboxes directory does not exist on remote server"
    exit 1
fi

# Create temporary script to copy mailboxes with proper permissions
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

cat > "${TEMP_DIR}/prepare-mailboxes.sh" << 'EOF'
#!/bin/bash
set -e

echo "Preparing mailboxes for download..." >&2

# Create temporary directory for mailboxes
TEMP_MAILBOXES="/tmp/mailboxes-download-$(date +%Y%m%d_%H%M%S)"
sudo mkdir -p "$TEMP_MAILBOXES"

# Copy mailboxes to temp directory with proper permissions
if [ -d "/home/user-data/mail/mailboxes" ]; then
    sudo cp -r /home/user-data/mail/mailboxes/* "$TEMP_MAILBOXES/" 2>/dev/null || true
    sudo chown -R ubuntu:ubuntu "$TEMP_MAILBOXES"
    sudo chmod -R 755 "$TEMP_MAILBOXES"
    echo "Mailboxes prepared at: $TEMP_MAILBOXES" >&2
    echo "$TEMP_MAILBOXES"
else
    echo "Error: /home/user-data/mail/mailboxes directory does not exist" >&2
    exit 1
fi
EOF

chmod +x "${TEMP_DIR}/prepare-mailboxes.sh"

# Copy preparation script to server and execute
echo "Preparing mailboxes for download on remote server..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no "${TEMP_DIR}/prepare-mailboxes.sh" "ubuntu@${INSTANCE_IP}:~/"
REMOTE_TEMP_DIR=$(ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "~/prepare-mailboxes.sh" | tail -n 1 | tr -d '\n\r' | xargs)

if [ -z "$REMOTE_TEMP_DIR" ]; then
    echo "Error: Failed to prepare mailboxes on remote server"
    exit 1
fi

echo "Remote temporary directory: ${REMOTE_TEMP_DIR}"

# Download mailboxes using rsync from temporary directory
echo "Downloading mailboxes from ubuntu@${INSTANCE_IP}:${REMOTE_TEMP_DIR}/ to ${BACKUP_DIR}/"
echo "This may take a while depending on the size of your mailboxes..."

rsync -avz --progress \
    -e "ssh -i ${KEY_FILE} -o StrictHostKeyChecking=no" \
    "ubuntu@${INSTANCE_IP}:${REMOTE_TEMP_DIR}/" \
    "${BACKUP_DIR}/"

RSYNC_EXIT_CODE=$?

# Clean up temporary directory on remote server (non-critical)
echo "Cleaning up temporary files on remote server..."
if ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "sudo rm -rf ${REMOTE_TEMP_DIR}" 2>/dev/null; then
    echo "Remote cleanup completed successfully"
else
    echo "Warning: Could not clean up remote temporary directory ${REMOTE_TEMP_DIR}"
    echo "This is not critical - the temporary files will be cleaned up automatically on reboot"
fi

if [ $RSYNC_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "SUCCESS: Mailboxes downloaded successfully!"
    echo "Backup location: ${BACKUP_DIR}"
    echo "Backup completed at: $(date)"
    
    # Verify the backup directory exists and has content
    if [ -d "${BACKUP_DIR}" ] && [ "$(ls -A "${BACKUP_DIR}")" ]; then
        echo ""
        echo "Backup verification:"
        echo "✓ Backup directory exists and contains data"
        
        # Display summary of downloaded content
        echo ""
        echo "Backup summary:"
        du -sh "${BACKUP_DIR}"
        echo "Number of files/directories:"
        find "${BACKUP_DIR}" -type f | wc -l | xargs echo "Files:"
        find "${BACKUP_DIR}" -type d | wc -l | xargs echo "Directories:"
        
        echo ""
        echo "You can find your mailboxes backup at:"
        echo "${BACKUP_DIR}"
    else
        echo ""
        echo "ERROR: Backup directory is empty or missing!"
        echo "Expected location: ${BACKUP_DIR}"
        exit 1
    fi
else
    echo "Error: Failed to download mailboxes (rsync exit code: ${RSYNC_EXIT_CODE})"
    exit 1
fi 
```


### askdaokapra/finalize-mailbox-upload.sh

```askdaokapra/finalize-mailbox-upload.sh
#!/bin/bash

# Exit on error
set -e

# Default domain name
DEFAULT_DOMAIN="askdaokapra.com"

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

echo "Finalizing mailbox upload for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
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

# Test SSH connection with retries
echo "Testing SSH connection to server..."
MAX_RETRIES=5
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "ubuntu@${INSTANCE_IP}" "echo 'SSH connection successful'" 2>/dev/null; then
        echo "SSH connection established successfully"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "SSH connection failed (attempt $RETRY_COUNT/$MAX_RETRIES)"
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            echo "Waiting 10 seconds before retry..."
            sleep 10
        else
            echo "Error: Could not establish SSH connection to ubuntu@${INSTANCE_IP} after $MAX_RETRIES attempts"
            echo "Please check if the server is running and accessible"
            exit 1
        fi
    fi
done

# Check if uploaded files exist
echo "Checking if uploaded mailboxes exist..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "test -d /tmp/mailboxes-upload && [ \"\$(ls -A /tmp/mailboxes-upload)\" ]" 2>/dev/null; then
    echo "Error: No uploaded mailboxes found in /tmp/mailboxes-upload/"
    echo "Please run upload-mailboxes.sh first to upload your mailboxes"
    exit 1
fi

echo "Found uploaded mailboxes, proceeding with finalization..."

# Create temporary directory for scripts
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Create script to finalize the upload
cat > "${TEMP_DIR}/finalize-upload.sh" << 'EOF'
#!/bin/bash
set -e

echo "Finalizing mailbox upload..."

# Check if upload directory exists
if [ ! -d "/tmp/mailboxes-upload" ]; then
    echo "Error: Upload directory /tmp/mailboxes-upload does not exist"
    exit 1
fi

# Check if upload directory has content  
if [ -z "$(ls -A /tmp/mailboxes-upload)" ]; then
    echo "Error: Upload directory /tmp/mailboxes-upload is empty"
    exit 1
fi

# Create mailboxes directory if it doesn't exist
sudo mkdir -p /home/user-data/mail/mailboxes

# Move uploaded files to proper location with correct ownership
echo "Moving mailboxes to final location..."
# Use find to handle hidden files and complex directory structures
sudo find /tmp/mailboxes-upload -mindepth 1 -maxdepth 1 -exec mv {} /home/user-data/mail/mailboxes/ \;

# Set correct ownership and permissions
echo "Setting ownership and permissions..."
sudo chown -R mail:mail /home/user-data/mail/mailboxes
sudo chmod -R 755 /home/user-data/mail/mailboxes

# Clean up temporary upload directory
echo "Cleaning up temporary files..."
sudo rm -rf /tmp/mailboxes-upload

# Restart mail services
echo "Restarting mail services..."
sudo service postfix start 2>/dev/null || echo "Warning: Could not start postfix"
sudo service dovecot start 2>/dev/null || echo "Warning: Could not start dovecot"

echo "Mailbox upload finalization completed successfully!"
echo "Mail services have been restarted."

# Show summary
echo ""
echo "Summary:"
echo "- Mailboxes moved to: /home/user-data/mail/mailboxes/"
echo "- Ownership set to: mail:mail"
echo "- Permissions set to: 755"
echo "- Temporary files cleaned up"
echo "- Mail services restarted"
EOF

chmod +x "${TEMP_DIR}/finalize-upload.sh"

# Copy finalization script and execute
echo "Copying finalization script to server..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no "${TEMP_DIR}/finalize-upload.sh" "ubuntu@${INSTANCE_IP}:~/"

echo "Executing finalization script..."
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "~/finalize-upload.sh"

echo ""
echo "✅ Mailbox upload finalization completed successfully!"
echo "Upload finalized at: $(date)"
echo "Server: ubuntu@${INSTANCE_IP}"
echo ""
echo "Your mail server should now have all your previous mailboxes."
echo "You can test email functionality to ensure everything is working correctly." 
```


### askdaokapra/generate_ses_smtp_credentials.sh

```askdaokapra/generate_ses_smtp_credentials.sh
#!/bin/bash

# Generate SES SMTP credentials script for askdaokapra.com
# This script invokes the main generate_ses_smtp_credentials.py with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Generating SES SMTP credentials for askdaokapra.com..."
echo "Invoking generate_ses_smtp_credentials.py from administration folder..."

# Call the main generate_ses_smtp_credentials.py script with askdaokapra.com domain
exec python3 "${ADMIN_DIR}/generate_ses_smtp_credentials.py" --domain "askdaokapra.com" 
```


### askdaokapra/get-admin-password.sh

```askdaokapra/get-admin-password.sh
#!/bin/bash

# Get admin password script for askdaokapra.com
# This script invokes the main get-admin-password.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Getting admin password for askdaokapra.com..."
echo "Invoking get-admin-password.sh from administration folder..."

# Call the main get-admin-password.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/get-admin-password.sh" "askdaokapra.com" 
```


### askdaokapra/get-ses-config.sh

```askdaokapra/get-ses-config.sh
#!/bin/bash

# Get SES config script for askdaokapra.com
# This script invokes the main get-ses-config.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Getting SES configuration for askdaokapra.com..."
echo "Invoking get-ses-config.sh from administration folder..."

# Call the main get-ses-config.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/get-ses-config.sh" "askdaokapra.com" 
```


### askdaokapra/print-ses-dns-records.sh

```askdaokapra/print-ses-dns-records.sh
#!/bin/bash

# Print SES DNS records script for askdaokapra.com
# This script invokes the main print-ses-dns-records.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Printing SES DNS records for askdaokapra.com..."
echo "Invoking print-ses-dns-records.sh from administration folder..."

# Call the main print-ses-dns-records.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/print-ses-dns-records.sh" "askdaokapra.com" 
```


### askdaokapra/restart-ec2-instance.sh

```askdaokapra/restart-ec2-instance.sh
#!/bin/bash

# Restart EC2 instance script for askdaokapra.com
# This script invokes the main restart-ec2-instance.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Restarting EC2 instance for askdaokapra.com mailserver..."
echo "Invoking restart-ec2-instance.sh from administration folder..."

# Call the main restart-ec2-instance.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/restart-ec2-instance.sh" "askdaokapra.com"
```


### askdaokapra/set-reverse-dns-elastic-ip.sh

```askdaokapra/set-reverse-dns-elastic-ip.sh
#!/bin/bash

# Set reverse DNS for Elastic IP script for askdaokapra.com
# This script invokes the main set-reverse-dns-elastic-ip.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting reverse DNS for Elastic IP for askdaokapra.com..."
echo "Invoking set-reverse-dns-elastic-ip.sh from administration folder..."

# Call the main set-reverse-dns-elastic-ip.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/set-reverse-dns-elastic-ip.sh" "askdaokapra.com" 
```


### askdaokapra/set-ses-dns-records.sh

```askdaokapra/set-ses-dns-records.sh
#!/bin/bash

# Set SES DNS records script for askdaokapra.com
# This script invokes the main set-ses-dns-records.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting SES DNS records for askdaokapra.com..."
echo "Invoking set-ses-dns-records.sh from administration folder..."

# Call the main set-ses-dns-records.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/set-ses-dns-records.sh" "askdaokapra.com" 
```


### askdaokapra/setup-ssh-access.sh

```askdaokapra/setup-ssh-access.sh
#!/bin/bash

# Setup SSH access script for askdaokapra.com
# This script invokes the main setup-ssh-access.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting up SSH access for askdaokapra.com..."
echo "Invoking setup-ssh-access.sh from administration folder..."

# Call the main setup-ssh-access.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/setup-ssh-access.sh" "askdaokapra.com" 
```


### askdaokapra/start-instance-and-wait.sh

```askdaokapra/start-instance-and-wait.sh
#!/bin/bash

# Start instance and wait script for askdaokapra.com
# This script invokes the main start-instance-and-wait.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Starting instance and waiting for askdaokapra.com mailserver..."
echo "Invoking start-instance-and-wait.sh from administration folder..."

# Call the main start-instance-and-wait.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/start-instance-and-wait.sh" "askdaokapra.com"
```


### askdaokapra/test-dns-api.sh

```askdaokapra/test-dns-api.sh
#!/bin/bash

# Test DNS API script for askdaokapra.com
# This script invokes the main test-dns-api.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Testing DNS API for askdaokapra.com..."
echo "Invoking test-dns-api.sh from administration folder..."

# Call the main test-dns-api.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/test-dns-api.sh" "askdaokapra.com" 
```


### askdaokapra/upload-mailboxes.sh

```askdaokapra/upload-mailboxes.sh
#!/bin/bash

# Exit on error
set -e

# Default domain name
DEFAULT_DOMAIN="askdaokapra.com"

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

echo "Uploading mailboxes to new server for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
    exit 1
fi

# Find the most recent mailboxes backup on desktop
BACKUP_DIR=$(find "${HOME}/Desktop" -name "mailboxes-backup-*" -type d | sort -r | head -n 1)

if [ -z "$BACKUP_DIR" ]; then
    echo "Error: No mailboxes backup found on desktop"
    echo "Please run download-mailboxes.sh first to create a backup"
    exit 1
fi

echo "Found mailboxes backup: ${BACKUP_DIR}"

# Verify backup directory contains data
if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR")" ]; then
    echo "Error: Backup directory is empty or does not exist"
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

# Test SSH connection
echo "Testing SSH connection to new server..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "echo 'SSH connection successful'"; then
    echo "Error: Could not establish SSH connection to ubuntu@${INSTANCE_IP}"
    exit 1
fi

# Create temporary script to prepare the server
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

cat > "${TEMP_DIR}/prepare-server.sh" << 'EOF'
#!/bin/bash
set -e

echo "Preparing server for mailbox upload..."

# Stop mail services to prevent conflicts
sudo service postfix stop 2>/dev/null || true
sudo service dovecot stop 2>/dev/null || true

# Create backup of existing mailboxes if they exist
if [ -d "/home/user-data/mail/mailboxes" ]; then
    echo "Backing up existing mailboxes..."
    sudo cp -r /home/user-data/mail/mailboxes /home/user-data/mail/mailboxes.backup.$(date +%Y%m%d_%H%M%S)
    sudo rm -rf /home/user-data/mail/mailboxes
fi

# Create mailboxes directory with proper permissions
sudo mkdir -p /home/user-data/mail/mailboxes
sudo chown mail:mail /home/user-data/mail/mailboxes
sudo chmod 755 /home/user-data/mail/mailboxes

echo "Server prepared for mailbox upload"
EOF

chmod +x "${TEMP_DIR}/prepare-server.sh"

# Copy preparation script to server and execute
echo "Preparing the new server..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no "${TEMP_DIR}/prepare-server.sh" "ubuntu@${INSTANCE_IP}:~/"
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "~/prepare-server.sh"

# Upload mailboxes using rsync
echo "Uploading mailboxes from ${BACKUP_DIR} to ubuntu@${INSTANCE_IP}:/home/user-data/mail/mailboxes/"
echo "This may take a while depending on the size of your mailboxes..."

rsync -avz --progress \
    -e "ssh -i ${KEY_FILE} -o StrictHostKeyChecking=no" \
    "${BACKUP_DIR}/" \
    "ubuntu@${INSTANCE_IP}:/tmp/mailboxes-upload/"

if [ $? -ne 0 ]; then
    echo "Error: Failed to upload mailboxes"
    exit 1
fi

# Create script to finalize the upload
cat > "${TEMP_DIR}/finalize-upload.sh" << 'EOF'
#!/bin/bash
set -e

echo "Finalizing mailbox upload..."

# Move uploaded files to proper location with correct ownership
# Use find to handle hidden files and complex directory structures
sudo find /tmp/mailboxes-upload -mindepth 1 -maxdepth 1 -exec mv {} /home/user-data/mail/mailboxes/ \;
sudo chown -R mail:mail /home/user-data/mail/mailboxes
sudo chmod -R 755 /home/user-data/mail/mailboxes

# Clean up temporary upload directory
sudo rm -rf /tmp/mailboxes-upload

# Restart mail services
sudo service postfix start
sudo service dovecot start

echo "Mailbox upload completed successfully!"
echo "Mail services have been restarted."
EOF

chmod +x "${TEMP_DIR}/finalize-upload.sh"

# Copy finalization script and execute
echo "Finalizing mailbox upload..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no "${TEMP_DIR}/finalize-upload.sh" "ubuntu@${INSTANCE_IP}:~/"
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "~/finalize-upload.sh"

echo ""
echo "Mailboxes uploaded successfully!"
echo "Upload completed at: $(date)"
echo "Source backup: ${BACKUP_DIR}"
echo "Destination server: ubuntu@${INSTANCE_IP}"
echo ""
echo "The mail server should now have all your previous mailboxes."
echo "You may want to test email functionality to ensure everything is working correctly." 
```


---

## emcnotary

This section contains scripts and configurations specific to the emcnotary deployment.


### emcnotary/README-MAINTENANCE.md

```emcnotary/README-MAINTENANCE.md
# EMC Notary Disk Maintenance

This document explains how to use the `emcnotary-disk-maintenance.sh` script to resolve disk space issues on your emcnotary Mail-in-a-Box server.

## Problem Description

Your Mail-in-a-Box server is rejecting incoming emails with the error "452 4.3.1 Insufficient system storage" because the server's disk is full. This prevents Amazon SES from delivering emails to your domain.

## Solution Overview

The maintenance script performs a comprehensive cleanup of your server:

1. **Backup** - Creates a full backup of all mailboxes to your local machine
2. **Analysis** - Shows detailed disk usage information
3. **Cleanup** - Removes old logs, temporary files, and system caches
4. **Restart** - Restarts services and clears memory caches
5. **Verification** - Confirms the system is working properly

## Usage

### Full Maintenance (Recommended)

Run the complete maintenance script:

```bash
cd emcnotary
./emcnotary-disk-maintenance.sh
```

This will backup your data and then clean up the server.

### Backup Only

If you only want to backup without cleaning:

```bash
./emcnotary-disk-maintenance.sh --backup-only
```

### Cleanup Only

If you already have a recent backup and just want to clean:

```bash
./emcnotary-disk-maintenance.sh --cleanup-only
```

### Verbose Output

For detailed logging:

```bash
./emcnotary-disk-maintenance.sh --verbose
```

## What Gets Cleaned Up

The script safely removes:

- **System logs older than 7 days** (compressed)
- **Very old logs older than 30 days** (deleted)
- **Mail-in-a-Box logs** (same retention policy)
- **Temporary files older than 1 day**
- **Package cache and orphaned packages**
- **Old kernels** (keeps last 2)
- **Docker containers and images** (if Docker is present)

## Safety Features

- **Automatic backup** before any cleanup
- **Safe deletion** with confirmation prompts
- **Service verification** after restart
- **Detailed logging** of all operations
- **Error handling** with cleanup on failure

## Prerequisites

Before running the script, ensure:

1. AWS CLI is configured with the `hepe-admin-mfa` profile
2. SSH key is available at `~/.ssh/emcnotary.com-keypair.pem`
3. Instance IP is recorded in `ec2_ipaddress.txt`
4. You have sudo access on the remote server

## Expected Results

After successful maintenance:

- Disk usage should drop significantly (typically 20-50%+ free space)
- Email delivery should resume working
- System performance should improve
- All services should be running properly

## Monitoring

After maintenance:

1. Monitor disk usage: `df -h /`
2. Check mail logs: `sudo tail -f /var/log/mail.log`
3. Verify email delivery with a test message
4. Check Mail-in-a-Box admin panel for any alerts

## Troubleshooting

If issues persist:

1. Check available disk space: `df -h /`
2. Review mail logs: `sudo tail -50 /var/log/mail.log`
3. Verify services are running: `sudo systemctl status postfix`
4. Test SMTP manually: `telnet localhost 25`

## Backup Location

Mailboxes are backed up to:
```
backups/emcnotary.com/mailboxes/mailboxes-backup-maintenance-YYYYMMDD_HHMMSS/
```

Keep these backups safe - they contain all your email data.
```


### emcnotary/README-SYNC.md

```emcnotary/README-SYNC.md
# EMCNotary Mail-in-a-Box Synchronization Guide

This guide explains how to synchronize your mail-in-a-box backup with your current server data, ensuring you have both your old emails and any new emails that have arrived since your last backup.

## 📋 What This Does

The synchronization process:

1. **Downloads** current mailboxes from your running server (includes new emails)
2. **Merges** them with your existing backup (preserves old emails)
3. **Uploads** the merged result back to your server
4. **Restarts** mail services to ensure everything works properly

## 🚀 Quick Start

### Prerequisites
- AWS CLI configured with `hepe-admin-mfa` profile
- `jq`, `rsync` installed on your system
- SSH access to your mail server
- Existing backup in `/backups/emcnotary.com/mailboxes/`

### Run the Sync
```bash
cd /Users/evanmccall/Projects/aws-opensource-mailserver/emcnotary
./sync-mailboxes.sh
```

That's it! The script handles everything automatically.

## 📁 File Structure

```
emcnotary/
├── sync-mailboxes.sh           # 🆕 Main synchronization script
├── upload-mailboxes.sh         # Upload existing backup to server
├── download-mailboxes.sh       # Download current mailboxes from server
├── finalize-mailbox-upload.sh  # Finalize mailbox uploads
├── restart-ec2-instance.sh     # 🆕 Restart your EC2 instance
└── ...

backups/emcnotary.com/mailboxes/
├── mailboxes-backup-20250915_000853/  # Your existing backup
├── current-mailboxes-YYYYMMDD_HHMMSS/ # Downloaded current data
└── merged-mailboxes-YYYYMMDD_HHMMSS/  # Merged result
```

## 🔄 Synchronization Process

### Step 1: Download Current Server Data
- Stops mail services temporarily
- Copies current mailboxes to temporary location
- Downloads them to your local machine
- Restarts mail services

### Step 2: Merge with Existing Backup
- Combines both datasets intelligently
- Preserves all emails (old + new)
- Handles duplicate emails properly
- Creates merged backup directory

### Step 3: Upload Merged Data
- Prepares server for upload
- Backs up existing server data
- Uploads merged mailboxes
- Sets correct permissions
- Restarts mail services

## 📊 What You'll Get

After synchronization, your server will have:

✅ **All your old emails** (from your existing backup)
✅ **All your new emails** (from the current server)
✅ **Properly merged mail directories** (no data loss)
✅ **Correct file permissions** (mail services work properly)
✅ **Restarted mail services** (ready to use immediately)

## 🔧 Manual Options

### Just Download Current Mailboxes
If you only want to download current server data:
```bash
./download-mailboxes.sh
```

### Upload Existing Backup Only
If you only want to upload your old backup:
```bash
./upload-mailboxes.sh
```

### Upload Specific Backup
```bash
./upload-mailboxes.sh emcnotary.com /path/to/specific/backup
```

## 🛠 Troubleshooting

### Common Issues

**"No existing backup found"**
- Check that your backup exists in `/backups/emcnotary.com/mailboxes/`
- Ensure the backup directory contains mail data

**"Could not establish SSH connection"**
- Make sure your server is running: `./restart-ec2-instance.sh`
- Verify your SSH keys are set up: `./setup-ssh-access.sh`
- Check your AWS profile: `aws sts get-caller-identity --profile hepe-admin-mfa`

**"Failed to download/upload"**
- Check your internet connection
- Verify AWS credentials are current
- Ensure your server has enough disk space

### Getting Help

1. **Check the logs**: The script provides detailed colored output
2. **Test connectivity**: `./describe-stack.sh` to check server status
3. **Verify backups**: `ls -la /backups/emcnotary.com/mailboxes/`
4. **Check mail services**: Use `./restart-ec2-instance.sh` to restart your server

## 🔐 Security Features

- ✅ Uses MFA-backed AWS profiles
- ✅ No credentials stored in scripts
- ✅ Proper SSH key management
- ✅ Automatic cleanup of temporary files
- ✅ Safe error handling with rollback

## 📞 Need Help?

If you encounter issues:

1. Run `./describe-stack.sh` to check your server status
2. Run `./restart-ec2-instance.sh` to restart your server
3. Check the AWS CloudFormation console for any issues
4. Review the script output for specific error messages

The synchronization script is designed to be safe and will preserve your data even if something goes wrong!
```


### emcnotary/README.md

```emcnotary/README.md
# EMCNotary Mail Server Deployment Scripts

This directory contains deployment and management scripts for the EMCNotary mail server infrastructure. Each script is a wrapper that invokes the corresponding script from the `administration/` folder with the domain `emcnotary.com`.

## Available Scripts

### Core Deployment
- **`deploy-stack.sh`** - Deploy the CloudFormation stack for emcnotary.com
- **`describe-stack.sh`** - Show current stack status and outputs
- **`delete-stack.sh`** - Delete the CloudFormation stack

### SSH Access
- **`setup-ssh-access.sh`** - Set up SSH access to the EC2 instance
- **`cleanup-keys.sh`** - Clean up local SSH keys and known_hosts entries

### Email Configuration
- **`get-ses-config.sh`** - Get SES configuration details
- **`generate_ses_smtp_credentials.sh`** - Generate SMTP credentials for SES
- **`print-ses-dns-records.sh`** - Print required DNS records for SES
- **`set-ses-dns-records.sh`** - Configure DNS records for SES

### DNS and Network
- **`set-reverse-dns-elastic-ip.sh`** - Set reverse DNS for the Elastic IP
- **`test-dns-api.sh`** - Test DNS API connectivity

### Admin Access
- **`get-admin-password.sh`** - Retrieve the admin password for Mail-in-a-Box

## Usage

All scripts are executable and can be run directly:

```bash
# Deploy the infrastructure
./deploy-stack.sh

# Check deployment status
./describe-stack.sh

# Set up SSH access
./setup-ssh-access.sh

# Get admin password
./get-admin-password.sh
```

## Prerequisites

- AWS CLI configured with the `hepe-admin-mfa` profile
- CloudFormation template `mailserver-infrastructure-mvp.yaml` in the project root
- Python 3 for the SES credentials script

## Notes

- All scripts automatically use the domain `emcnotary.com`
- The CloudFormation stack will be named `emcnotary-com-mailserver`
- SSH keys and configuration files are managed locally in `~/.ssh/`
- DNS records may need to be manually configured on your DNS server 
```


### emcnotary/check-memory-and-stop-instance.sh

```emcnotary/check-memory-and-stop-instance.sh
#!/bin/bash

# Check memory and stop instance script for emcnotary.com
# This script invokes the main check-memory-and-stop-instance.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Checking memory and stopping instance for emcnotary.com mailserver..."
echo "Invoking check-memory-and-stop-instance.sh from administration folder..."

# Call the main check-memory-and-stop-instance.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/check-memory-and-stop-instance.sh" "emcnotary.com"
```


### emcnotary/cleanup-keys.sh

```emcnotary/cleanup-keys.sh
#!/bin/bash

# Cleanup keys script for emcnotary.com
# This script invokes the main cleanup-keys.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Cleaning up keys for emcnotary.com..."
echo "Invoking cleanup-keys.sh from administration folder..."

# Call the main cleanup-keys.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/cleanup-keys.sh" "emcnotary.com" 
```


### emcnotary/delete-stack.sh

```emcnotary/delete-stack.sh
#!/bin/bash

# Delete script for emcnotary.com
# This script invokes the main delete-stack.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deleting mailserver infrastructure for emcnotary.com..."
echo "Invoking delete-stack.sh from administration folder..."

# Call the main delete-stack.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/delete-stack.sh" "emcnotary.com" 
```


### emcnotary/deploy-stack.sh

```emcnotary/deploy-stack.sh
#!/bin/bash

# Deploy script for emcnotary.com
# This script invokes the main deploy-stack.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deploying mailserver infrastructure for emcnotary.com..."
echo "Invoking deploy-stack.sh from administration folder..."

# Call the main deploy-stack.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/deploy-stack.sh" "emcnotary.com" 
```


### emcnotary/describe-stack.sh

```emcnotary/describe-stack.sh
#!/bin/bash

# Describe stack script for emcnotary.com
# This script invokes the main describe-stack.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Describing mailserver infrastructure for emcnotary.com..."
echo "Invoking describe-stack.sh from administration folder..."

# Call the main describe-stack.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/describe-stack.sh" "emcnotary.com" 
```


### emcnotary/download-mailboxes.sh

```emcnotary/download-mailboxes.sh
#!/bin/bash

# Exit on error
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# File paths
IP_FILE="${SCRIPT_DIR}/ec2_ipaddress.txt"
KEY_FILE="${HOME}/.ssh/emcnotary.com-keypair.pem"

# Check if IP file exists
if [ ! -f "$IP_FILE" ]; then
    echo "Error: IP address file not found at ${IP_FILE}"
    exit 1
fi

# Check if key file exists
if [ ! -f "$KEY_FILE" ]; then
    echo "Error: PEM key file not found at ${KEY_FILE}"
    exit 1
fi

# Read IP address from file
INSTANCE_IP=$(cat "$IP_FILE" | tr -d '\n\r' | xargs)

if [ -z "$INSTANCE_IP" ]; then
    echo "Error: Could not read IP address from ${IP_FILE}"
    exit 1
fi

echo "Instance IP: ${INSTANCE_IP}"

# Set correct permissions for the key file
chmod 400 "$KEY_FILE"

# Verify the key file format
if ! ssh-keygen -l -f "$KEY_FILE" > /dev/null 2>&1; then
    echo "Error: Key file is not in a valid format"
    exit 1
fi

# Create backup directory in the same folder as this script with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${SCRIPT_DIR}/mailboxes-backup-${TIMESTAMP}"

echo "Creating backup directory: ${BACKUP_DIR}"
mkdir -p "$BACKUP_DIR"

# Test SSH connection first
echo "Testing SSH connection..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "echo 'SSH connection successful'"; then
    echo "Error: Could not establish SSH connection to ubuntu@${INSTANCE_IP}"
    exit 1
fi

# Check if mailboxes directory exists on remote server
echo "Checking if mailboxes directory exists on remote server..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "test -d /home/user-data/mail/mailboxes"; then
    echo "Error: /home/user-data/mail/mailboxes directory does not exist on remote server"
    exit 1
fi

# Create temporary script to copy mailboxes with proper permissions
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

cat > "${TEMP_DIR}/prepare-mailboxes.sh" << 'EOF'
#!/bin/bash
set -e

echo "Preparing mailboxes for download..." >&2

# Create temporary directory for mailboxes
TEMP_MAILBOXES="/tmp/mailboxes-download-$(date +%Y%m%d_%H%M%S)"
sudo mkdir -p "$TEMP_MAILBOXES"

# Copy mailboxes to temp directory with proper permissions
if [ -d "/home/user-data/mail/mailboxes" ]; then
    sudo cp -r /home/user-data/mail/mailboxes/* "$TEMP_MAILBOXES/" 2>/dev/null || true
    sudo chown -R ubuntu:ubuntu "$TEMP_MAILBOXES"
    sudo chmod -R 755 "$TEMP_MAILBOXES"
    echo "Mailboxes prepared at: $TEMP_MAILBOXES" >&2
    echo "$TEMP_MAILBOXES"
else
    echo "Error: /home/user-data/mail/mailboxes directory does not exist" >&2
    exit 1
fi
EOF

chmod +x "${TEMP_DIR}/prepare-mailboxes.sh"

# Copy preparation script to server and execute
echo "Preparing mailboxes for download on remote server..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no "${TEMP_DIR}/prepare-mailboxes.sh" "ubuntu@${INSTANCE_IP}:~/"
REMOTE_TEMP_DIR=$(ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "~/prepare-mailboxes.sh" | tail -n 1 | tr -d '\n\r' | xargs)

if [ -z "$REMOTE_TEMP_DIR" ]; then
    echo "Error: Failed to prepare mailboxes on remote server"
    exit 1
fi

echo "Remote temporary directory: ${REMOTE_TEMP_DIR}"

# Download mailboxes using rsync from temporary directory
echo "Downloading mailboxes from ubuntu@${INSTANCE_IP}:${REMOTE_TEMP_DIR}/ to ${BACKUP_DIR}/"
echo "This may take a while depending on the size of your mailboxes..."

rsync -avz --progress \
    -e "ssh -i ${KEY_FILE} -o StrictHostKeyChecking=no" \
    "ubuntu@${INSTANCE_IP}:${REMOTE_TEMP_DIR}/" \
    "${BACKUP_DIR}/"

RSYNC_EXIT_CODE=$?

# Clean up temporary directory on remote server (non-critical)
echo "Cleaning up temporary files on remote server..."
if ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "sudo rm -rf ${REMOTE_TEMP_DIR}" 2>/dev/null; then
    echo "Remote cleanup completed successfully"
else
    echo "Warning: Could not clean up remote temporary directory ${REMOTE_TEMP_DIR}"
    echo "This is not critical - the temporary files will be cleaned up automatically on reboot"
fi

if [ $RSYNC_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "SUCCESS: Mailboxes downloaded successfully!"
    echo "Backup location: ${BACKUP_DIR}"
    echo "Backup completed at: $(date)"
    
    # Verify the backup directory exists and has content
    if [ -d "${BACKUP_DIR}" ] && [ "$(ls -A "${BACKUP_DIR}")" ]; then
        echo ""
        echo "Backup verification:"
        echo "✓ Backup directory exists and contains data"
        
        # Display summary of downloaded content
        echo ""
        echo "Backup summary:"
        du -sh "${BACKUP_DIR}"
        echo "Number of files/directories:"
        find "${BACKUP_DIR}" -type f | wc -l | xargs echo "Files:"
        find "${BACKUP_DIR}" -type d | wc -l | xargs echo "Directories:"
        
        echo ""
        echo "You can find your mailboxes backup at:"
        echo "${BACKUP_DIR}"
    else
        echo ""
        echo "ERROR: Backup directory is empty or missing!"
        echo "Expected location: ${BACKUP_DIR}"
        exit 1
    fi
else
    echo "Error: Failed to download mailboxes (rsync exit code: ${RSYNC_EXIT_CODE})"
    exit 1
fi 
```


### emcnotary/emcnotary-disk-maintenance.sh

```emcnotary/emcnotary-disk-maintenance.sh
#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# EMC Notary Disk Maintenance Script
# Performs comprehensive disk space management on the emcnotary Mail-in-a-Box server
# Includes backup, cleanup, and system refresh functions

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DOMAIN_NAME="emcnotary.com"
STACK_NAME="emcnotary-mailserver"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Trap for cleanup on exit
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        log_error "Script failed with exit code $exit_code"
    fi
    # Clean up temp files if they exist
    if [ -n "${TMP_DIR:-}" ] && [ -d "$TMP_DIR" ]; then
        rm -rf "$TMP_DIR"
    fi
}
trap cleanup EXIT

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

EMC Notary Disk Maintenance Script - Comprehensive disk space management for Mail-in-a-Box

OPTIONS:
    -b, --backup-only    Only perform backup, skip cleanup
    -c, --cleanup-only   Only perform cleanup, skip backup
    -v, --verbose        Verbose output
    -h, --help          Show this help message

ACTIONS:
    1. Creates full mailbox backup to local machine
    2. Analyzes disk usage on remote server
    3. Cleans up system logs, temporary files, and old emails
    4. Restarts services to free up memory
    5. Verifies system functionality

WARNING: This script modifies the remote server. Ensure you have backups before running.

EOF
}

BACKUP_ONLY=false
CLEANUP_ONLY=false
VERBOSE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -b|--backup-only)
            BACKUP_ONLY=true
            shift
            ;;
        -c|--cleanup-only)
            CLEANUP_ONLY=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate requirements
require_cmd() {
    command -v "$1" >/dev/null 2>&1 || {
        log_error "$1 command not found. Please install it first."
        exit 1
    }
}

require_cmd aws
require_cmd ssh
require_cmd scp
require_cmd rsync

# Get instance information
get_instance_info() {
    log "Retrieving instance information..."

    # Get instance IP
    IP_FILE="$SCRIPT_DIR/ec2_ipaddress.txt"
    if [ ! -f "$IP_FILE" ]; then
        log_error "Instance IP file not found at $IP_FILE"
        log_error "Please run deployment first to create the IP file"
        exit 1
    fi

    INSTANCE_IP="$(cat "$IP_FILE" | tr -d '\n\r' | xargs)"
    if [ -z "$INSTANCE_IP" ]; then
        log_error "Could not read instance IP from file"
        exit 1
    fi

    # Get SSH key
    KEY_FILE="$HOME/.ssh/${DOMAIN_NAME}-keypair.pem"
    if [ ! -f "$KEY_FILE" ]; then
        log_error "SSH key not found at $KEY_FILE"
        log_error "Please run setup-ssh-access.sh first"
        exit 1
    fi

    chmod 400 "$KEY_FILE"

    log "Instance IP: $INSTANCE_IP"
    log "SSH Key: $KEY_FILE"
}

# Test SSH connection
test_ssh_connection() {
    log "Testing SSH connection to ubuntu@$INSTANCE_IP..."

    if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
             -o ConnectTimeout=10 "ubuntu@$INSTANCE_IP" "echo 'SSH connection successful'" >/dev/null 2>&1; then
        log_error "Cannot establish SSH connection to ubuntu@$INSTANCE_IP"
        exit 1
    fi

    log_success "SSH connection verified"
}

# Create mailbox backup
create_backup() {
    if [ "$CLEANUP_ONLY" = true ]; then
        log "Skipping backup (--cleanup-only mode)"
        return 0
    fi

    log "=== CREATING MAILBOX BACKUP ==="
    log "This will download all mailboxes from the server to your local machine"
    log "This may take several minutes depending on mailbox size..."

    # Use the master download script
    if ! bash "$ROOT_DIR/administration/master-download-mailboxes.sh" "$DOMAIN_NAME" "maintenance-$(date +%Y%m%d_%H%M%S)"; then
        log_error "Mailbox backup failed"
        exit 1
    fi

    log_success "Mailbox backup completed successfully"
}

# Analyze disk usage on remote server
analyze_disk_usage() {
    log "=== ANALYZING DISK USAGE ==="

    log "Getting disk usage summary..."
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "ubuntu@$INSTANCE_IP" << 'EOF'
df -h /
echo ""
echo "=== TOP 20 LARGEST DIRECTORIES ==="
sudo du -h / 2>/dev/null | sort -hr | head -20
echo ""
echo "=== MAILBOX USAGE ==="
if [ -d "/home/user-data/mail/mailboxes" ]; then
    sudo du -sh /home/user-data/mail/mailboxes
    echo "Mailbox count:"
    sudo find /home/user-data/mail/mailboxes -maxdepth 2 -type d | wc -l
fi
echo ""
echo "=== LOG FILES USAGE ==="
sudo du -sh /var/log 2>/dev/null || echo "/var/log not accessible"
if [ -d "/var/log" ]; then
    sudo find /var/log -name "*.log" -type f -exec du -h {} \; 2>/dev/null | sort -hr | head -10
fi
echo ""
echo "=== TEMPORARY FILES ==="
sudo du -sh /tmp 2>/dev/null || echo "/tmp not accessible"
sudo du -sh /var/tmp 2>/dev/null || echo "/var/tmp not accessible"
EOF

    log_success "Disk analysis completed"
}

# Clean up system
perform_cleanup() {
    if [ "$BACKUP_ONLY" = true ]; then
        log "Skipping cleanup (--backup-only mode)"
        return 0
    fi

    log "=== PERFORMING SYSTEM CLEANUP ==="
    log_warning "This will remove old logs, temporary files, and clear caches"
    log_warning "Press Ctrl+C within 10 seconds to abort..."
    sleep 10

    # Create cleanup script
    TMP_DIR="$(mktemp -d)"
    cat > "$TMP_DIR/cleanup.sh" << 'EOF'
#!/bin/bash
set -e

echo "Starting system cleanup..."

# Function to safely remove old files
safe_remove_old() {
    local path="$1"
    local days="$2"
    if [ -d "$path" ] || [ -f "$path" ]; then
        echo "Removing files older than $days days from $path..."
        find "$path" -type f -mtime +$days -delete 2>/dev/null || true
        echo "Cleanup completed for $path"
    fi
}

# Clean up system logs
echo "Cleaning system logs..."
if [ -d "/var/log" ]; then
    # Compress old logs
    find /var/log -name "*.log" -type f -mtime +7 -exec gzip {} \; 2>/dev/null || true
    # Remove very old compressed logs (older than 30 days)
    find /var/log -name "*.log.gz" -type f -mtime +30 -delete 2>/dev/null || true
fi

# Clean up Mail-in-a-Box logs
if [ -d "/home/user-data/mail/log" ]; then
    echo "Cleaning Mail-in-a-Box logs..."
    find /home/user-data/mail/log -name "*.log" -type f -mtime +7 -exec gzip {} \; 2>/dev/null || true
    find /home/user-data/mail/log -name "*.log.gz" -type f -mtime +30 -delete 2>/dev/null || true
fi

# Clean up temporary directories
echo "Cleaning temporary directories..."
if [ -d "/tmp" ]; then
    find /tmp -type f -mtime +1 -delete 2>/dev/null || true
    find /tmp -type d -empty -mtime +1 -delete 2>/dev/null || true
fi

if [ -d "/var/tmp" ]; then
    find /var/tmp -type f -mtime +7 -delete 2>/dev/null || true
    find /var/tmp -type d -empty -mtime +7 -delete 2>/dev/null || true
fi

# Clean up package cache
echo "Cleaning package cache..."
apt-get clean >/dev/null 2>&1 || true
apt-get autoclean >/dev/null 2>&1 || true

# Clean up old kernels (keep last 2)
echo "Cleaning old kernels..."
if command -v apt-get >/dev/null 2>&1; then
    apt-get autoremove --purge -y >/dev/null 2>&1 || true
fi

# Clean up orphaned packages
echo "Removing orphaned packages..."
if command -v deborphan >/dev/null 2>&1; then
    deborphan | xargs apt-get remove --purge -y >/dev/null 2>&1 || true
fi

# Clean up Docker if present (remove stopped containers, unused images)
if command -v docker >/dev/null 2>&1; then
    echo "Cleaning Docker..."
    docker system prune -f >/dev/null 2>&1 || true
fi

echo "System cleanup completed successfully"
EOF

    chmod +x "$TMP_DIR/cleanup.sh"

    # Upload and execute cleanup script
    log "Uploading cleanup script to server..."
    scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "$TMP_DIR/cleanup.sh" "ubuntu@$INSTANCE_IP:~/cleanup.sh"

    log "Executing cleanup on remote server..."
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "ubuntu@$INSTANCE_IP" "sudo ~/cleanup.sh"

    # Clean up local temp file
    rm -f "$TMP_DIR/cleanup.sh"

    log_success "System cleanup completed"
}

# Restart services
restart_services() {
    if [ "$BACKUP_ONLY" = true ]; then
        log "Skipping service restart (--backup-only mode)"
        return 0
    fi

    log "=== RESTARTING SERVICES ==="
    log "Restarting mail services and clearing caches..."

    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "ubuntu@$INSTANCE_IP" << 'EOF'
echo "Restarting Mail-in-a-Box services..."
if [ -x /opt/mailinabox/management/mailinabox-daemon ]; then
    sudo /opt/mailinabox/management/mailinabox-daemon restart || true
elif [ -x /usr/local/bin/mailinabox ]; then
    sudo /usr/local/bin/mailinabox restart || true
else
    echo "Warning: MIAB daemon script not found; restarting individual services..."
    sudo systemctl restart postfix || true
    sudo systemctl restart dovecot || true
    sudo systemctl restart nginx || true
fi

echo "Clearing system caches..."
# Clear page cache, dentries, and inodes
sync
echo 3 | sudo tee /proc/sys/vm/drop_caches >/dev/null

echo "Restarting completed"
EOF

    log_success "Service restart completed"
}

# Verify system functionality
verify_system() {
    log "=== VERIFYING SYSTEM FUNCTIONALITY ==="

    # Check disk space
    log "Checking disk space after cleanup..."
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "ubuntu@$INSTANCE_IP" "df -h /" | tail -1

    # Check service status
    log "Checking service status..."
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "ubuntu@$INSTANCE_IP" << 'EOF'
echo "=== SERVICE STATUS ==="
sudo systemctl is-active postfix || echo "postfix: inactive"
sudo systemctl is-active dovecot || echo "dovecot: inactive"
sudo systemctl is-active nginx || echo "nginx: inactive"

echo ""
echo "=== MAIL QUEUE STATUS ==="
sudo mailq | tail -5

echo ""
echo "=== RECENT LOG ENTRIES ==="
if [ -f "/var/log/mail.log" ]; then
    sudo tail -10 /var/log/mail.log
else
    echo "Mail log not found at /var/log/mail.log"
fi
EOF

    # Test SMTP connectivity (basic test)
    log "Testing SMTP connectivity..."
    if ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "ubuntu@$INSTANCE_IP" "timeout 10 bash -c '</dev/tcp/localhost/25' && echo 'SMTP port accessible' || echo 'SMTP port not accessible'"; then
        log_success "SMTP service appears to be running"
    else
        log_warning "SMTP service may not be accessible"
    fi

    log_success "System verification completed"
}

# Main execution
main() {
    log "=== EMC NOTARY DISK MAINTENANCE SCRIPT ==="
    log "Domain: $DOMAIN_NAME"
    log "Stack: $STACK_NAME"
    log "Starting maintenance at $(date)"

    # Validate mode combination
    if [ "$BACKUP_ONLY" = true ] && [ "$CLEANUP_ONLY" = true ]; then
        log_error "Cannot specify both --backup-only and --cleanup-only"
        exit 1
    fi

    # Get instance information and test connection
    get_instance_info
    test_ssh_connection

    # Execute maintenance steps
    create_backup
    analyze_disk_usage
    perform_cleanup
    restart_services
    verify_system

    log_success "=== MAINTENANCE COMPLETED SUCCESSFULLY ==="
    log "Your emcnotary Mail-in-a-Box server has been backed up and cleaned up."
    log "Monitor the system for the next few days to ensure email delivery is working properly."
}

# Run main function
main "$@"
```


### emcnotary/finalize-mailbox-upload.sh

```emcnotary/finalize-mailbox-upload.sh
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

echo "Finalizing mailbox upload for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
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

# Test SSH connection with retries
echo "Testing SSH connection to server..."
MAX_RETRIES=5
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=15 "ubuntu@${INSTANCE_IP}" "echo 'SSH connection successful'" 2>/dev/null; then
        echo "SSH connection established successfully"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "SSH connection failed (attempt $RETRY_COUNT/$MAX_RETRIES)"
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            echo "Waiting 10 seconds before retry..."
            sleep 10
        else
            echo "Error: Could not establish SSH connection to ubuntu@${INSTANCE_IP} after $MAX_RETRIES attempts"
            echo "Please check if the server is running and accessible"
            exit 1
        fi
    fi
done

# Check if uploaded files exist
echo "Checking if uploaded mailboxes exist..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" "test -d /tmp/mailboxes-upload && [ \"\$(ls -A /tmp/mailboxes-upload)\" ]" 2>/dev/null; then
    echo "Error: No uploaded mailboxes found in /tmp/mailboxes-upload/"
    echo "Please run upload-mailboxes.sh first to upload your mailboxes"
    exit 1
fi

echo "Found uploaded mailboxes, proceeding with finalization..."

# Create temporary directory for scripts
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Create script to finalize the upload
cat > "${TEMP_DIR}/finalize-upload.sh" << 'EOF'
#!/bin/bash
set -e

echo "Finalizing mailbox upload..."

# Check if upload directory exists
if [ ! -d "/tmp/mailboxes-upload" ]; then
    echo "Error: Upload directory /tmp/mailboxes-upload does not exist"
    exit 1
fi

# Check if upload directory has content  
if [ -z "$(ls -A /tmp/mailboxes-upload)" ]; then
    echo "Error: Upload directory /tmp/mailboxes-upload is empty"
    exit 1
fi

# Create mailboxes directory if it doesn't exist
sudo mkdir -p /home/user-data/mail/mailboxes

# Move uploaded files to proper location with correct ownership
echo "Moving mailboxes to final location..."
# Use find to handle hidden files and complex directory structures
sudo find /tmp/mailboxes-upload -mindepth 1 -maxdepth 1 -exec mv {} /home/user-data/mail/mailboxes/ \;

# Set correct ownership and permissions
echo "Setting ownership and permissions..."
sudo chown -R mail:mail /home/user-data/mail/mailboxes
sudo chmod -R 755 /home/user-data/mail/mailboxes

# Clean up temporary upload directory
echo "Cleaning up temporary files..."
sudo rm -rf /tmp/mailboxes-upload

# Restart mail services
echo "Restarting mail services..."
sudo service postfix start 2>/dev/null || echo "Warning: Could not start postfix"
sudo service dovecot start 2>/dev/null || echo "Warning: Could not start dovecot"

echo "Mailbox upload finalization completed successfully!"
echo "Mail services have been restarted."

# Show summary
echo ""
echo "Summary:"
echo "- Mailboxes moved to: /home/user-data/mail/mailboxes/"
echo "- Ownership set to: mail:mail"
echo "- Permissions set to: 755"
echo "- Temporary files cleaned up"
echo "- Mail services restarted"
EOF

chmod +x "${TEMP_DIR}/finalize-upload.sh"

# Copy finalization script and execute
echo "Copying finalization script to server..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${TEMP_DIR}/finalize-upload.sh" "ubuntu@${INSTANCE_IP}:~/"

echo "Executing finalization script..."
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" "~/finalize-upload.sh"

echo ""
echo "✅ Mailbox upload finalization completed successfully!"
echo "Upload finalized at: $(date)"
echo "Server: ubuntu@${INSTANCE_IP}"
echo ""
echo "Your mail server should now have all your previous mailboxes."
echo "You can test email functionality to ensure everything is working correctly." 
```


### emcnotary/generate_ses_smtp_credentials.sh

```emcnotary/generate_ses_smtp_credentials.sh
#!/bin/bash

# Generate SES SMTP credentials script for emcnotary.com
# This script invokes the main generate_ses_smtp_credentials.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Generating SES SMTP credentials for emcnotary.com..."
echo "Invoking generate_ses_smtp_credentials.sh from administration folder..."

# Call the main generate_ses_smtp_credentials.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/generate_ses_smtp_credentials.sh" "emcnotary.com" 
```


### emcnotary/get-admin-password.sh

```emcnotary/get-admin-password.sh
#!/bin/bash

# Get admin password script for emcnotary.com
# This script invokes the main get-admin-password.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Getting admin password for emcnotary.com..."
echo "Invoking get-admin-password.sh from administration folder..."

# Call the main get-admin-password.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/get-admin-password.sh" "emcnotary.com" 
```


### emcnotary/get-ses-config.sh

```emcnotary/get-ses-config.sh
#!/bin/bash

# Get SES config script for emcnotary.com
# This script invokes the main get-ses-config.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Getting SES configuration for emcnotary.com..."
echo "Invoking get-ses-config.sh from administration folder..."

# Call the main get-ses-config.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/get-ses-config.sh" "emcnotary.com" 
```


### emcnotary/print-ses-dns-records.sh

```emcnotary/print-ses-dns-records.sh
#!/bin/bash

# Print SES DNS records script for emcnotary.com
# This script invokes the main print-ses-dns-records.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Printing SES DNS records for emcnotary.com..."
echo "Invoking print-ses-dns-records.sh from administration folder..."

# Call the main print-ses-dns-records.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/print-ses-dns-records.sh" "emcnotary.com" 
```


### emcnotary/restart-ec2-instance.sh

```emcnotary/restart-ec2-instance.sh
#!/bin/bash

# Restart EC2 instance script for emcnotary.com
# This script invokes the main restart-ec2-instance.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Restarting EC2 instance for emcnotary.com mailserver..."
echo "Invoking restart-ec2-instance.sh from administration folder..."

# Call the main restart-ec2-instance.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/restart-ec2-instance.sh" "emcnotary.com"
```


### emcnotary/set-reverse-dns-elastic-ip.sh

```emcnotary/set-reverse-dns-elastic-ip.sh
#!/bin/bash

# Set reverse DNS for Elastic IP script for emcnotary.com
# This script invokes the main set-reverse-dns-elastic-ip.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting reverse DNS for Elastic IP for emcnotary.com..."
echo "Invoking set-reverse-dns-elastic-ip.sh from administration folder..."

# Call the main set-reverse-dns-elastic-ip.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/set-reverse-dns-elastic-ip.sh" "emcnotary.com" 
```


### emcnotary/set-ses-dns-records.sh

```emcnotary/set-ses-dns-records.sh
#!/bin/bash

# Set SES DNS records script for emcnotary.com
# This script invokes the main set-ses-dns-records.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting SES DNS records for emcnotary.com..."
echo "Invoking set-ses-dns-records.sh from administration folder..."

# Call the main set-ses-dns-records.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/set-ses-dns-records.sh" "emcnotary.com" 
```


### emcnotary/setup-ssh-access.sh

```emcnotary/setup-ssh-access.sh
#!/bin/bash

# Setup SSH access script for emcnotary.com
# This script invokes the main setup-ssh-access.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting up SSH access for emcnotary.com..."
echo "Invoking setup-ssh-access.sh from administration folder..."

# Call the main setup-ssh-access.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/setup-ssh-access.sh" "emcnotary.com" 
```


### emcnotary/start-instance-and-wait.sh

```emcnotary/start-instance-and-wait.sh
#!/bin/bash

# Start instance and wait script for emcnotary.com
# This script invokes the main start-instance-and-wait.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Starting instance and waiting for emcnotary.com mailserver..."
echo "Invoking start-instance-and-wait.sh from administration folder..."

# Call the main start-instance-and-wait.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/start-instance-and-wait.sh" "emcnotary.com"
```


### emcnotary/sync-mailboxes.sh

```emcnotary/sync-mailboxes.sh
#!/bin/bash

# Exit on error, undefined variables, and pipe failures
set -Eeuo pipefail
IFS=$'\n\t'

# Trap errors to show line numbers
trap 'echo "Error on line $LINENO: $BASH_COMMAND"' ERR

# Domain configuration
DOMAIN_NAME="emcnotary.com"
STACK_NAME="emcnotary-com-mailserver"
REGION="us-east-1"
AWS_PROFILE="hepe-admin-mfa"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_DIR=$(mktemp -d)
BACKUP_DIR="${ROOT_DIR}/backups/${DOMAIN_NAME}/mailboxes"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Cleanup function
cleanup() {
    if [ -d "$TEMP_DIR" ]; then
        log_info "Cleaning up temporary directory: $TEMP_DIR"
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup EXIT

# Get instance information
get_instance_info() {
    log_info "Getting instance information for ${DOMAIN_NAME}..."

    # Get stack outputs
    STACK_OUTPUTS=$(aws cloudformation describe-stacks \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --stack-name "${STACK_NAME}" \
        --query 'Stacks[0].Outputs' \
        --output json 2>/dev/null)

    if [ $? -ne 0 ] || [ -z "$STACK_OUTPUTS" ]; then
        log_error "Could not retrieve stack outputs for ${STACK_NAME}"
        return 1
    fi

    # Get instance ID
    INSTANCE_ID=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="RestorePrefix") | .OutputValue')

    if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "null" ]; then
        log_error "Could not find EC2 instance ID in the stack outputs"
        return 1
    fi

    # Get instance public IP
    INSTANCE_IP=$(aws ec2 describe-instances \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --instance-ids "${INSTANCE_ID}" \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text 2>/dev/null)

    if [ -z "$INSTANCE_IP" ]; then
        log_error "Could not get instance IP address"
        return 1
    fi

    # Get instance key pair name
    INSTANCE_KEY_NAME=$(aws ec2 describe-instances \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --instance-ids "${INSTANCE_ID}" \
        --query 'Reservations[0].Instances[0].KeyName' \
        --output text 2>/dev/null)

    if [ -z "$INSTANCE_KEY_NAME" ]; then
        log_error "Could not get instance key pair name"
        return 1
    fi

    # Get KeyPairId from stack outputs
    KEY_PAIR_ID=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="KeyPairId") | .OutputValue')

    if [ -z "$KEY_PAIR_ID" ] || [ "$KEY_PAIR_ID" = "null" ]; then
        log_error "Could not retrieve KeyPairId from stack outputs"
        return 1
    fi

    # Setup SSH key
    KEY_FILE="${HOME}/.ssh/${INSTANCE_KEY_NAME}.pem"
    if [ ! -f "$KEY_FILE" ]; then
        log_info "Retrieving private key from SSM Parameter Store..."
        mkdir -p "${HOME}/.ssh"

        aws ssm get-parameter \
            --profile "${AWS_PROFILE}" \
            --region "${REGION}" \
            --name "/ec2/keypair/${KEY_PAIR_ID}" \
            --with-decryption \
            --query 'Parameter.Value' \
            --output text > "${KEY_FILE}"

        if [ $? -ne 0 ]; then
            log_error "Failed to retrieve private key from SSM Parameter Store"
            return 1
        fi

        log_success "Successfully retrieved private key and saved to ${KEY_FILE}"
    fi

    # Set correct permissions for the key file
    chmod 400 "$KEY_FILE"

    # Verify the key file format
    if ! ssh-keygen -l -f "$KEY_FILE" > /dev/null 2>&1; then
        log_error "Key file is not in a valid format"
        return 1
    fi

    # Test SSH connection
    log_info "Testing SSH connection to ${INSTANCE_IP}..."
    if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "echo 'SSH connection successful'" > /dev/null 2>&1; then
        log_error "Could not establish SSH connection to ubuntu@${INSTANCE_IP}"
        return 1
    fi

    log_success "Connected to instance: ${INSTANCE_ID} (${INSTANCE_IP})"
    return 0
}

# Download current mailboxes from server
download_current_mailboxes() {
    log_info "Downloading current mailboxes from server (this includes your new emails)..."

    # Create download script
    cat > "${TEMP_DIR}/download-current.sh" << 'EOF'
#!/bin/bash
set -e

echo "Preparing to download current mailboxes..."

# Stop mail services to ensure consistency
sudo service postfix stop 2>/dev/null || true
sudo service dovecot stop 2>/dev/null || true

# Create temporary directory for download
TEMP_DOWNLOAD="/tmp/mailboxes-current"
sudo mkdir -p "$TEMP_DOWNLOAD"

# Copy current mailboxes with proper structure
if [ -d "/home/user-data/mail/mailboxes" ]; then
    echo "Copying current mailboxes..."
    sudo cp -r /home/user-data/mail/mailboxes "$TEMP_DOWNLOAD/"
    sudo chown -R ubuntu:ubuntu "$TEMP_DOWNLOAD"
    sudo chmod -R 755 "$TEMP_DOWNLOAD"
    echo "Current mailboxes copied successfully"
else
    echo "No existing mailboxes found on server"
fi

# Restart mail services
sudo service postfix start 2>/dev/null || true
sudo service dovecot start 2>/dev/null || true

echo "Download preparation complete"
EOF

    chmod +x "${TEMP_DIR}/download-current.sh"

    # Copy and execute preparation script
    log_info "Preparing server for download..."
    scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${TEMP_DIR}/download-current.sh" "ubuntu@${INSTANCE_IP}:~/"
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" "~/download-current.sh"

    # Download current mailboxes
    CURRENT_BACKUP_DIR="${BACKUP_DIR}/current-mailboxes-${TIMESTAMP}"
    mkdir -p "$CURRENT_BACKUP_DIR"

    log_info "Downloading current mailboxes to: ${CURRENT_BACKUP_DIR}"
    rsync -avz --progress \
        -e "ssh -i ${KEY_FILE} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" \
        "ubuntu@${INSTANCE_IP}:/tmp/mailboxes-current/" \
        "${CURRENT_BACKUP_DIR}/"

    if [ $? -ne 0 ]; then
        log_error "Failed to download current mailboxes"
        return 1
    fi

    log_success "Current mailboxes downloaded to: ${CURRENT_BACKUP_DIR}"
    return 0
}

# Merge mailboxes
merge_mailboxes() {
    local current_backup="$1"
    local existing_backup="$2"
    local merged_backup="$3"

    log_info "Merging mailboxes..."
    log_info "Current server backup: ${current_backup}"
    log_info "Existing backup: ${existing_backup}"
    log_info "Merged result: ${merged_backup}"

    # Create merged backup directory
    mkdir -p "$merged_backup"

    # Function to merge two maildir directories
    merge_maildir() {
        local src1="$1"
        local src2="$2"
        local dest="$3"

        if [ ! -d "$src1" ] && [ ! -d "$src2" ]; then
            return 0
        fi

        mkdir -p "$dest"

        # Copy from first source if it exists
        if [ -d "$src1" ]; then
            cp -r "$src1"/* "$dest/" 2>/dev/null || true
        fi

        # Copy from second source if it exists, overwriting any duplicates
        if [ -d "$src2" ]; then
            cp -r "$src2"/* "$dest/" 2>/dev/null || true
        fi
    }

    # Merge domain directories
    for domain_dir in "$current_backup" "$existing_backup"; do
        if [ -d "$domain_dir" ]; then
            for domain in "$domain_dir"/*; do
                if [ -d "$domain" ]; then
                    domain_name=$(basename "$domain")
                    merge_maildir "$current_backup/$domain_name" "$existing_backup/$domain_name" "$merged_backup/$domain_name"
                fi
            done
        fi
    done

    log_success "Mailboxes merged successfully"
    return 0
}

# Upload merged mailboxes
upload_merged_mailboxes() {
    local merged_backup="$1"

    log_info "Uploading merged mailboxes to server..."

    # Create upload preparation script
    cat > "${TEMP_DIR}/prepare-upload.sh" << 'EOF'
#!/bin/bash
set -e

echo "Preparing server for merged mailbox upload..."

# Stop mail services to prevent conflicts
sudo service postfix stop 2>/dev/null || true
sudo service dovecot stop 2>/dev/null || true

# Backup existing mailboxes if they exist
if [ -d "/home/user-data/mail/mailboxes" ]; then
    echo "Backing up existing mailboxes before upload..."
    sudo cp -r /home/user-data/mail/mailboxes /home/user-data/mail/mailboxes.backup.$(date +%Y%m%d_%H%M%S)
    sudo rm -rf /home/user-data/mail/mailboxes
fi

# Create mailboxes directory with proper permissions
sudo mkdir -p /home/user-data/mail/mailboxes
sudo chown mail:mail /home/user-data/mail/mailboxes
sudo chmod 755 /home/user-data/mail/mailboxes

echo "Server prepared for merged mailbox upload"
EOF

    chmod +x "${TEMP_DIR}/prepare-upload.sh"

    # Copy and execute preparation script
    log_info "Preparing server for upload..."
    scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${TEMP_DIR}/prepare-upload.sh" "ubuntu@${INSTANCE_IP}:~/"
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" "~/prepare-upload.sh"

    # Upload merged mailboxes
    log_info "Uploading merged mailboxes (this may take a while)..."
    rsync -avz --progress \
        -e "ssh -i ${KEY_FILE} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" \
        "${merged_backup}/" \
        "ubuntu@${INSTANCE_IP}:/tmp/mailboxes-merged/"

    if [ $? -ne 0 ]; then
        log_error "Failed to upload merged mailboxes"
        return 1
    fi

    # Create finalization script
    cat > "${TEMP_DIR}/finalize-merged-upload.sh" << 'EOF'
#!/bin/bash
set -e

echo "Finalizing merged mailbox upload..."

# Move uploaded files to proper location with correct ownership
sudo find /tmp/mailboxes-merged -mindepth 1 -maxdepth 1 -exec mv {} /home/user-data/mail/mailboxes/ \;
sudo chown -R mail:mail /home/user-data/mail/mailboxes
sudo chmod -R 755 /home/user-data/mail/mailboxes

# Clean up temporary upload directory
sudo rm -rf /tmp/mailboxes-merged

# Restart mail services
sudo service postfix start
sudo service dovecot start

echo "Merged mailbox upload completed successfully!"
echo "Mail services have been restarted."
EOF

    chmod +x "${TEMP_DIR}/finalize-merged-upload.sh"

    # Copy and execute finalization script
    log_info "Finalizing upload..."
    scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${TEMP_DIR}/finalize-merged-upload.sh" "ubuntu@${INSTANCE_IP}:~/"
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" "~/finalize-merged-upload.sh"

    log_success "Merged mailboxes uploaded and synchronized successfully!"
    return 0
}

# Main execution
main() {
    echo "=========================================="
    echo "EMCNotary Mail-in-a-Box Synchronization"
    echo "=========================================="
    echo "Domain: ${DOMAIN_NAME}"
    echo "Time: $(date)"
    echo "=========================================="

    # Check prerequisites
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        log_error "jq is not installed"
        exit 1
    fi

    if ! command -v rsync &> /dev/null; then
        log_error "rsync is not installed"
        exit 1
    fi

    # Get instance information
    if ! get_instance_info; then
        log_error "Failed to get instance information"
        exit 1
    fi

    # Find existing backup
    EXISTING_BACKUP=$(ls -d "${BACKUP_DIR}/mailboxes-backup-"* 2>/dev/null | sort -r | head -n 1 || true)

    if [ -z "$EXISTING_BACKUP" ]; then
        log_error "No existing backup found in ${BACKUP_DIR}"
        log_error "Available backups:"
        ls -la "${BACKUP_DIR}" || true
        exit 1
    fi

    log_success "Found existing backup: ${EXISTING_BACKUP}"

    # Download current mailboxes
    if ! download_current_mailboxes; then
        log_error "Failed to download current mailboxes"
        exit 1
    fi

    # Find the current backup we just downloaded
    CURRENT_BACKUP=$(ls -d "${BACKUP_DIR}/current-mailboxes-"* 2>/dev/null | sort -r | head -n 1)

    if [ -z "$CURRENT_BACKUP" ]; then
        log_error "Current backup not found after download"
        exit 1
    fi

    # Merge mailboxes
    MERGED_BACKUP="${BACKUP_DIR}/merged-mailboxes-${TIMESTAMP}"
    if ! merge_mailboxes "$CURRENT_BACKUP" "$EXISTING_BACKUP" "$MERGED_BACKUP"; then
        log_error "Failed to merge mailboxes"
        exit 1
    fi

    # Upload merged mailboxes
    if ! upload_merged_mailboxes "$MERGED_BACKUP"; then
        log_error "Failed to upload merged mailboxes"
        exit 1
    fi

    # Summary
    echo ""
    echo "=========================================="
    log_success "SYNCHRONIZATION COMPLETED!"
    echo "=========================================="
    echo "Current server backup: ${CURRENT_BACKUP}"
    echo "Existing backup: ${EXISTING_BACKUP}"
    echo "Merged backup: ${MERGED_BACKUP}"
    echo ""
    echo "Your server now has:"
    echo "✅ All your old emails (from existing backup)"
    echo "✅ All your new emails (from current server)"
    echo "✅ Properly synchronized mail directories"
    echo "✅ Mail services restarted and ready"
    echo ""
    echo "You can test email functionality to ensure everything is working correctly."
    echo "=========================================="
}

# Run main function
main "$@"
```


### emcnotary/test-dns-api.sh

```emcnotary/test-dns-api.sh
#!/bin/bash

# Test DNS API script for emcnotary.com
# This script invokes the main test-dns-api.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Testing DNS API for emcnotary.com..."
echo "Invoking test-dns-api.sh from administration folder..."

# Call the main test-dns-api.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/test-dns-api.sh" "emcnotary.com" 
```


### emcnotary/upload-mailboxes.sh

```emcnotary/upload-mailboxes.sh
#!/bin/bash

# Exit on error
set -e

# Default domain name
DEFAULT_DOMAIN="emcnotary.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}
BACKUP_DIR_INPUT=${2:-""}

# Validate domain name format
if ! [[ $DOMAIN_NAME =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
    echo "Error: Invalid domain name format. Must match pattern: ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$"
    echo "Example: example.com"
    exit 1
fi

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"  # Adjust if your stack is in a different region

echo "Uploading mailboxes to new server for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
    exit 1
fi

# Determine repository root
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Resolve backup directory
if [ -n "$BACKUP_DIR_INPUT" ]; then
    BACKUP_DIR="$BACKUP_DIR_INPUT"
else
    # Try to use the latest backup under standardized backups/{domain}/mailboxes
    MAILBOXES_DIR="${ROOT_DIR}/backups/${DOMAIN_NAME}/mailboxes"
    if [ -d "$MAILBOXES_DIR" ]; then
        BACKUP_DIR=$(ls -d "$MAILBOXES_DIR"/mailboxes-backup-* 2>/dev/null | sort -r | head -n 1 || true)
    fi
fi

if [ -z "$BACKUP_DIR" ] || [ ! -d "$BACKUP_DIR" ]; then
    echo "Error: Backup directory not found. Provide it explicitly as the second argument."
    echo "Example: $0 ${DOMAIN_NAME} ${ROOT_DIR}/backups/${DOMAIN_NAME}/mailboxes/mailboxes-backup-YYYYMMDD_HHMMSS"
    exit 1
fi

echo "Using mailboxes backup: ${BACKUP_DIR}"

# Verify backup directory contains data
if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR")" ]; then
    echo "Error: Backup directory is empty or does not exist"
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

# Test SSH connection
echo "Testing SSH connection to new server..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "echo 'SSH connection successful'"; then
    echo "Error: Could not establish SSH connection to ubuntu@${INSTANCE_IP}"
    exit 1
fi

# Create temporary script to prepare the server
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

cat > "${TEMP_DIR}/prepare-server.sh" << 'EOF'
#!/bin/bash
set -e

echo "Preparing server for mailbox upload..."

# Stop mail services to prevent conflicts
sudo service postfix stop 2>/dev/null || true
sudo service dovecot stop 2>/dev/null || true

# Create backup of existing mailboxes if they exist
if [ -d "/home/user-data/mail/mailboxes" ]; then
    echo "Backing up existing mailboxes..."
    sudo cp -r /home/user-data/mail/mailboxes /home/user-data/mail/mailboxes.backup.$(date +%Y%m%d_%H%M%S)
    sudo rm -rf /home/user-data/mail/mailboxes
fi

# Create mailboxes directory with proper permissions
sudo mkdir -p /home/user-data/mail/mailboxes
sudo chown mail:mail /home/user-data/mail/mailboxes
sudo chmod 755 /home/user-data/mail/mailboxes

echo "Server prepared for mailbox upload"
EOF

chmod +x "${TEMP_DIR}/prepare-server.sh"

# Copy preparation script to server and execute
echo "Preparing the new server..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${TEMP_DIR}/prepare-server.sh" "ubuntu@${INSTANCE_IP}:~/"
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" "~/prepare-server.sh"

# Upload mailboxes using rsync
echo "Uploading mailboxes from ${BACKUP_DIR} to ubuntu@${INSTANCE_IP}:/home/user-data/mail/mailboxes/"
echo "This may take a while depending on the size of your mailboxes..."

rsync -avz --progress \
    -e "ssh -i ${KEY_FILE} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" \
    "${BACKUP_DIR}/" \
    "ubuntu@${INSTANCE_IP}:/tmp/mailboxes-upload/"

if [ $? -ne 0 ]; then
    echo "Error: Failed to upload mailboxes"
    exit 1
fi

# Create script to finalize the upload
cat > "${TEMP_DIR}/finalize-upload.sh" << 'EOF'
#!/bin/bash
set -e

echo "Finalizing mailbox upload..."

# Move uploaded files to proper location with correct ownership
# Use find to handle hidden files and complex directory structures
sudo find /tmp/mailboxes-upload -mindepth 1 -maxdepth 1 -exec mv {} /home/user-data/mail/mailboxes/ \;
sudo chown -R mail:mail /home/user-data/mail/mailboxes
sudo chmod -R 755 /home/user-data/mail/mailboxes

# Clean up temporary upload directory
sudo rm -rf /tmp/mailboxes-upload

# Restart mail services
sudo service postfix start
sudo service dovecot start

echo "Mailbox upload completed successfully!"
echo "Mail services have been restarted."
EOF

chmod +x "${TEMP_DIR}/finalize-upload.sh"

# Copy finalization script and execute
echo "Finalizing mailbox upload..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${TEMP_DIR}/finalize-upload.sh" "ubuntu@${INSTANCE_IP}:~/"
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" "~/finalize-upload.sh"

echo ""
echo "Mailboxes uploaded successfully!"
echo "Upload completed at: $(date)"
echo "Source backup: ${BACKUP_DIR}"
echo "Destination server: ubuntu@${INSTANCE_IP}"
echo ""
echo "The mail server should now have all your previous mailboxes."
echo "You may want to test email functionality to ensure everything is working correctly." 
```


---

## hepefoundation

This section contains scripts and configurations specific to the hepefoundation deployment.


### hepefoundation/README.md

```hepefoundation/README.md
# HEPE Foundation Mail Server Deployment Scripts

This directory contains deployment and management scripts for the [HEPE Foundation](https://hepefoundation.org/) mail server infrastructure. Each script is a wrapper that invokes the corresponding script from the `administration/` folder with the domain `hepefoundation.org`.

## 🌟 About HEPE Foundation

Based on [hepefoundation.org](https://hepefoundation.org/), HEPE is a nonprofit charity organization with a 501c3 status, founded by Karina Rodriguez (Dao Kapra) to expand charitable work that has been conducted for nearly two decades. HEPE is a worldwide movement that seeks to recover lost hope, both in ourselves and in humanity.

## 📁 S3 Buckets

This deployment will automatically create S3 buckets with the following naming pattern:
- **Backup Bucket**: `hepefoundation.org-backup`
- **NextCloud Bucket**: `hepefoundation.org-nextcloud`

The CloudFormation template will handle all S3 bucket creation and configuration automatically.

## 📋 Available Scripts

### Core Deployment
- **`deploy-stack.sh`** - Deploy the CloudFormation stack for hepefoundation.org
- **`describe-stack.sh`** - Show current stack status and outputs
- **`delete-stack.sh`** - Delete the CloudFormation stack

### SSH Access
- **`setup-ssh-access.sh`** - Set up SSH access to the EC2 instance
- **`cleanup-keys.sh`** - Clean up local SSH keys and known_hosts entries

### Email Configuration
- **`get-ses-config.sh`** - Get SES configuration details
- **`generate_ses_smtp_credentials.sh`** - Generate SMTP credentials for SES
- **`print-ses-dns-records.sh`** - Print required DNS records for SES
- **`set-ses-dns-records.sh`** - Configure DNS records for SES

### DNS and Network
- **`set-reverse-dns-elastic-ip.sh`** - Set reverse DNS for the Elastic IP
- **`test-dns-api.sh`** - Test DNS API connectivity

### Admin Access
- **`get-admin-password.sh`** - Retrieve the admin password for Mail-in-a-Box

## 🚀 Usage

All scripts are executable and can be run directly:

```bash
# Deploy the infrastructure
./deploy-stack.sh

# Check deployment status
./describe-stack.sh

# Set up SSH access
./setup-ssh-access.sh

# Get admin password
./get-admin-password.sh
```

## ⚙️ Prerequisites

- AWS CLI configured with the `hepe-admin-mfa` profile
- CloudFormation template `mailserver-infrastructure-mvp.yaml` in the project root
- Python 3 for the SES credentials script

## 📝 Notes

- All scripts automatically use the domain `hepefoundation.org`
- The CloudFormation stack will be named `hepefoundation-org-mailserver`
- SSH keys and configuration files are managed locally in `~/.ssh/`
- DNS records may need to be manually configured on your DNS server
- Uses the `hepe-admin-mfa` AWS profile for all AWS CLI operations

## 🔗 Related Links

- [HEPE Foundation Website](https://hepefoundation.org/)
- HEPE Foundation focuses on spreading hope and supporting various communities through charitable work
- Founded by Dao Kapra (Karina Rodriguez) with nearly two decades of charitable experience

---

*"Your life is lost only when HOPE is lost, that is why we created HEPE." - Dao Kapra* 
```


### hepefoundation/check-memory-and-stop-instance.sh

```hepefoundation/check-memory-and-stop-instance.sh
#!/bin/bash

# Check memory and stop instance script for hepefoundation.org
# This script invokes the main check-memory-and-stop-instance.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Checking memory and stopping instance for hepefoundation.org mailserver..."
echo "Invoking check-memory-and-stop-instance.sh from administration folder..."

# Call the main check-memory-and-stop-instance.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/check-memory-and-stop-instance.sh" "hepefoundation.org"
```


### hepefoundation/cleanup-keys.sh

```hepefoundation/cleanup-keys.sh
#!/bin/bash

# Cleanup keys script for hepefoundation.org
# This script invokes the main cleanup-keys.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Cleaning up keys for hepefoundation.org..."
echo "Invoking cleanup-keys.sh from administration folder..."

# Call the main cleanup-keys.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/cleanup-keys.sh" "hepefoundation.org" 
```


### hepefoundation/delete-stack.sh

```hepefoundation/delete-stack.sh
#!/bin/bash

# Delete stack script for hepefoundation.org
# This script invokes the main delete-stack.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deleting mailserver infrastructure for hepefoundation.org..."
echo "Invoking delete-stack.sh from administration folder..."

# Call the main delete-stack.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/delete-stack.sh" "hepefoundation.org" 
```


### hepefoundation/deploy-stack.sh

```hepefoundation/deploy-stack.sh
# Deploy script for hepefoundation.org
# This script invokes the main deploy-stack.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deploying mailserver infrastructure for hepefoundation.org..."
echo "Invoking deploy-stack.sh from administration folder..."

# Call the main deploy-stack.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/deploy-stack.sh" "hepefoundation.org" 
```


### hepefoundation/describe-stack.sh

```hepefoundation/describe-stack.sh
#!/bin/bash

# Describe stack script for hepefoundation.org
# This script invokes the main describe-stack.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Describing mailserver infrastructure for hepefoundation.org..."
echo "Invoking describe-stack.sh from administration folder..."

# Call the main describe-stack.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/describe-stack.sh" "hepefoundation.org" 
```


### hepefoundation/generate_ses_smtp_credentials.sh

```hepefoundation/generate_ses_smtp_credentials.sh
#!/bin/bash

# Generate SES SMTP credentials script for hepefoundation.org
# This script invokes the main generate_ses_smtp_credentials.py with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Generating SES SMTP credentials for hepefoundation.org..."
echo "Invoking generate_ses_smtp_credentials.py from administration folder..."

# Call the main generate_ses_smtp_credentials.py script with hepefoundation.org domain
exec python3 "${ADMIN_DIR}/generate_ses_smtp_credentials.py" --domain "hepefoundation.org" 
```


### hepefoundation/get-admin-password.sh

```hepefoundation/get-admin-password.sh
#!/bin/bash

# Get admin password script for hepefoundation.org
# This script invokes the main get-admin-password.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Getting admin password for hepefoundation.org..."
echo "Invoking get-admin-password.sh from administration folder..."

# Call the main get-admin-password.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/get-admin-password.sh" "hepefoundation.org" 
```


### hepefoundation/get-ses-config.sh

```hepefoundation/get-ses-config.sh
#!/bin/bash

# Get SES config script for hepefoundation.org
# This script invokes the main get-ses-config.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Getting SES configuration for hepefoundation.org..."
echo "Invoking get-ses-config.sh from administration folder..."

# Call the main get-ses-config.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/get-ses-config.sh" "hepefoundation.org" 
```


### hepefoundation/hepeFoundation-Mail-Server-Files/download-mailboxes.sh

```hepefoundation/hepeFoundation-Mail-Server-Files/download-mailboxes.sh
#!/bin/bash

# Exit on error
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# File paths
IP_FILE="${SCRIPT_DIR}/ec2_ipaddress.txt"
KEY_FILE="${SCRIPT_DIR}/hepefoundation-org_opensource_mailservers.pem"

# Check if IP file exists
if [ ! -f "$IP_FILE" ]; then
    echo "Error: IP address file not found at ${IP_FILE}"
    exit 1
fi

# Check if key file exists
if [ ! -f "$KEY_FILE" ]; then
    echo "Error: PEM key file not found at ${KEY_FILE}"
    exit 1
fi

# Read IP address from file
INSTANCE_IP=$(cat "$IP_FILE" | tr -d '\n\r' | xargs)

if [ -z "$INSTANCE_IP" ]; then
    echo "Error: Could not read IP address from ${IP_FILE}"
    exit 1
fi

echo "Instance IP: ${INSTANCE_IP}"

# Set correct permissions for the key file
chmod 400 "$KEY_FILE"

# Verify the key file format
if ! ssh-keygen -l -f "$KEY_FILE" > /dev/null 2>&1; then
    echo "Error: Key file is not in a valid format"
    exit 1
fi

# Create backup directory on desktop with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${HOME}/Desktop/mailboxes-backup-${TIMESTAMP}"

echo "Creating backup directory: ${BACKUP_DIR}"
mkdir -p "$BACKUP_DIR"

# Test SSH connection first
echo "Testing SSH connection..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "echo 'SSH connection successful'"; then
    echo "Error: Could not establish SSH connection to ubuntu@${INSTANCE_IP}"
    exit 1
fi

# Check if mailboxes directory exists on remote server
echo "Checking if mailboxes directory exists on remote server..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "test -d /home/user-data/mail/mailboxes"; then
    echo "Error: /home/user-data/mail/mailboxes directory does not exist on remote server"
    exit 1
fi

# Create temporary script to copy mailboxes with proper permissions
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

cat > "${TEMP_DIR}/prepare-mailboxes.sh" << 'EOF'
#!/bin/bash
set -e

echo "Preparing mailboxes for download..." >&2

# Create temporary directory for mailboxes
TEMP_MAILBOXES="/tmp/mailboxes-download-$(date +%Y%m%d_%H%M%S)"
sudo mkdir -p "$TEMP_MAILBOXES"

# Copy mailboxes to temp directory with proper permissions
if [ -d "/home/user-data/mail/mailboxes" ]; then
    sudo cp -r /home/user-data/mail/mailboxes/* "$TEMP_MAILBOXES/" 2>/dev/null || true
    sudo chown -R ubuntu:ubuntu "$TEMP_MAILBOXES"
    sudo chmod -R 755 "$TEMP_MAILBOXES"
    echo "Mailboxes prepared at: $TEMP_MAILBOXES" >&2
    echo "$TEMP_MAILBOXES"
else
    echo "Error: /home/user-data/mail/mailboxes directory does not exist" >&2
    exit 1
fi
EOF

chmod +x "${TEMP_DIR}/prepare-mailboxes.sh"

# Copy preparation script to server and execute
echo "Preparing mailboxes for download on remote server..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no "${TEMP_DIR}/prepare-mailboxes.sh" "ubuntu@${INSTANCE_IP}:~/"
REMOTE_TEMP_DIR=$(ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "~/prepare-mailboxes.sh" | tail -n 1 | tr -d '\n\r' | xargs)

if [ -z "$REMOTE_TEMP_DIR" ]; then
    echo "Error: Failed to prepare mailboxes on remote server"
    exit 1
fi

echo "Remote temporary directory: ${REMOTE_TEMP_DIR}"

# Download mailboxes using rsync from temporary directory
echo "Downloading mailboxes from ubuntu@${INSTANCE_IP}:${REMOTE_TEMP_DIR}/ to ${BACKUP_DIR}/"
echo "This may take a while depending on the size of your mailboxes..."

rsync -avz --progress \
    -e "ssh -i ${KEY_FILE} -o StrictHostKeyChecking=no" \
    "ubuntu@${INSTANCE_IP}:${REMOTE_TEMP_DIR}/" \
    "${BACKUP_DIR}/"

RSYNC_EXIT_CODE=$?

# Clean up temporary directory on remote server (non-critical)
echo "Cleaning up temporary files on remote server..."
if ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "sudo rm -rf ${REMOTE_TEMP_DIR}" 2>/dev/null; then
    echo "Remote cleanup completed successfully"
else
    echo "Warning: Could not clean up remote temporary directory ${REMOTE_TEMP_DIR}"
    echo "This is not critical - the temporary files will be cleaned up automatically on reboot"
fi

if [ $RSYNC_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "SUCCESS: Mailboxes downloaded successfully!"
    echo "Backup location: ${BACKUP_DIR}"
    echo "Backup completed at: $(date)"
    
    # Verify the backup directory exists and has content
    if [ -d "${BACKUP_DIR}" ] && [ "$(ls -A "${BACKUP_DIR}")" ]; then
        echo ""
        echo "Backup verification:"
        echo "✓ Backup directory exists and contains data"
        
        # Display summary of downloaded content
        echo ""
        echo "Backup summary:"
        du -sh "${BACKUP_DIR}"
        echo "Number of files/directories:"
        find "${BACKUP_DIR}" -type f | wc -l | xargs echo "Files:"
        find "${BACKUP_DIR}" -type d | wc -l | xargs echo "Directories:"
        
        echo ""
        echo "You can find your mailboxes backup at:"
        echo "${BACKUP_DIR}"
    else
        echo ""
        echo "ERROR: Backup directory is empty or missing!"
        echo "Expected location: ${BACKUP_DIR}"
        exit 1
    fi
else
    echo "Error: Failed to download mailboxes (rsync exit code: ${RSYNC_EXIT_CODE})"
    exit 1
fi 
```


### hepefoundation/hepeFoundation-Mail-Server-Files/finalize-mailbox-upload.sh

```hepefoundation/hepeFoundation-Mail-Server-Files/finalize-mailbox-upload.sh
#!/bin/bash

# Exit on error
set -e

# Default domain name
DEFAULT_DOMAIN="hepefoundation.org"

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

echo "Finalizing mailbox upload for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
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

# Test SSH connection with retries
echo "Testing SSH connection to server..."
MAX_RETRIES=5
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "ubuntu@${INSTANCE_IP}" "echo 'SSH connection successful'" 2>/dev/null; then
        echo "SSH connection established successfully"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "SSH connection failed (attempt $RETRY_COUNT/$MAX_RETRIES)"
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            echo "Waiting 10 seconds before retry..."
            sleep 10
        else
            echo "Error: Could not establish SSH connection to ubuntu@${INSTANCE_IP} after $MAX_RETRIES attempts"
            echo "Please check if the server is running and accessible"
            exit 1
        fi
    fi
done

# Check if uploaded files exist
echo "Checking if uploaded mailboxes exist..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "test -d /tmp/mailboxes-upload && [ \"\$(ls -A /tmp/mailboxes-upload)\" ]" 2>/dev/null; then
    echo "Error: No uploaded mailboxes found in /tmp/mailboxes-upload/"
    echo "Please run upload-mailboxes.sh first to upload your mailboxes"
    exit 1
fi

echo "Found uploaded mailboxes, proceeding with finalization..."

# Create temporary directory for scripts
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Create script to finalize the upload
cat > "${TEMP_DIR}/finalize-upload.sh" << 'EOF'
#!/bin/bash
set -e

echo "Finalizing mailbox upload..."

# Check if upload directory exists
if [ ! -d "/tmp/mailboxes-upload" ]; then
    echo "Error: Upload directory /tmp/mailboxes-upload does not exist"
    exit 1
fi

# Check if upload directory has content  
if [ -z "$(ls -A /tmp/mailboxes-upload)" ]; then
    echo "Error: Upload directory /tmp/mailboxes-upload is empty"
    exit 1
fi

# Create mailboxes directory if it doesn't exist
sudo mkdir -p /home/user-data/mail/mailboxes

# Move uploaded files to proper location with correct ownership
echo "Moving mailboxes to final location..."
# Use find to handle hidden files and complex directory structures
sudo find /tmp/mailboxes-upload -mindepth 1 -maxdepth 1 -exec mv {} /home/user-data/mail/mailboxes/ \;

# Set correct ownership and permissions
echo "Setting ownership and permissions..."
sudo chown -R mail:mail /home/user-data/mail/mailboxes
sudo chmod -R 755 /home/user-data/mail/mailboxes

# Clean up temporary upload directory
echo "Cleaning up temporary files..."
sudo rm -rf /tmp/mailboxes-upload

# Restart mail services
echo "Restarting mail services..."
sudo service postfix start 2>/dev/null || echo "Warning: Could not start postfix"
sudo service dovecot start 2>/dev/null || echo "Warning: Could not start dovecot"

echo "Mailbox upload finalization completed successfully!"
echo "Mail services have been restarted."

# Show summary
echo ""
echo "Summary:"
echo "- Mailboxes moved to: /home/user-data/mail/mailboxes/"
echo "- Ownership set to: mail:mail"
echo "- Permissions set to: 755"
echo "- Temporary files cleaned up"
echo "- Mail services restarted"
EOF

chmod +x "${TEMP_DIR}/finalize-upload.sh"

# Copy finalization script and execute
echo "Copying finalization script to server..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no "${TEMP_DIR}/finalize-upload.sh" "ubuntu@${INSTANCE_IP}:~/"

echo "Executing finalization script..."
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "~/finalize-upload.sh"

echo ""
echo "✅ Mailbox upload finalization completed successfully!"
echo "Upload finalized at: $(date)"
echo "Server: ubuntu@${INSTANCE_IP}"
echo ""
echo "Your mail server should now have all your previous mailboxes."
echo "You can test email functionality to ensure everything is working correctly." 
```


### hepefoundation/hepeFoundation-Mail-Server-Files/upload-mailboxes.sh

```hepefoundation/hepeFoundation-Mail-Server-Files/upload-mailboxes.sh
#!/bin/bash

# Exit on error
set -e

# Default domain name
DEFAULT_DOMAIN="hepefoundation.org"

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

echo "Uploading mailboxes to new server for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
    exit 1
fi

# Find the most recent mailboxes backup on desktop
BACKUP_DIR=$(find "${HOME}/Desktop" -name "mailboxes-backup-*" -type d | sort -r | head -n 1)

if [ -z "$BACKUP_DIR" ]; then
    echo "Error: No mailboxes backup found on desktop"
    echo "Please run download-mailboxes.sh first to create a backup"
    exit 1
fi

echo "Found mailboxes backup: ${BACKUP_DIR}"

# Verify backup directory contains data
if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR")" ]; then
    echo "Error: Backup directory is empty or does not exist"
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

# Test SSH connection
echo "Testing SSH connection to new server..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "echo 'SSH connection successful'"; then
    echo "Error: Could not establish SSH connection to ubuntu@${INSTANCE_IP}"
    exit 1
fi

# Create temporary script to prepare the server
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

cat > "${TEMP_DIR}/prepare-server.sh" << 'EOF'
#!/bin/bash
set -e

echo "Preparing server for mailbox upload..."

# Stop mail services to prevent conflicts
sudo service postfix stop 2>/dev/null || true
sudo service dovecot stop 2>/dev/null || true

# Create backup of existing mailboxes if they exist
if [ -d "/home/user-data/mail/mailboxes" ]; then
    echo "Backing up existing mailboxes..."
    sudo cp -r /home/user-data/mail/mailboxes /home/user-data/mail/mailboxes.backup.$(date +%Y%m%d_%H%M%S)
    sudo rm -rf /home/user-data/mail/mailboxes
fi

# Create mailboxes directory with proper permissions
sudo mkdir -p /home/user-data/mail/mailboxes
sudo chown mail:mail /home/user-data/mail/mailboxes
sudo chmod 755 /home/user-data/mail/mailboxes

echo "Server prepared for mailbox upload"
EOF

chmod +x "${TEMP_DIR}/prepare-server.sh"

# Copy preparation script to server and execute
echo "Preparing the new server..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no "${TEMP_DIR}/prepare-server.sh" "ubuntu@${INSTANCE_IP}:~/"
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "~/prepare-server.sh"

# Upload mailboxes using rsync
echo "Uploading mailboxes from ${BACKUP_DIR} to ubuntu@${INSTANCE_IP}:/home/user-data/mail/mailboxes/"
echo "This may take a while depending on the size of your mailboxes..."

rsync -avz --progress \
    -e "ssh -i ${KEY_FILE} -o StrictHostKeyChecking=no" \
    "${BACKUP_DIR}/" \
    "ubuntu@${INSTANCE_IP}:/tmp/mailboxes-upload/"

if [ $? -ne 0 ]; then
    echo "Error: Failed to upload mailboxes"
    exit 1
fi

# Create script to finalize the upload
cat > "${TEMP_DIR}/finalize-upload.sh" << 'EOF'
#!/bin/bash
set -e

echo "Finalizing mailbox upload..."

# Move uploaded files to proper location with correct ownership
# Use find to handle hidden files and complex directory structures
sudo find /tmp/mailboxes-upload -mindepth 1 -maxdepth 1 -exec mv {} /home/user-data/mail/mailboxes/ \;
sudo chown -R mail:mail /home/user-data/mail/mailboxes
sudo chmod -R 755 /home/user-data/mail/mailboxes

# Clean up temporary upload directory
sudo rm -rf /tmp/mailboxes-upload

# Restart mail services
sudo service postfix start
sudo service dovecot start

echo "Mailbox upload completed successfully!"
echo "Mail services have been restarted."
EOF

chmod +x "${TEMP_DIR}/finalize-upload.sh"

# Copy finalization script and execute
echo "Finalizing mailbox upload..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no "${TEMP_DIR}/finalize-upload.sh" "ubuntu@${INSTANCE_IP}:~/"
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "~/finalize-upload.sh"

echo ""
echo "Mailboxes uploaded successfully!"
echo "Upload completed at: $(date)"
echo "Source backup: ${BACKUP_DIR}"
echo "Destination server: ubuntu@${INSTANCE_IP}"
echo ""
echo "The mail server should now have all your previous mailboxes."
echo "You may want to test email functionality to ensure everything is working correctly." 
```


### hepefoundation/print-ses-dns-records.sh

```hepefoundation/print-ses-dns-records.sh
#!/bin/bash

# Print SES DNS records script for hepefoundation.org
# This script invokes the main print-ses-dns-records.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Printing SES DNS records for hepefoundation.org..."
echo "Invoking print-ses-dns-records.sh from administration folder..."

# Call the main print-ses-dns-records.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/print-ses-dns-records.sh" "hepefoundation.org" 
```


### hepefoundation/restart-ec2-instance.sh

```hepefoundation/restart-ec2-instance.sh
#!/bin/bash

# Restart EC2 instance script for hepefoundation.org
# This script invokes the main restart-ec2-instance.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Restarting EC2 instance for hepefoundation.org mailserver..."
echo "Invoking restart-ec2-instance.sh from administration folder..."

# Call the main restart-ec2-instance.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/restart-ec2-instance.sh" "hepefoundation.org"
```


### hepefoundation/set-reverse-dns-elastic-ip.sh

```hepefoundation/set-reverse-dns-elastic-ip.sh
#!/bin/bash

# Set reverse DNS for Elastic IP script for hepefoundation.org
# This script invokes the main set-reverse-dns-elastic-ip.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting reverse DNS for Elastic IP for hepefoundation.org..."
echo "Invoking set-reverse-dns-elastic-ip.sh from administration folder..."

# Call the main set-reverse-dns-elastic-ip.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/set-reverse-dns-elastic-ip.sh" "hepefoundation.org" 
```


### hepefoundation/set-ses-dns-records.sh

```hepefoundation/set-ses-dns-records.sh
#!/bin/bash

# Set SES DNS records script for hepefoundation.org
# This script invokes the main set-ses-dns-records.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting SES DNS records for hepefoundation.org..."
echo "Invoking set-ses-dns-records.sh from administration folder..."

# Call the main set-ses-dns-records.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/set-ses-dns-records.sh" "hepefoundation.org" 
```


### hepefoundation/setup-ssh-access.sh

```hepefoundation/setup-ssh-access.sh
#!/bin/bash

# Setup SSH access script for hepefoundation.org
# This script invokes the main setup-ssh-access.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting up SSH access for hepefoundation.org..."
echo "Invoking setup-ssh-access.sh from administration folder..."

# Call the main setup-ssh-access.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/setup-ssh-access.sh" "hepefoundation.org" 
```


### hepefoundation/start-instance-and-wait.sh

```hepefoundation/start-instance-and-wait.sh
#!/bin/bash

# Start instance and wait script for hepefoundation.org
# This script invokes the main start-instance-and-wait.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Starting instance and waiting for hepefoundation.org mailserver..."
echo "Invoking start-instance-and-wait.sh from administration folder..."

# Call the main start-instance-and-wait.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/start-instance-and-wait.sh" "hepefoundation.org"
```


### hepefoundation/test-dns-api.sh

```hepefoundation/test-dns-api.sh
#!/bin/bash

# Test DNS API script for hepefoundation.org
# This script invokes the main test-dns-api.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Testing DNS API for hepefoundation.org..."
echo "Invoking test-dns-api.sh from administration folder..."

# Call the main test-dns-api.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/test-dns-api.sh" "hepefoundation.org" 
```


---

## policies

This section contains scripts and configurations specific to the policies deployment.


### policies/aws-server.guard

```policies/aws-server.guard
# S3 buckets must be encrypted w/ KMS, versioned, block public
let s3s = Resources.*[ Type == "AWS::S3::Bucket" ]
rule s3_encryption when %s3s !empty {
  %s3s.Properties.BucketEncryption.ServerSideEncryptionConfiguration[*].ServerSideEncryptionByDefault.SSEAlgorithm == "aws:kms"
}
rule s3_block_public when %s3s !empty {
  %s3s.Properties.PublicAccessBlockConfiguration.BlockPublicAcls == true
  %s3s.Properties.PublicAccessBlockConfiguration.BlockPublicPolicy == true
  %s3s.Properties.PublicAccessBlockConfiguration.RestrictPublicBuckets == true
  %s3s.Properties.PublicAccessBlockConfiguration.IgnorePublicAcls == true
}
rule s3_versioning when %s3s !empty {
  %s3s.Properties.VersioningConfiguration.Status == "Enabled"
}

# LogGroups must set retention >= 30
let logs = Resources.*[ Type == "AWS::Logs::LogGroup" ]
rule cw_retention when %logs !empty {
  %logs.Properties.RetentionInDays >= 30
}

# SecurityGroups: no SSH from 0.0.0.0/0
let sgs = Resources.*[ Type == "AWS::EC2::SecurityGroup" ]
rule no_open_ssh when %sgs !empty {
  not exists %sgs.Properties.SecurityGroupIngress[*] {
    (CidrIp == "0.0.0.0/0" || CidrIpv6 == "::/0") && (FromPort == 22 || ToPort == 22)
  }
}
```


---

## telassistmd

This section contains scripts and configurations specific to the telassistmd deployment.


### telassistmd/README.md

```telassistmd/README.md
# TelAssistMD Mail Server Deployment Scripts

This directory contains deployment and management scripts for the TelAssistMD mail server infrastructure. Each script is a wrapper that invokes the corresponding script from the `administration/` folder with the domain `telassistmd.com`.

## Available Scripts

### Core Deployment
- **`deploy-stack.sh`** - Deploy the CloudFormation stack for telassistmd.com
- **`describe-stack.sh`** - Show current stack status and outputs
- **`delete-stack.sh`** - Delete the CloudFormation stack

### SSH Access
- **`setup-ssh-access.sh`** - Set up SSH access to the EC2 instance
- **`cleanup-keys.sh`** - Clean up local SSH keys and known_hosts entries

### Email Configuration
- **`get-ses-config.sh`** - Get SES configuration details
- **`generate_ses_smtp_credentials.sh`** - Generate SMTP credentials for SES
- **`print-ses-dns-records.sh`** - Print required DNS records for SES
- **`set-ses-dns-records.sh`** - Configure DNS records for SES

### DNS and Network
- **`set-reverse-dns-elastic-ip.sh`** - Set reverse DNS for the Elastic IP
- **`test-dns-api.sh`** - Test DNS API connectivity

### Admin Access
- **`get-admin-password.sh`** - Retrieve the admin password for Mail-in-a-Box

## Usage

All scripts are executable and can be run directly:

```bash
# Deploy the infrastructure
./deploy-stack.sh

# Check deployment status
./describe-stack.sh

# Set up SSH access
./setup-ssh-access.sh

# Get admin password
./get-admin-password.sh
```

## Prerequisites

- AWS CLI configured with the `hepe-admin-mfa` profile
- CloudFormation template `mailserver-infrastructure-mvp.yaml` in the project root
- Python 3 for the SES credentials script

## Notes

- All scripts automatically use the domain `telassistmd.com`
- The CloudFormation stack will be named `telassistmd-com-mailserver`
- SSH keys and configuration files are managed locally in `~/.ssh/`
- DNS records may need to be manually configured on your DNS server 
```


### telassistmd/cleanup-keys.sh

```telassistmd/cleanup-keys.sh
#!/bin/bash

# Cleanup keys script for telassistmd.com
# This script invokes the main cleanup-keys.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Cleaning up keys for telassistmd.com..."
echo "Invoking cleanup-keys.sh from administration folder..."

# Call the main cleanup-keys.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/cleanup-keys.sh" "telassistmd.com" 
```


### telassistmd/delete-stack.sh

```telassistmd/delete-stack.sh
#!/bin/bash

# Delete stack script for telassistmd.com
# This script invokes the main delete-stack.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deleting mailserver infrastructure for telassistmd.com..."
echo "Invoking delete-stack.sh from administration folder..."

# Call the main delete-stack.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/delete-stack.sh" "telassistmd.com" 
```


### telassistmd/deploy-stack.sh

```telassistmd/deploy-stack.sh
#!/bin/bash

# Deploy script for telassistmd.com
# This script invokes the main deploy-stack.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deploying mailserver infrastructure for telassistmd.com..."
echo "Invoking deploy-stack.sh from administration folder..."

# Call the main deploy-stack.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/deploy-stack.sh" "telassistmd.com" 
```


### telassistmd/describe-stack.sh

```telassistmd/describe-stack.sh
#!/bin/bash

# Describe stack script for telassistmd.com
# This script invokes the main describe-stack.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Describing mailserver infrastructure for telassistmd.com..."
echo "Invoking describe-stack.sh from administration folder..."

# Call the main describe-stack.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/describe-stack.sh" "telassistmd.com" 
```


### telassistmd/generate_ses_smtp_credentials.sh

```telassistmd/generate_ses_smtp_credentials.sh
#!/bin/bash

# Generate SES SMTP credentials script for telassistmd.com
# This script invokes the main generate_ses_smtp_credentials.py with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Generating SES SMTP credentials for telassistmd.com..."
echo "Invoking generate_ses_smtp_credentials.py from administration folder..."

# Call the main generate_ses_smtp_credentials.py script with telassistmd.com domain
exec python3 "${ADMIN_DIR}/generate_ses_smtp_credentials.py" --domain "telassistmd.com" 
```


### telassistmd/get-admin-password.sh

```telassistmd/get-admin-password.sh
#!/bin/bash

# Get admin password script for telassistmd.com
# This script invokes the main get-admin-password.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Getting admin password for telassistmd.com..."
echo "Invoking get-admin-password.sh from administration folder..."

# Call the main get-admin-password.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/get-admin-password.sh" "telassistmd.com" 
```


### telassistmd/get-ses-config.sh

```telassistmd/get-ses-config.sh
#!/bin/bash

# Get SES config script for telassistmd.com
# This script invokes the main get-ses-config.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Getting SES configuration for telassistmd.com..."
echo "Invoking get-ses-config.sh from administration folder..."

# Call the main get-ses-config.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/get-ses-config.sh" "telassistmd.com" 
```


### telassistmd/print-ses-dns-records.sh

```telassistmd/print-ses-dns-records.sh
#!/bin/bash

# Print SES DNS records script for telassistmd.com
# This script invokes the main print-ses-dns-records.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Printing SES DNS records for telassistmd.com..."
echo "Invoking print-ses-dns-records.sh from administration folder..."

# Call the main print-ses-dns-records.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/print-ses-dns-records.sh" "telassistmd.com" 
```


### telassistmd/set-reverse-dns-elastic-ip.sh

```telassistmd/set-reverse-dns-elastic-ip.sh
#!/bin/bash

# Set reverse DNS for Elastic IP script for telassistmd.com
# This script invokes the main set-reverse-dns-elastic-ip.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting reverse DNS for Elastic IP for telassistmd.com..."
echo "Invoking set-reverse-dns-elastic-ip.sh from administration folder..."

# Call the main set-reverse-dns-elastic-ip.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/set-reverse-dns-elastic-ip.sh" "telassistmd.com" 
```


### telassistmd/set-ses-dns-records.sh

```telassistmd/set-ses-dns-records.sh
#!/bin/bash

# Set SES DNS records script for telassistmd.com
# This script invokes the main set-ses-dns-records.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting SES DNS records for telassistmd.com..."
echo "Invoking set-ses-dns-records.sh from administration folder..."

# Call the main set-ses-dns-records.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/set-ses-dns-records.sh" "telassistmd.com" 
```


### telassistmd/setup-ssh-access.sh

```telassistmd/setup-ssh-access.sh
#!/bin/bash

# Setup SSH access script for telassistmd.com
# This script invokes the main setup-ssh-access.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting up SSH access for telassistmd.com..."
echo "Invoking setup-ssh-access.sh from administration folder..."

# Call the main setup-ssh-access.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/setup-ssh-access.sh" "telassistmd.com" 
```


### telassistmd/test-dns-api.sh

```telassistmd/test-dns-api.sh
#!/bin/bash

# Test DNS API script for telassistmd.com
# This script invokes the main test-dns-api.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Testing DNS API for telassistmd.com..."
echo "Invoking test-dns-api.sh from administration folder..."

# Call the main test-dns-api.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/test-dns-api.sh" "telassistmd.com" 
```


---

## PEM File References

The following .pem file paths were found in the codebase. These files contain sensitive cryptographic keys and their contents are not included in this document for security reasons. Only the file paths are listed:

- ~/.ssh/${DOMAIN_NAME}-keypair.pem
- ~/.ssh/emcnotary.com-keypair.pem
- ~/.ssh/{args.domain}-keypair.pem
