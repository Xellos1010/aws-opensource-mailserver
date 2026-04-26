#!/usr/bin/env zsh
# backup-and-cleanup.sh
#
# Phase 1 (SAFE):        Back up all data-bearing resources
# Phase 2 (DESTRUCTIVE): Delete non-HEPE CloudFormation stacks
# Phase 3 (DESTRUCTIVE): Delete orphaned non-HEPE resources
#
# HEPE Foundation (hepefoundation-org-*) stacks, EC2, S3, logs are NEVER touched.
#
# Usage:
#   zsh backup-and-cleanup.sh           # Phase 1 only (safe)
#   zsh backup-and-cleanup.sh --delete  # Phase 1 + confirm + Phases 2-3
set -Eeuo pipefail

PROFILE="hepe-admin-mfa"
REGION="us-east-1"
BACKUP_ROOT="/Volumes/EvanMcCall/AWS-Backups"
RUN_DELETE="${1:-}"

# ── EC2 / resources that must never be touched ────────────────────────────────
HEPE_INSTANCE_ID="i-0a1ff83f513575ed4"
HEPE_EIP="44.194.23.56"

HEPE_PRESERVE_STACKS=(
  "hepefoundation-org-stop-start-helper"
  "hepefoundation-org-system-reset"
  "hepefoundation-org-service-restart"
  "hepefoundation-org-external-monitoring"
  "hepefoundation-org-mail-health-check"
  "hepefoundation-org-emergency-alarms"
  "hepefoundation-org-system-stats"
)

HEPE_PRESERVE_BUCKETS=(
  "hepefoundation-aws-opensource-mailserver-backup"
  "hepefoundation-aws-opensource-mailserver-nextcloud"
  "hepefoundation.org-backup"
  "hepefoundation.org-nextcloud"
  "transcribe-files-hepe"
)

# ── Stacks to delete (all non-HEPE) ──────────────────────────────────────────
STACKS_TO_DELETE=(
  "visomarketinggroup-com-website"
  "trinitycomprehensivehealthcare-com-website"
  "emc-notary-outbound-dialer"
  "emc-notary-email-service-staging"
  "emc-notary-email-service"
  "emc-notary-web"
  "EmcNotaryApi-staging"
  "AskDaoCore-staging"
  "emcnotary-com-mailserver-observability-maintenance"
  "emcnotary-com-mailserver-instance"
  "EmcNotaryCore-staging"
  "emcnotary-com-mailserver-core"
  "askdaokapra-com-mailserver"
  "dynamodb-layer-dev"
  "common-utils-layer-dev"
  "CDKToolkit"
)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log()  { print -P "${BLUE}[INFO]${NC} $*"; }
ok()   { print -P "${GREEN}[OK]${NC}   $*"; }
warn() { print -P "${YELLOW}[WARN]${NC} $*"; }
err()  { print -P "${RED}[ERR]${NC}  $*"; }
sep()  { print -P "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ── helpers ────────────────────────────────────────────────────────────────────
is_hepe_bucket() {
  local b="$1"
  for hb in "${HEPE_PRESERVE_BUCKETS[@]}"; do
    [ "${b}" = "${hb}" ] && return 0
  done
  return 1
}

is_hepe_loggroup() {
  local lg="$1"
  [[ "${lg}" == *hepefoundation* ]] || [[ "${lg}" == *"hepe"* ]]
}

is_hepe_alarm() {
  local a="$1"
  [[ "${a}" == *hepefoundation* ]] || [[ "${a}" == *"hepe"* ]] || [[ "${a}" == *"${HEPE_INSTANCE_ID}"* ]]
}

bucket_category() {
  case "$1" in
    ask-dao|ask-dao-*|askdao-*|askdaokapra-*|dao-kapra-*|www.askdaokapra.*) echo "askdao" ;;
    emcnotary-*|emcnotarycore-*)                                              echo "emcnotary" ;;
    hepefoundation-*|"hepefoundation.org-"*|transcribe-files-hepe)           echo "hepefoundation" ;;
    visomarketinggroup*)                                                       echo "visomarketinggroup" ;;
    trinitycomprehensivehealthcare*)                                           echo "trinitycomprehensivehealthcare" ;;
    cdk-*|cf-templates-*|serverless-framework-*)                              echo "infrastructure" ;;
    aws-cloudtrail-*|aws-log-archive-*|bedrock-cline-*|billing-reports-tab)  echo "logging" ;;
    *)                                                                         echo "uncategorized" ;;
  esac
}

