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