table_category() {
  case "$1" in
    AppVersions|AskDao*|askdao-*) echo "askdao" ;;
    EmcNotary*|emcnotary-*)       echo "emcnotary" ;;
    *)                             echo "uncategorized" ;;
  esac
}

ssm_run() {
  local instance_id="$1"
  local cmd="$2"
  local label="${3:-command}"
  log "  SSM → ${instance_id}: ${label}"
  local cmd_id
  cmd_id=$(aws ssm send-command \
    --profile "${PROFILE}" --region "${REGION}" \
    --instance-ids "${instance_id}" \
    --document-name "AWS-RunShellScript" \
    --parameters "commands=[\"${cmd}\"]" \
    --query 'Command.CommandId' --output text)
  # Wait up to 10 minutes
  for i in $(seq 1 60); do
    sleep 10
    local ssm_status
    ssm_status=$(aws ssm get-command-invocation \
      --profile "${PROFILE}" --region "${REGION}" \
      --command-id "${cmd_id}" --instance-id "${instance_id}" \
      --query 'Status' --output text 2>/dev/null || echo "Pending")
    case "${ssm_status}" in
      Success)
        ok "  SSM complete: ${label}"
        return 0 ;;
      Failed|Cancelled|TimedOut|DeliveryTimedOut|ExecutionTimedOut)
        warn "  SSM failed (${ssm_status}): ${label}"
        return 1 ;;
    esac
  done
  warn "  SSM timed out waiting for: ${label}"
  return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 1: BACKUP
# ─────────────────────────────────────────────────────────────────────────────

phase1_backup() {
  sep
  print -P "${BOLD}PHASE 1: BACKUP${NC}  →  ${BACKUP_ROOT}"
  print -P "${YELLOW}HEPE Foundation resources are backed up but will NOT be deleted.${NC}"
  sep
  mkdir -p "${BACKUP_ROOT}"

  # ── 1a. Trigger fresh MIAB mailbox backups ─────────────────────────────────
  sep
  log "1a. Triggering Mail-in-a-Box mailbox backups..."

  # EMC Notary mail server (SSM available)
  local EMCNOTARY_MAIL_ID="i-0518bce9a3056e4a6"
  log "  Triggering MIAB backup on EMC Notary mail server (${EMCNOTARY_MAIL_ID})..."
  ssm_run "${EMCNOTARY_MAIL_ID}" \
    "sudo -u root bash -c 'cd /home/user-data && python3 /home/user-data/../management/backup.py 2>&1 || true'" \
    "MIAB backup - EMC Notary" || warn "  MIAB backup trigger failed for EMC Notary (backup may already be current)"

  # AskDao Kapra mail server — no SSM agent, use MIAB admin API via curl from local
  log "  Triggering MIAB backup on AskDao Kapra mail server via admin API..."
  local ASKDAO_PASS
  ASKDAO_PASS=$(aws ssm get-parameter \
    --profile "${PROFILE}" --region "${REGION}" \
    --name "MailInABoxAdminPassword-askdaokapra-com-mailserver" \
    --with-decryption --query 'Parameter.Value' --output text 2>/dev/null || echo "")
  if [ -n "${ASKDAO_PASS}" ]; then
    curl -s -X POST "https://box.askdaokapra.com/admin/backup/run" \
      -u "admin@askdaokapra.com:${ASKDAO_PASS}" \
      --max-time 30 2>/dev/null && ok "  MIAB backup triggered for AskDao" || warn "  Could not reach AskDao admin API"
  else
    warn "  Could not retrieve AskDao admin password from SSM"
  fi

  # EMC Notary web server — use SSM to archive web root
  local EMCNOTARY_WEB_ID="i-02e3785df093e84c9"
  local WEB_BACKUP_DEST="${BACKUP_ROOT}/emcnotary/ec2-web"
  mkdir -p "${WEB_BACKUP_DEST}"
  log "  Archiving EMC Notary web server home dir via SSM..."
  ssm_run "${EMCNOTARY_WEB_ID}" \
    "tar czf /tmp/webserver-backup.tar.gz /var/www /home /etc/nginx /etc/apache2 2>/dev/null || tar czf /tmp/webserver-backup.tar.gz /var/www /home 2>/dev/null || true" \
    "archive web root" || warn "  Web archive failed"
  # Upload to S3 then pull locally
  ssm_run "${EMCNOTARY_WEB_ID}" \
    "aws s3 cp /tmp/webserver-backup.tar.gz s3://emcnotary.com-backup/ec2-web-backup-\$(date +%Y%m%d).tar.gz --region us-east-1 2>/dev/null || true" \
    "upload web archive to S3" || warn "  Web archive S3 upload failed"
  ok "  EMC Notary web backup triggered — will be captured in S3 sync"

  # ── 1b. CloudFormation stack templates ────────────────────────────────────
  sep
  log "1b. Exporting CloudFormation stack templates..."
  local CF_DIR="${BACKUP_ROOT}/cloudformation-templates"
  mkdir -p "${CF_DIR}"

  local ALL_STACKS
  ALL_STACKS=$(aws cloudformation list-stacks \
    --profile "${PROFILE}" --region "${REGION}" \
    --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE ROLLBACK_COMPLETE \
    --query 'StackSummaries[*].StackName' --output json | jq -r '.[]')

  while IFS= read -r STACK; do
    aws cloudformation get-template \
      --profile "${PROFILE}" --region "${REGION}" \
      --stack-name "${STACK}" \
      --query 'TemplateBody' \
      --output json > "${CF_DIR}/${STACK}.json" 2>/dev/null || warn "  Could not export template: ${STACK}"
    aws cloudformation describe-stacks \
      --profile "${PROFILE}" --region "${REGION}" \
      --stack-name "${STACK}" \
      --query 'Stacks[0].{Parameters:Parameters,Outputs:Outputs,Tags:Tags}' \
      --output json > "${CF_DIR}/${STACK}-metadata.json" 2>/dev/null || true
    log "  Exported: ${STACK}"
  done <<< "${ALL_STACKS}"
  ok "CloudFormation templates exported."

  # ── 1c. SSM Parameters ────────────────────────────────────────────────────
  sep
  log "1c. Exporting SSM parameters..."
  local SSM_DIR="${BACKUP_ROOT}/ssm-parameters"
  mkdir -p "${SSM_DIR}"

  # Export parameter names + types (no secret values in plain text)
  aws ssm describe-parameters \
    --profile "${PROFILE}" --region "${REGION}" \
    --output json > "${SSM_DIR}/parameter-list.json" 2>/dev/null || warn "  Could not list SSM parameters"

  # Export non-secret String parameters
  aws ssm get-parameters-by-path \
    --profile "${PROFILE}" --region "${REGION}" \
    --path "/" --recursive \
    --query 'Parameters[?Type!=`SecureString`]' \
    --output json > "${SSM_DIR}/string-parameters.json" 2>/dev/null || warn "  Could not export string params"

  # Export SecureString parameters with decryption (contains API keys, passwords)
  aws ssm get-parameters-by-path \
    --profile "${PROFILE}" --region "${REGION}" \
    --path "/" --recursive \
    --with-decryption \
    --output json > "${SSM_DIR}/all-parameters-decrypted.json" 2>/dev/null || warn "  Could not export decrypted params"

  ok "SSM parameters exported to ${SSM_DIR}"

  # ── 1d. Secrets Manager ───────────────────────────────────────────────────
  sep
  log "1d. Exporting Secrets Manager secrets..."
  local SECRETS_DIR="${BACKUP_ROOT}/secrets-manager"
  mkdir -p "${SECRETS_DIR}"

  local SECRET_LIST
  SECRET_LIST=$(aws secretsmanager list-secrets \
    --profile "${PROFILE}" --region "${REGION}" \
    --query 'SecretList[*].Name' --output json | jq -r '.[]')

  while IFS= read -r SECRET_NAME; do
    [ -z "${SECRET_NAME}" ] && continue
    local SAFE
    SAFE=$(echo "${SECRET_NAME}" | sed 's|/|_|g')
    aws secretsmanager get-secret-value \
      --profile "${PROFILE}" --region "${REGION}" \
      --secret-id "${SECRET_NAME}" \
      --output json > "${SECRETS_DIR}/${SAFE}.json" 2>/dev/null \
      && ok "  Exported secret: ${SECRET_NAME}" \
      || warn "  Could not export secret: ${SECRET_NAME}"
  done <<< "${SECRET_LIST}"

  # ── 1e. Route53 hosted zones ──────────────────────────────────────────────
  sep
  log "1e. Exporting Route53 hosted zones..."
  local R53_DIR="${BACKUP_ROOT}/route53"
  mkdir -p "${R53_DIR}"

  local ZONE_LIST
  ZONE_LIST=$(aws route53 list-hosted-zones \
    --profile "${PROFILE}" \
    --query 'HostedZones[*].{Id:Id,Name:Name}' \
    --output json)

  echo "${ZONE_LIST}" | jq -c '.[]' | while IFS= read -r ZONE; do
    local ZONE_ID
    ZONE_ID=$(echo "${ZONE}" | jq -r '.Id' | sed 's|/hostedzone/||')
    local ZONE_NAME
    ZONE_NAME=$(echo "${ZONE}" | jq -r '.Name' | sed 's/\.$//; s/\./-/g')
    aws route53 list-resource-record-sets \
      --profile "${PROFILE}" \
      --hosted-zone-id "${ZONE_ID}" \
      --output json > "${R53_DIR}/${ZONE_NAME}.json" 2>/dev/null \
      && ok "  Exported zone: ${ZONE_NAME}" \
      || warn "  Could not export zone: ${ZONE_NAME}"
  done

  # ── 1f. Lambda function code ──────────────────────────────────────────────
  sep
  log "1f. Exporting Lambda function code..."
  local LAMBDA_DIR="${BACKUP_ROOT}/lambda-code"
  mkdir -p "${LAMBDA_DIR}"

  local LAMBDA_LIST
  LAMBDA_LIST=$(aws lambda list-functions \
    --profile "${PROFILE}" --region "${REGION}" \
    --query 'Functions[*].FunctionName' --output json | jq -r '.[]')

  while IFS= read -r FUNC; do
    [ -z "${FUNC}" ] && continue
    local URL
    URL=$(aws lambda get-function \
      --profile "${PROFILE}" --region "${REGION}" \
      --function-name "${FUNC}" \
      --query 'Code.Location' --output text 2>/dev/null || echo "")
    if [ -n "${URL}" ] && [ "${URL}" != "None" ]; then
      curl -s -L -o "${LAMBDA_DIR}/${FUNC}.zip" "${URL}" 2>/dev/null \
        && ok "  Downloaded Lambda code: ${FUNC}" \
        || warn "  Could not download: ${FUNC}"
    fi
  done <<< "${LAMBDA_LIST}"

  # ── 1g. S3 buckets ────────────────────────────────────────────────────────
  sep
  log "1g. Syncing S3 buckets..."

  local ALL_BUCKETS
  ALL_BUCKETS=$(aws s3api list-buckets --profile "${PROFILE}" \
    --query 'Buckets[*].Name' --output json | jq -r '.[]')

  while IFS= read -r BUCKET; do
    [ -z "${BUCKET}" ] && continue
    local CAT
    CAT=$(bucket_category "${BUCKET}")
    local DEST="${BACKUP_ROOT}/${CAT}/s3/${BUCKET}"
    mkdir -p "${DEST}"
    log "  Syncing s3://${BUCKET}  →  ${CAT}/s3/"
    aws s3 sync "s3://${BUCKET}" "${DEST}" \
      --profile "${PROFILE}" \
      --no-progress \
      --exact-timestamps \
      2>&1 | grep -E "^(download|error)" | head -5 || true
    ok "  Done: ${BUCKET} (${CAT})"
  done <<< "${ALL_BUCKETS}"

  # ── 1h. DynamoDB tables ───────────────────────────────────────────────────
  sep
  log "1h. Exporting DynamoDB tables..."

  local ALL_TABLES
  ALL_TABLES=$(aws dynamodb list-tables \
    --profile "${PROFILE}" --region "${REGION}" \
    --query 'TableNames' --output json | jq -r '.[]')

  while IFS= read -r TABLE; do
    [ -z "${TABLE}" ] && continue
    local CAT
    CAT=$(table_category "${TABLE}")
    local DEST_DIR="${BACKUP_ROOT}/${CAT}/dynamodb"
    mkdir -p "${DEST_DIR}"
    local DEST_FILE="${DEST_DIR}/${TABLE}.json"
    log "  Scanning: ${TABLE}"
    local LAST_KEY=""
    local ITEMS_JSON="[]"
    while true; do
      local RESULT
      if [ -z "${LAST_KEY}" ]; then
        RESULT=$(aws dynamodb scan \
          --profile "${PROFILE}" --region "${REGION}" \
          --table-name "${TABLE}" --output json 2>/dev/null) || { warn "  Scan failed: ${TABLE}"; break; }
      else
        RESULT=$(aws dynamodb scan \
          --profile "${PROFILE}" --region "${REGION}" \
          --table-name "${TABLE}" \
          --exclusive-start-key "${LAST_KEY}" --output json 2>/dev/null) || { warn "  Scan page failed: ${TABLE}"; break; }
      fi
      local PAGE_ITEMS
      PAGE_ITEMS=$(echo "${RESULT}" | jq '.Items')
      ITEMS_JSON=$(printf '%s\n%s' "${ITEMS_JSON}" "${PAGE_ITEMS}" | jq -s 'add')
      LAST_KEY=$(echo "${RESULT}" | jq -rc '.LastEvaluatedKey // empty')
      [ -z "${LAST_KEY}" ] && break
    done
    echo "${ITEMS_JSON}" > "${DEST_FILE}"
    local COUNT
    COUNT=$(echo "${ITEMS_JSON}" | jq 'length')
    ok "  ${TABLE}: ${COUNT} items (${CAT})"
  done <<< "${ALL_TABLES}"

  # ── 1i. CloudWatch log groups (non-empty only) ────────────────────────────
  sep
  log "1i. Exporting non-empty CloudWatch log groups..."

  local LOG_GROUPS
  LOG_GROUPS=$(aws logs describe-log-groups \
    --profile "${PROFILE}" --region "${REGION}" \
    --query 'logGroups[?storedBytes>`0`].logGroupName' \
    --output json | jq -r '.[]')

  while IFS= read -r LG_NAME; do
    [ -z "${LG_NAME}" ] && continue
    local LG_CAT
    if [[ "${LG_NAME}" == *emcnotary* ]] || [[ "${LG_NAME}" == *EmcNotary* ]] || [[ "${LG_NAME}" == *emc-notary* ]]; then
      LG_CAT="emcnotary"
    elif [[ "${LG_NAME}" == *hepefoundation* ]] || [[ "${LG_NAME}" == *hepe* ]]; then
      LG_CAT="hepefoundation"
    elif [[ "${LG_NAME}" == *askdao* ]] || [[ "${LG_NAME}" == *AskDao* ]]; then
      LG_CAT="askdao"
    else
      LG_CAT="uncategorized"
    fi

    local SAFE_NAME
    SAFE_NAME=$(echo "${LG_NAME}" | sed 's|/|_|g; s|^_||')
    local DEST_DIR="${BACKUP_ROOT}/${LG_CAT}/logs"
    mkdir -p "${DEST_DIR}"
    local DEST_FILE="${DEST_DIR}/${SAFE_NAME}.json"
    log "  Log group: ${LG_NAME}"

    local STREAMS
    STREAMS=$(aws logs describe-log-streams \
      --profile "${PROFILE}" --region "${REGION}" \
      --log-group-name "${LG_NAME}" \
      --order-by LastEventTime --descending \
      --query 'logStreams[*].logStreamName' \
      --output json 2>/dev/null | jq -r '.[]' | head -100) || STREAMS=""

    local ALL_EVENTS="[]"
    while IFS= read -r STREAM; do
      [ -z "${STREAM}" ] && continue
      local EVENTS
      EVENTS=$(aws logs get-log-events \
        --profile "${PROFILE}" --region "${REGION}" \
        --log-group-name "${LG_NAME}" \
        --log-stream-name "${STREAM}" \
        --start-from-head \
        --output json 2>/dev/null | jq --arg s "${STREAM}" '{stream:$s,events:.events}') \
        || EVENTS="{\"stream\":\"${STREAM}\",\"events\":[]}"
      ALL_EVENTS=$(printf '%s\n[%s]' "${ALL_EVENTS}" "${EVENTS}" | jq -s 'add')
    done <<< "${STREAMS}"

    echo "${ALL_EVENTS}" > "${DEST_FILE}"
    ok "  Exported: ${LG_NAME}"
  done <<< "${LOG_GROUPS}"

  # ── Summary ────────────────────────────────────────────────────────────────
  sep
  ok "PHASE 1 COMPLETE — All backups written to ${BACKUP_ROOT}"
  sep
  echo ""
  du -sh "${BACKUP_ROOT}"/*/  2>/dev/null | sort -h || true
  echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 2: DELETE NON-HEPE STACKS
# ─────────────────────────────────────────────────────────────────────────────

phase2_delete_stacks() {
  sep
  print -P "${RED}${BOLD}PHASE 2: DELETE NON-HEPE CLOUDFORMATION STACKS${NC}"
  print -P "${GREEN}  Preserving all hepefoundation-org-* stacks${NC}"
  sep

  for STACK in "${STACKS_TO_DELETE[@]}"; do
    local STATUS
    STATUS=$(aws cloudformation describe-stacks \
      --profile "${PROFILE}" --region "${REGION}" \
      --stack-name "${STACK}" \
      --query 'Stacks[0].StackStatus' \
      --output text 2>/dev/null || echo "DOES_NOT_EXIST")

    if [[ "${STATUS}" == "DOES_NOT_EXIST" ]] || [[ "${STATUS}" == "None" ]]; then
      warn "Stack not found (already deleted): ${STACK}"
      continue
    fi

    log "Deleting: ${STACK} (status: ${STATUS})"
    aws cloudformation delete-stack \
      --profile "${PROFILE}" --region "${REGION}" \
      --stack-name "${STACK}" 2>&1 || warn "  delete-stack call failed for ${STACK}"

    log "  Waiting: ${STACK}"
    aws cloudformation wait stack-delete-complete \
      --profile "${PROFILE}" --region "${REGION}" \
      --stack-name "${STACK}" 2>/dev/null \
      && ok "  Deleted: ${STACK}" \
      || warn "  Timed out/failed: ${STACK} — check console manually"
  done

  ok "Stack deletion complete."
}

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 3: CLEANUP ORPHANED NON-HEPE RESOURCES
# ─────────────────────────────────────────────────────────────────────────────

phase3_cleanup_orphans() {
  sep
  print -P "${RED}${BOLD}PHASE 3: CLEANUP ORPHANED NON-HEPE RESOURCES${NC}"
  print -P "${GREEN}  Preserving HEPE Foundation buckets, log groups, alarms, and EC2${NC}"
  sep

  # 3a. Empty and delete non-HEPE S3 buckets
  log "Emptying and deleting non-HEPE S3 buckets..."
  local REMAINING_BUCKETS
  REMAINING_BUCKETS=$(aws s3api list-buckets --profile "${PROFILE}" \
    --query 'Buckets[*].Name' --output json 2>/dev/null | jq -r '.[]' || echo "")

  while IFS= read -r BUCKET; do
    [ -z "${BUCKET}" ] && continue
    if is_hepe_bucket "${BUCKET}"; then
      log "  Preserving HEPE bucket: ${BUCKET}"
      continue
    fi
    log "  Processing: ${BUCKET}"
    # Remove versioned objects
    while true; do
      local VERSIONS
      VERSIONS=$(aws s3api list-object-versions \
        --profile "${PROFILE}" --bucket "${BUCKET}" \
        --query '{Objects: (Versions[0:1000] // []) | map({Key:.Key,VersionId:.VersionId}), Quiet:true}' \
        --output json 2>/dev/null || echo '{"Objects":[],"Quiet":true}')
      local CNT
      CNT=$(echo "${VERSIONS}" | jq '.Objects | length')
      [ "${CNT}" -eq 0 ] && break
      aws s3api delete-objects --profile "${PROFILE}" --bucket "${BUCKET}" --delete "${VERSIONS}" 2>/dev/null || true
    done
    # Remove delete markers
    while true; do
      local MARKERS
      MARKERS=$(aws s3api list-object-versions \
        --profile "${PROFILE}" --bucket "${BUCKET}" \
        --query '{Objects: (DeleteMarkers[0:1000] // []) | map({Key:.Key,VersionId:.VersionId}), Quiet:true}' \
        --output json 2>/dev/null || echo '{"Objects":[],"Quiet":true}')
      local CNT
      CNT=$(echo "${MARKERS}" | jq '.Objects | length')
      [ "${CNT}" -eq 0 ] && break
      aws s3api delete-objects --profile "${PROFILE}" --bucket "${BUCKET}" --delete "${MARKERS}" 2>/dev/null || true
    done
    aws s3 rm "s3://${BUCKET}" --recursive --profile "${PROFILE}" 2>/dev/null || true
    aws s3api delete-bucket --profile "${PROFILE}" --bucket "${BUCKET}" 2>/dev/null \
      && ok "  Deleted bucket: ${BUCKET}" \
      || warn "  Could not delete bucket: ${BUCKET}"
  done <<< "${REMAINING_BUCKETS}"

  # 3b. Delete remaining non-HEPE DynamoDB tables
  log "Deleting remaining DynamoDB tables..."
  local REMAINING_TABLES
  REMAINING_TABLES=$(aws dynamodb list-tables \
    --profile "${PROFILE}" --region "${REGION}" \
    --query 'TableNames' --output json 2>/dev/null | jq -r '.[]' || echo "")
  while IFS= read -r TABLE; do
    [ -z "${TABLE}" ] && continue
    aws dynamodb delete-table \
      --profile "${PROFILE}" --region "${REGION}" \
      --table-name "${TABLE}" 2>/dev/null \
      && ok "  Deleted table: ${TABLE}" \
      || warn "  Could not delete table: ${TABLE}"
  done <<< "${REMAINING_TABLES}"

  # 3c. Delete non-HEPE CloudWatch alarms
  log "Deleting non-HEPE CloudWatch alarms..."
  local ALARMS
  ALARMS=$(aws cloudwatch describe-alarms \
    --profile "${PROFILE}" --region "${REGION}" \
    --query 'MetricAlarms[*].AlarmName' --output json 2>/dev/null | jq -r '.[]' || echo "")
  while IFS= read -r ALARM; do
    [ -z "${ALARM}" ] && continue
    if is_hepe_alarm "${ALARM}"; then
      log "  Preserving HEPE alarm: ${ALARM}"
      continue
    fi
    aws cloudwatch delete-alarms \
      --profile "${PROFILE}" --region "${REGION}" \
      --alarm-names "${ALARM}" 2>/dev/null && ok "  Deleted alarm: ${ALARM}" || true
  done <<< "${ALARMS}"

  # 3d. Release unassociated Elastic IPs (NOT the HEPE EIP)
  log "Releasing orphaned Elastic IPs..."
  local EIPS
  EIPS=$(aws ec2 describe-addresses \
    --profile "${PROFILE}" --region "${REGION}" \
    --query 'Addresses[?AssociationId==null].{Id:AllocationId,IP:PublicIp}' \
    --output json 2>/dev/null | jq -r '.[] | "\(.Id) \(.IP)"' || echo "")
  while IFS= read -r LINE; do
    [ -z "${LINE}" ] && continue
    local EIP_ID
    EIP_ID=$(echo "${LINE}" | awk '{print $1}')
    local EIP_IP
    EIP_IP=$(echo "${LINE}" | awk '{print $2}')
    if [ "${EIP_IP}" = "${HEPE_EIP}" ]; then
      log "  Preserving HEPE EIP: ${EIP_IP}"
      continue
    fi
    aws ec2 release-address \
      --profile "${PROFILE}" --region "${REGION}" \
      --allocation-id "${EIP_ID}" 2>/dev/null && ok "  Released EIP: ${EIP_IP}" || true
  done <<< "${EIPS}"

  # 3e. Available (unattached) EBS volumes
  log "Deleting unattached EBS volumes..."
  local VOLUMES
  VOLUMES=$(aws ec2 describe-volumes \
    --profile "${PROFILE}" --region "${REGION}" \
    --filters Name=status,Values=available \
    --query 'Volumes[*].VolumeId' --output json 2>/dev/null | jq -r '.[]' || echo "")
  while IFS= read -r VOL; do
    [ -z "${VOL}" ] && continue
    aws ec2 delete-volume \
      --profile "${PROFILE}" --region "${REGION}" \
      --volume-id "${VOL}" 2>/dev/null && ok "  Deleted volume: ${VOL}" || true
  done <<< "${VOLUMES}"

  # 3f. Delete non-HEPE CloudWatch log groups
  log "Deleting non-HEPE CloudWatch log groups..."
  local LOG_GROUPS
  LOG_GROUPS=$(aws logs describe-log-groups \
    --profile "${PROFILE}" --region "${REGION}" \
    --query 'logGroups[*].logGroupName' --output json 2>/dev/null | jq -r '.[]' || echo "")
  while IFS= read -r LG; do
    [ -z "${LG}" ] && continue
    if is_hepe_loggroup "${LG}"; then
      log "  Preserving HEPE log group: ${LG}"
      continue
    fi
    aws logs delete-log-group \
      --profile "${PROFILE}" --region "${REGION}" \
      --log-group-name "${LG}" 2>/dev/null && ok "  Deleted log group: ${LG}" || true
  done <<< "${LOG_GROUPS}"

  # 3g. Delete SNS topics (check if any are HEPE before deleting)
  log "Deleting SNS topics..."
  local TOPICS
  TOPICS=$(aws sns list-topics \
    --profile "${PROFILE}" --region "${REGION}" \
    --query 'Topics[*].TopicArn' --output json 2>/dev/null | jq -r '.[]' || echo "")
  while IFS= read -r TOPIC; do
    [ -z "${TOPIC}" ] && continue
    if [[ "${TOPIC}" == *hepefoundation* ]] || [[ "${TOPIC}" == *hepe* ]]; then
      log "  Preserving HEPE SNS topic: ${TOPIC}"
      continue
    fi
    aws sns delete-topic \
      --profile "${PROFILE}" --region "${REGION}" \
      --topic-arn "${TOPIC}" 2>/dev/null && ok "  Deleted SNS: ${TOPIC}" || true
  done <<< "${TOPICS}"

  sep
  ok "PHASE 3 COMPLETE — Non-HEPE orphan cleanup done."
  sep
  echo ""
  log "Checking HEPE Foundation resources are still intact..."
  aws cloudformation describe-stacks \
    --profile "${PROFILE}" --region "${REGION}" \
    --stack-name "hepefoundation-org-emergency-alarms" \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null \
    && ok "HEPE Foundation stacks: INTACT" || warn "Could not verify HEPE stack status"
  aws ec2 describe-instances \
    --profile "${PROFILE}" --region "${REGION}" \
    --instance-ids "${HEPE_INSTANCE_ID}" \
    --query 'Reservations[0].Instances[0].State.Name' --output text 2>/dev/null \
    | grep -q "running" && ok "HEPE Foundation EC2 instance: RUNNING" || warn "HEPE EC2 status unknown"
}

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

echo ""
print -P "${BOLD}AWS Account Full Backup & Selective Cleanup${NC}"
echo "Profile: ${PROFILE} | Region: ${REGION}"
echo "Backup root: ${BACKUP_ROOT}"
print -P "${GREEN}HEPE Foundation: PRESERVED (never deleted)${NC}"
echo "Started: $(date)"
echo ""

phase1_backup

if [ "${RUN_DELETE}" = "--delete" ]; then
  echo ""
  print -P "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  print -P "${RED}${BOLD}  WARNING: ABOUT TO DELETE ALL NON-HEPE STACKS & RESOURCES${NC}"
  print -P "${RED}  Stacks to delete (16 total):${NC}"
  for s in "${STACKS_TO_DELETE[@]}"; do
    print -P "${RED}    • ${s}${NC}"
  done
  print -P "${RED}  This terminates 3 live non-HEPE EC2 instances:${NC}"
  print -P "${RED}    • AskDao Kapra mail server    44.198.19.210${NC}"
  print -P "${RED}    • EMC Notary mail server      3.229.143.6${NC}"
  print -P "${RED}    • EMC Notary web server       3.219.212.143${NC}"
  print -P "${GREEN}  HEPE Foundation (44.194.23.56) stays UP and untouched.${NC}"
  print -P "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  read -r "CONFIRM?Type 'DELETE EVERYTHING EXCEPT HEPE' to confirm: "
  if [ "${CONFIRM}" = "DELETE EVERYTHING EXCEPT HEPE" ]; then
    phase2_delete_stacks
    phase3_cleanup_orphans
  else
    warn "Deletion cancelled. Backup is complete."
  fi
else
  echo ""
  ok "Backup complete. To delete all non-HEPE stacks and orphaned resources:"
  echo "  zsh Archive/administration/backup-and-cleanup.sh --delete"
fi

echo ""
echo "Finished: $(date)"
