#!/usr/bin/env zsh
# delete-resources.sh
#
# Modular, parallel deletion system for AWS account cleanup.
# Every data-bearing resource type has a dedicated pre-processing + delete utility.
# Stacks are only deleted after ALL their resources pass readiness checks.
# Orphaned resources outside stacks are deleted in parallel.
#
# HEPE Foundation resources are NEVER touched at any step.
#
# Usage:
#   zsh Archive/administration/delete-resources.sh            # dry-run (shows what would be deleted)
#   zsh Archive/administration/delete-resources.sh --delete   # live run, requires confirmation phrase
set -Eeuo pipefail

PROFILE="hepe-admin-mfa"
REGION="us-east-1"
BACKUP_ROOT="/Volumes/EvanMcCall/AWS-Backups"
RUN_DELETE="${1:-}"

# ── HEPE Foundation — never touch ────────────────────────────────────────────
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

# Stacks in deletion order: application stacks first, bootstrap last
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

# ── Terminal colors ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()   { print -P "${BLUE}[INFO]${NC}  $*"; }
ok()    { print -P "${GREEN}[OK]${NC}    $*"; }
warn()  { print -P "${YELLOW}[WARN]${NC}  $*"; }
err()   { print -P "${RED}[ERR]${NC}   $*"; }
dryrun(){ print -P "${CYAN}[DRY]${NC}   $*"; }
sep()   { print -P "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ── HEPE guard functions ──────────────────────────────────────────────────────

is_hepe_bucket() {
  local b="$1"
  for hb in "${HEPE_PRESERVE_BUCKETS[@]}"; do
    [ "${b}" = "${hb}" ] && return 0
  done
  return 1
}

is_hepe_stack() {
  local s="$1"
  for hs in "${HEPE_PRESERVE_STACKS[@]}"; do
    [ "${s}" = "${hs}" ] && return 0
  done
  [[ "${s}" == *hepefoundation* ]] && return 0
  return 1
}

is_hepe_resource() {
  local r="$1"
  [[ "${r}" == *hepefoundation* ]] || [[ "${r}" == *hepe* ]] || \
  [[ "${r}" == *"${HEPE_INSTANCE_ID}"* ]] || [[ "${r}" == *"${HEPE_EIP}"* ]]
}

# Abort the script if a HEPE resource is ever about to be touched
assert_not_hepe() {
  local resource="$1"
  local label="${2:-resource}"
  if is_hepe_resource "${resource}"; then
    err "SAFETY VIOLATION: ${label} '${resource}' matches HEPE Foundation guard — aborting"
    exit 99
  fi
}

# ── Backup existence checks ───────────────────────────────────────────────────

backup_exists_s3() {
  local bucket="$1"
  local dest
  dest=$(find "${BACKUP_ROOT}" -type d -name "${bucket}" -path "*/s3/*" 2>/dev/null | head -1)
  [ -n "${dest}" ]
}

backup_exists_dynamodb() {
  local table="$1"
  local file
  file=$(find "${BACKUP_ROOT}" -name "${table}.json" -path "*/dynamodb/*" 2>/dev/null | head -1)
  [ -f "${file}" ]
}

backup_exists_loggroup() {
  local lg="$1"
  local safe
  safe=$(echo "${lg}" | sed 's|/|_|g; s|^_||')
  local file
  file=$(find "${BACKUP_ROOT}" -name "${safe}.json" -path "*/logs/*" 2>/dev/null | head -1)
  [ -f "${file}" ]
}

loggroup_stored_bytes() {
  local lg="$1"
  aws logs describe-log-groups \
    --profile "${PROFILE}" --region "${REGION}" \
    --log-group-name-prefix "${lg}" \
    --query "logGroups[?logGroupName=='${lg}'].storedBytes | [0]" \
    --output text 2>/dev/null || echo "0"
}

# ─────────────────────────────────────────────────────────────────────────────
# RESOURCE DELETION UTILITIES
# Each function: pre-process → verify ready → delete
# All functions are HEPE-guarded and dry-run aware.
# ─────────────────────────────────────────────────────────────────────────────

# delete_s3_bucket BUCKET_NAME
# Pre-processing: remove versioned objects, delete markers, then rm recursive
delete_s3_bucket() {
  local bucket="$1"
  assert_not_hepe "${bucket}" "S3 bucket"
  if is_hepe_bucket "${bucket}"; then
    log "  [PRESERVE] S3: ${bucket} (HEPE)"
    return 0
  fi

  if ! backup_exists_s3 "${bucket}"; then
    warn "  [SKIP] S3: ${bucket} — no backup found in ${BACKUP_ROOT}"
    return 1
  fi

  if [ "${RUN_DELETE}" != "--delete" ]; then
    dryrun "Would delete S3 bucket: ${bucket}"
    return 0
  fi

  log "  [S3] Pre-processing: ${bucket}"

  # Empty bucket: combines Versions + DeleteMarkers in one batch per iteration
  # so nothing is missed regardless of ordering or pagination
  local batch_count=0 cnt batch
  local attempts=0
  while true; do
    attempts=$((attempts + 1))
    [ ${attempts} -gt 100 ] && { warn "  [S3] Gave up emptying ${bucket} after 100 iterations"; break; }
    batch=$(aws s3api list-object-versions \
      --profile "${PROFILE}" --bucket "${bucket}" \
      --output json 2>/dev/null | \
      jq '{Objects:[(.Versions//[],.DeleteMarkers//[])|.[]|{Key:.Key,VersionId:.VersionId}]|.[0:1000],Quiet:true}')
    cnt=$(echo "${batch}" | jq '.Objects | length')
    [ "${cnt}" -eq 0 ] && break
    aws s3api delete-objects \
      --profile "${PROFILE}" --bucket "${bucket}" \
      --delete "${batch}" 2>/dev/null || true
    batch_count=$((batch_count + cnt))
  done

  # Final sweep for any non-versioned current objects
  aws s3 rm "s3://${bucket}" --recursive --profile "${PROFILE}" 2>/dev/null || true

  # Remove bucket policy (CloudTrail and other service policies block deletion)
  aws s3api delete-bucket-policy \
    --profile "${PROFILE}" --bucket "${bucket}" 2>/dev/null || true

  # Delete the bucket
  if aws s3api delete-bucket \
      --profile "${PROFILE}" --bucket "${bucket}" 2>/dev/null; then
    ok "  [DELETED] S3: ${bucket} (${batch_count} versioned objects removed)"
  else
    warn "  [FAILED]  S3: ${bucket} — could not delete; check console"
    return 1
  fi
}

# delete_dynamodb_table TABLE_NAME
# Pre-processing: verify backup exists, wait for ACTIVE status
delete_dynamodb_table() {
  local table="$1"
  assert_not_hepe "${table}" "DynamoDB table"

  if ! backup_exists_dynamodb "${table}"; then
    warn "  [SKIP] DynamoDB: ${table} — no backup found in ${BACKUP_ROOT}"
    return 1
  fi

  if [ "${RUN_DELETE}" != "--delete" ]; then
    dryrun "Would delete DynamoDB table: ${table}"
    return 0
  fi

  # Ensure table is in ACTIVE state before deleting
  local tstate
  tstate=$(aws dynamodb describe-table \
    --profile "${PROFILE}" --region "${REGION}" \
    --table-name "${table}" \
    --query 'Table.TableStatus' --output text 2>/dev/null || echo "NOTFOUND")

  if [ "${tstate}" = "NOTFOUND" ]; then
    warn "  [SKIP] DynamoDB: ${table} — not found"
    return 0
  fi

  if [ "${tstate}" != "ACTIVE" ]; then
    log "  Waiting for DynamoDB table ACTIVE: ${table} (current: ${tstate})"
    aws dynamodb wait table-exists \
      --profile "${PROFILE}" --region "${REGION}" \
      --table-name "${table}" 2>/dev/null || true
  fi

  if aws dynamodb delete-table \
      --profile "${PROFILE}" --region "${REGION}" \
      --table-name "${table}" 2>/dev/null; then
    ok "  [DELETED] DynamoDB: ${table}"
  else
    warn "  [FAILED]  DynamoDB: ${table}"
    return 1
  fi
}

# delete_log_group LOG_GROUP_NAME
# Pre-processing: if group has stored bytes, verify backup exists
delete_log_group() {
  local lg="$1"
  assert_not_hepe "${lg}" "CloudWatch log group"
  if is_hepe_resource "${lg}"; then
    log "  [PRESERVE] LogGroup: ${lg} (HEPE)"
    return 0
  fi

  local stored_bytes
  stored_bytes=$(loggroup_stored_bytes "${lg}")

  if [ "${stored_bytes}" != "None" ] && [ "${stored_bytes:-0}" -gt 0 ] 2>/dev/null; then
    if ! backup_exists_loggroup "${lg}"; then
      warn "  [SKIP] LogGroup: ${lg} — ${stored_bytes} bytes stored, no backup found"
      return 1
    fi
  fi

  if [ "${RUN_DELETE}" != "--delete" ]; then
    dryrun "Would delete log group: ${lg}"
    return 0
  fi

  if aws logs delete-log-group \
      --profile "${PROFILE}" --region "${REGION}" \
      --log-group-name "${lg}" 2>/dev/null; then
    ok "  [DELETED] LogGroup: ${lg}"
  else
    warn "  [FAILED]  LogGroup: ${lg}"
    return 1
  fi
}

# delete_cloudwatch_alarm ALARM_NAME
delete_cloudwatch_alarm() {
  local alarm="$1"
  assert_not_hepe "${alarm}" "CloudWatch alarm"
  if is_hepe_resource "${alarm}"; then
    log "  [PRESERVE] Alarm: ${alarm} (HEPE)"
    return 0
  fi

  if [ "${RUN_DELETE}" != "--delete" ]; then
    dryrun "Would delete alarm: ${alarm}"
    return 0
  fi

  if aws cloudwatch delete-alarms \
      --profile "${PROFILE}" --region "${REGION}" \
      --alarm-names "${alarm}" 2>/dev/null; then
    ok "  [DELETED] Alarm: ${alarm}"
  else
    warn "  [FAILED]  Alarm: ${alarm}"
    return 1
  fi
}

# delete_sns_topic TOPIC_ARN
delete_sns_topic() {
  local arn="$1"
  assert_not_hepe "${arn}" "SNS topic"
  if is_hepe_resource "${arn}"; then
    log "  [PRESERVE] SNS: ${arn} (HEPE)"
    return 0
  fi

  if [ "${RUN_DELETE}" != "--delete" ]; then
    dryrun "Would delete SNS topic: ${arn}"
    return 0
  fi

  if aws sns delete-topic \
      --profile "${PROFILE}" --region "${REGION}" \
      --topic-arn "${arn}" 2>/dev/null; then
    ok "  [DELETED] SNS: ${arn##*:}"
  else
    warn "  [FAILED]  SNS: ${arn##*:}"
    return 1
  fi
}

# delete_eip ALLOCATION_ID PUBLIC_IP
# Pre-processing: disassociate if still associated; never touch HEPE EIP
delete_eip() {
  local alloc_id="$1"
  local public_ip="$2"

  if [ "${public_ip}" = "${HEPE_EIP}" ]; then
    log "  [PRESERVE] EIP: ${public_ip} (HEPE)"
    return 0
  fi
  assert_not_hepe "${public_ip}" "Elastic IP"

  if [ "${RUN_DELETE}" != "--delete" ]; then
    dryrun "Would release EIP: ${public_ip} (${alloc_id})"
    return 0
  fi

  # Disassociate if still associated
  local assoc_id
  assoc_id=$(aws ec2 describe-addresses \
    --profile "${PROFILE}" --region "${REGION}" \
    --allocation-ids "${alloc_id}" \
    --query 'Addresses[0].AssociationId' --output text 2>/dev/null || echo "None")

  if [ "${assoc_id}" != "None" ] && [ -n "${assoc_id}" ]; then
    log "  Disassociating EIP: ${public_ip}"
    aws ec2 disassociate-address \
      --profile "${PROFILE}" --region "${REGION}" \
      --association-id "${assoc_id}" 2>/dev/null || true
    sleep 2
  fi

  if aws ec2 release-address \
      --profile "${PROFILE}" --region "${REGION}" \
      --allocation-id "${alloc_id}" 2>/dev/null; then
    ok "  [RELEASED] EIP: ${public_ip}"
  else
    warn "  [FAILED]   EIP: ${public_ip}"
    return 1
  fi
}

# delete_ebs_volume VOLUME_ID
# Pre-processing: skip if still attached; delete if available
delete_ebs_volume() {
  local vol_id="$1"

  local vol_state
  vol_state=$(aws ec2 describe-volumes \
    --profile "${PROFILE}" --region "${REGION}" \
    --volume-ids "${vol_id}" \
    --query 'Volumes[0].State' --output text 2>/dev/null || echo "not-found")

  case "${vol_state}" in
    not-found)
      warn "  [SKIP] EBS: ${vol_id} — not found"
      return 0
      ;;
    in-use)
      warn "  [SKIP] EBS: ${vol_id} — still attached, not deleting"
      return 1
      ;;
    available)
      ;;
    *)
      warn "  [SKIP] EBS: ${vol_id} — unexpected state: ${vol_state}"
      return 1
      ;;
  esac

  # Check if this volume is attached to HEPE instance
  local attached_to
  attached_to=$(aws ec2 describe-volumes \
    --profile "${PROFILE}" --region "${REGION}" \
    --volume-ids "${vol_id}" \
    --query 'Volumes[0].Attachments[0].InstanceId' --output text 2>/dev/null || echo "None")
  if [ "${attached_to}" = "${HEPE_INSTANCE_ID}" ]; then
    log "  [PRESERVE] EBS: ${vol_id} (attached to HEPE instance)"
    return 0
  fi

  if [ "${RUN_DELETE}" != "--delete" ]; then
    dryrun "Would delete EBS volume: ${vol_id}"
    return 0
  fi

  if aws ec2 delete-volume \
      --profile "${PROFILE}" --region "${REGION}" \
      --volume-id "${vol_id}" 2>/dev/null; then
    ok "  [DELETED] EBS: ${vol_id}"
  else
    warn "  [FAILED]  EBS: ${vol_id}"
    return 1
  fi
}

# delete_security_group GROUP_ID GROUP_NAME
# Pre-processing: revoke all inbound/outbound rules to remove cross-sg dependencies
delete_security_group() {
  local sg_id="$1"
  local sg_name="${2:-${sg_id}}"
  assert_not_hepe "${sg_name}" "security group"

  if [ "${sg_name}" = "default" ]; then
    log "  [SKIP] SG: ${sg_name} — default security group, cannot delete"
    return 0
  fi

  if [ "${RUN_DELETE}" != "--delete" ]; then
    dryrun "Would delete security group: ${sg_name} (${sg_id})"
    return 0
  fi

  # Revoke inbound rules
  local ingress_rules
  ingress_rules=$(aws ec2 describe-security-groups \
    --profile "${PROFILE}" --region "${REGION}" \
    --group-ids "${sg_id}" \
    --query 'SecurityGroups[0].IpPermissions' --output json 2>/dev/null || echo "[]")
  if [ "$(echo "${ingress_rules}" | jq 'length')" -gt 0 ]; then
    aws ec2 revoke-security-group-ingress \
      --profile "${PROFILE}" --region "${REGION}" \
      --group-id "${sg_id}" \
      --ip-permissions "${ingress_rules}" 2>/dev/null || true
  fi

  # Revoke outbound rules
  local egress_rules
  egress_rules=$(aws ec2 describe-security-groups \
    --profile "${PROFILE}" --region "${REGION}" \
    --group-ids "${sg_id}" \
    --query 'SecurityGroups[0].IpPermissionsEgress' --output json 2>/dev/null || echo "[]")
  if [ "$(echo "${egress_rules}" | jq 'length')" -gt 0 ]; then
    aws ec2 revoke-security-group-egress \
      --profile "${PROFILE}" --region "${REGION}" \
      --group-id "${sg_id}" \
      --ip-permissions "${egress_rules}" 2>/dev/null || true
  fi

  if aws ec2 delete-security-group \
      --profile "${PROFILE}" --region "${REGION}" \
      --group-id "${sg_id}" 2>/dev/null; then
    ok "  [DELETED] SG: ${sg_name}"
  else
    warn "  [FAILED]  SG: ${sg_name} — may still have dependencies"
    return 1
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# STACK UTILITIES
# ─────────────────────────────────────────────────────────────────────────────

# stack_ready_to_delete STACK_NAME
# Returns 0 if all data-bearing resources have confirmed backups, 1 otherwise
stack_ready_to_delete() {
  local stack="$1"
  local ready=0

  local resources
  resources=$(aws cloudformation list-stack-resources \
    --profile "${PROFILE}" --region "${REGION}" \
    --stack-name "${stack}" \
    --query 'StackResourceSummaries[*].{Type:ResourceType,Id:PhysicalResourceId,Status:ResourceStatus}' \
    --output json 2>/dev/null || echo "[]")

  local count
  count=$(echo "${resources}" | jq 'length')

  if [ "${count}" -eq 0 ]; then
    warn "  No resources found for ${stack}"
    return 0
  fi

  local rtype rid rstatus sb
  while IFS= read -r resource_json; do
    rtype=$(echo "${resource_json}" | jq -r '.Type')
    rid=$(echo "${resource_json}" | jq -r '.Id')
    rstatus=$(echo "${resource_json}" | jq -r '.Status')

    # Skip deleted/non-existent resources
    [[ "${rstatus}" == *DELETE* ]] && continue
    [ "${rid}" = "null" ] || [ -z "${rid}" ] && continue

    case "${rtype}" in
      "AWS::S3::Bucket")
        if is_hepe_bucket "${rid}"; then continue; fi
        if ! backup_exists_s3 "${rid}"; then
          warn "    [NOT READY] ${stack} → S3 bucket '${rid}' has no backup"
          ready=1
        else
          log "    [READY]     ${stack} → S3 bucket '${rid}'"
        fi
        ;;
      "AWS::DynamoDB::Table")
        if ! backup_exists_dynamodb "${rid}"; then
          warn "    [NOT READY] ${stack} → DynamoDB table '${rid}' has no backup"
          ready=1
        else
          log "    [READY]     ${stack} → DynamoDB table '${rid}'"
        fi
        ;;
      "AWS::Logs::LogGroup")
        if is_hepe_resource "${rid}"; then continue; fi
        sb=$(loggroup_stored_bytes "${rid}")
        if [ "${sb}" != "None" ] && [ "${sb:-0}" -gt 0 ] 2>/dev/null; then
          if ! backup_exists_loggroup "${rid}"; then
            warn "    [NOT READY] ${stack} → LogGroup '${rid}' (${sb} bytes, no backup)"
            ready=1
          else
            log "    [READY]     ${stack} → LogGroup '${rid}'"
          fi
        fi
        ;;
      "AWS::EC2::Instance")
        # EC2 instances: confirm not HEPE
        if [ "${rid}" = "${HEPE_INSTANCE_ID}" ]; then
          err "SAFETY VIOLATION: Stack ${stack} references HEPE EC2 instance — skipping stack"
          return 2
        fi
        log "    [OK]        ${stack} → EC2 instance '${rid}' (no data backup required)"
        ;;
    esac
  done < <(echo "${resources}" | jq -c '.[]')

  return ${ready}
}

# delete_stack_with_verify STACK_NAME
# Checks readiness, then initiates deletion and waits
delete_stack_with_verify() {
  local stack="$1"

  if is_hepe_stack "${stack}"; then
    log "[PRESERVE] Stack: ${stack} (HEPE)"
    return 0
  fi

  local stack_status
  stack_status=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" --region "${REGION}" \
    --stack-name "${stack}" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "DOES_NOT_EXIST")

  if [ "${stack_status}" = "DOES_NOT_EXIST" ] || [ "${stack_status}" = "None" ]; then
    ok "[SKIP]     Stack: ${stack} (already deleted)"
    return 0
  fi

  if [ "${stack_status}" = "DELETE_IN_PROGRESS" ]; then
    log "[WAITING]  Stack: ${stack} — deletion already in progress"
    aws cloudformation wait stack-delete-complete \
      --profile "${PROFILE}" --region "${REGION}" \
      --stack-name "${stack}" 2>/dev/null \
      && ok "[DELETED]  Stack: ${stack}" \
      || warn "[TIMEOUT]  Stack: ${stack} — check console"
    return 0
  fi

  sep
  log "Checking readiness: ${stack} (status: ${stack_status})"

  local readiness_result
  stack_ready_to_delete "${stack}"
  readiness_result=$?

  if [ "${readiness_result}" -eq 2 ]; then
    err "[BLOCKED]  Stack: ${stack} — HEPE resource detected inside stack; skipping"
    return 1
  fi

  if [ "${readiness_result}" -ne 0 ]; then
    warn "[BLOCKED]  Stack: ${stack} — one or more resources lack backups; not deleting"
    return 1
  fi

  ok "[READY]    Stack: ${stack} — all data-bearing resources have backups"

  if [ "${RUN_DELETE}" != "--delete" ]; then
    dryrun "Would delete stack: ${stack}"
    return 0
  fi

  log "[DELETING] Stack: ${stack}"
  if ! aws cloudformation delete-stack \
      --profile "${PROFILE}" --region "${REGION}" \
      --stack-name "${stack}" 2>&1; then
    warn "[FAILED]   Stack: ${stack} — delete-stack call failed"
    return 1
  fi

  log "[WAITING]  Stack: ${stack}"
  aws cloudformation wait stack-delete-complete \
    --profile "${PROFILE}" --region "${REGION}" \
    --stack-name "${stack}" 2>/dev/null \
    && ok "[DELETED]  Stack: ${stack}" \
    || warn "[TIMEOUT]  Stack: ${stack} — check console for stuck resources"
}

# ─────────────────────────────────────────────────────────────────────────────
# PARALLEL ORCHESTRATORS
# ─────────────────────────────────────────────────────────────────────────────

# delete_stacks_parallel
# Deletes all non-HEPE stacks in two waves:
#   Wave 1 (parallel): all stacks except CDKToolkit
#   Wave 2 (serial):   CDKToolkit (must be last — bootstrap stack)
delete_stacks_parallel() {
  sep
  print -P "${BOLD}STACK DELETION — Readiness-checked, parallel${NC}"
  sep

  typeset -a WAVE1_STACKS=()
  typeset -a WAVE1_PIDS=()
  local LOG_DIR
  LOG_DIR=$(mktemp -d)

  for STACK in "${STACKS_TO_DELETE[@]}"; do
    [ "${STACK}" = "CDKToolkit" ] && continue
    WAVE1_STACKS+=("${STACK}")
  done

  log "Wave 1: launching ${#WAVE1_STACKS[@]} stack deletions in parallel"
  for STACK in "${WAVE1_STACKS[@]}"; do
    (
      delete_stack_with_verify "${STACK}" 2>&1
    ) > "${LOG_DIR}/${STACK}.log" 2>&1 &
    WAVE1_PIDS+=($!)
    log "  Launched: ${STACK} (pid $!)"
  done

  local wave1_fail=0 pid sname
  for (( i=1; i<=${#WAVE1_PIDS[@]}; i++ )); do
    pid="${WAVE1_PIDS[$i]}"
    sname="${WAVE1_STACKS[$i]}"
    if wait "${pid}"; then
      ok "  Completed: ${sname}"
    else
      warn "  Failed:    ${sname}"
      wave1_fail=1
    fi
    # Print log output
    cat "${LOG_DIR}/${sname}.log" 2>/dev/null || true
  done

  rm -rf "${LOG_DIR}"

  if [ ${wave1_fail} -ne 0 ]; then
    warn "Some Wave 1 stack deletions failed — check output above"
  fi

  # Wave 2: CDKToolkit (bootstrap — must be last)
  sep
  log "Wave 2: CDKToolkit (bootstrap stack — last)"
  delete_stack_with_verify "CDKToolkit"
}

# delete_orphans_parallel
# Deletes orphaned non-HEPE resources (not in any CloudFormation stack) in parallel
delete_orphans_parallel() {
  sep
  print -P "${BOLD}ORPHAN CLEANUP — Parallel deletion${NC}"
  sep

  typeset -a ORPHAN_PIDS=()
  typeset -a ORPHAN_NAMES=()
  local LOG_DIR label
  local eip_id eip_ip
  LOG_DIR=$(mktemp -d)

  # ── S3 buckets ────────────────────────────────────────────────────────────
  local ALL_BUCKETS
  ALL_BUCKETS=$(aws s3api list-buckets \
    --profile "${PROFILE}" \
    --query 'Buckets[*].Name' --output json 2>/dev/null | jq -r '.[]' || echo "")

  while IFS= read -r BUCKET; do
    [ -z "${BUCKET}" ] && continue
    is_hepe_bucket "${BUCKET}" && continue
    label="s3:${BUCKET}"
    (
      delete_s3_bucket "${BUCKET}" 2>&1
    ) > "${LOG_DIR}/${label//\//_}.log" 2>&1 &
    ORPHAN_PIDS+=($!)
    ORPHAN_NAMES+=("${label}")
    log "  Launched: ${label} (pid $!)"
  done <<< "${ALL_BUCKETS}"

  # ── DynamoDB tables ───────────────────────────────────────────────────────
  local ALL_TABLES
  ALL_TABLES=$(aws dynamodb list-tables \
    --profile "${PROFILE}" --region "${REGION}" \
    --query 'TableNames' --output json 2>/dev/null | jq -r '.[]' || echo "")

  while IFS= read -r TABLE; do
    [ -z "${TABLE}" ] && continue
    is_hepe_resource "${TABLE}" && continue
    label="dynamodb:${TABLE}"
    (
      delete_dynamodb_table "${TABLE}" 2>&1
    ) > "${LOG_DIR}/${label//\//_}.log" 2>&1 &
    ORPHAN_PIDS+=($!)
    ORPHAN_NAMES+=("${label}")
    log "  Launched: ${label} (pid $!)"
  done <<< "${ALL_TABLES}"

  # ── CloudWatch log groups ─────────────────────────────────────────────────
  local ALL_LGS
  ALL_LGS=$(aws logs describe-log-groups \
    --profile "${PROFILE}" --region "${REGION}" \
    --query 'logGroups[*].logGroupName' --output json 2>/dev/null | jq -r '.[]' || echo "")

  while IFS= read -r LG; do
    [ -z "${LG}" ] && continue
    is_hepe_resource "${LG}" && continue
    label="logs:${LG}"
    (
      delete_log_group "${LG}" 2>&1
    ) > "${LOG_DIR}/${label//\//_}.log" 2>&1 &
    ORPHAN_PIDS+=($!)
    ORPHAN_NAMES+=("${label}")
    log "  Launched: ${label} (pid $!)"
  done <<< "${ALL_LGS}"

  # ── CloudWatch alarms ─────────────────────────────────────────────────────
  local ALL_ALARMS
  ALL_ALARMS=$(aws cloudwatch describe-alarms \
    --profile "${PROFILE}" --region "${REGION}" \
    --query 'MetricAlarms[*].AlarmName' --output json 2>/dev/null | jq -r '.[]' || echo "")

  while IFS= read -r ALARM; do
    [ -z "${ALARM}" ] && continue
    is_hepe_resource "${ALARM}" && continue
    label="alarm:${ALARM}"
    (
      delete_cloudwatch_alarm "${ALARM}" 2>&1
    ) > "${LOG_DIR}/${label//\//_}.log" 2>&1 &
    ORPHAN_PIDS+=($!)
    ORPHAN_NAMES+=("${label}")
  done <<< "${ALL_ALARMS}"

  # ── SNS topics ────────────────────────────────────────────────────────────
  local ALL_TOPICS
  ALL_TOPICS=$(aws sns list-topics \
    --profile "${PROFILE}" --region "${REGION}" \
    --query 'Topics[*].TopicArn' --output json 2>/dev/null | jq -r '.[]' || echo "")

  while IFS= read -r TOPIC; do
    [ -z "${TOPIC}" ] && continue
    is_hepe_resource "${TOPIC}" && continue
    label="sns:${TOPIC##*:}"
    (
      delete_sns_topic "${TOPIC}" 2>&1
    ) > "${LOG_DIR}/${label//\//_}.log" 2>&1 &
    ORPHAN_PIDS+=($!)
    ORPHAN_NAMES+=("${label}")
  done <<< "${ALL_TOPICS}"

  # ── Elastic IPs ───────────────────────────────────────────────────────────
  local ALL_EIPS
  ALL_EIPS=$(aws ec2 describe-addresses \
    --profile "${PROFILE}" --region "${REGION}" \
    --query 'Addresses[*].{Id:AllocationId,IP:PublicIp}' \
    --output json 2>/dev/null | jq -r '.[] | "\(.Id) \(.IP)"' || echo "")

  while IFS= read -r LINE; do
    [ -z "${LINE}" ] && continue
    eip_id=$(echo "${LINE}" | awk '{print $1}')
    eip_ip=$(echo "${LINE}" | awk '{print $2}')
    [ "${eip_ip}" = "${HEPE_EIP}" ] && continue
    label="eip:${eip_ip}"
    (
      delete_eip "${eip_id}" "${eip_ip}" 2>&1
    ) > "${LOG_DIR}/${label//\//_}.log" 2>&1 &
    ORPHAN_PIDS+=($!)
    ORPHAN_NAMES+=("${label}")
  done <<< "${ALL_EIPS}"

  # ── EBS volumes (available/unattached) ────────────────────────────────────
  local ALL_VOLS
  ALL_VOLS=$(aws ec2 describe-volumes \
    --profile "${PROFILE}" --region "${REGION}" \
    --filters Name=status,Values=available \
    --query 'Volumes[*].VolumeId' --output json 2>/dev/null | jq -r '.[]' || echo "")

  while IFS= read -r VOL; do
    [ -z "${VOL}" ] && continue
    label="ebs:${VOL}"
    (
      delete_ebs_volume "${VOL}" 2>&1
    ) > "${LOG_DIR}/${label//\//_}.log" 2>&1 &
    ORPHAN_PIDS+=($!)
    ORPHAN_NAMES+=("${label}")
  done <<< "${ALL_VOLS}"

  # ── Wait for all parallel jobs ────────────────────────────────────────────
  log ""
  log "Waiting for ${#ORPHAN_PIDS[@]} parallel deletion jobs..."
  local fail_count=0 pid name
  for (( i=1; i<=${#ORPHAN_PIDS[@]}; i++ )); do
    pid="${ORPHAN_PIDS[$i]}"
    name="${ORPHAN_NAMES[$i]}"
    if wait "${pid}"; then
      ok "  Completed: ${name}"
    else
      warn "  Failed:    ${name}"
      fail_count=$((fail_count + 1))
    fi
    cat "${LOG_DIR}/${name//\//_}.log" 2>/dev/null || true
  done

  rm -rf "${LOG_DIR}"

  if [ ${fail_count} -gt 0 ]; then
    warn "${fail_count} orphan deletion job(s) failed — check output above"
  else
    ok "All orphan deletions completed successfully"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# POST-DELETION HEPE INTEGRITY CHECK
# ─────────────────────────────────────────────────────────────────────────────

verify_hepe_intact() {
  sep
  print -P "${BOLD}HEPE FOUNDATION INTEGRITY VERIFICATION${NC}"

  local all_ok=0 sstate

  for STACK in "${HEPE_PRESERVE_STACKS[@]}"; do
    sstate=$(aws cloudformation describe-stacks \
      --profile "${PROFILE}" --region "${REGION}" \
      --stack-name "${STACK}" \
      --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "MISSING")
    if [[ "${sstate}" == *COMPLETE* ]]; then
      ok "  Stack: ${STACK} → ${sstate}"
    else
      err "  Stack: ${STACK} → ${sstate} ← PROBLEM"
      all_ok=1
    fi
  done

  local ec2_state
  ec2_state=$(aws ec2 describe-instances \
    --profile "${PROFILE}" --region "${REGION}" \
    --instance-ids "${HEPE_INSTANCE_ID}" \
    --query 'Reservations[0].Instances[0].State.Name' --output text 2>/dev/null || echo "unknown")
  if [ "${ec2_state}" = "running" ]; then
    ok "  EC2: ${HEPE_INSTANCE_ID} → running"
  else
    err "  EC2: ${HEPE_INSTANCE_ID} → ${ec2_state} ← PROBLEM"
    all_ok=1
  fi

  local eip_alloc
  eip_alloc=$(aws ec2 describe-addresses \
    --profile "${PROFILE}" --region "${REGION}" \
    --filters "Name=public-ip,Values=${HEPE_EIP}" \
    --query 'Addresses[0].AssociationId' --output text 2>/dev/null || echo "None")
  if [ "${eip_alloc}" != "None" ] && [ -n "${eip_alloc}" ]; then
    ok "  EIP: ${HEPE_EIP} → still allocated and associated"
  else
    warn "  EIP: ${HEPE_EIP} → may be unassociated (verify manually)"
  fi

  for BUCKET in "${HEPE_PRESERVE_BUCKETS[@]}"; do
    local bexists
    bexists=$(aws s3api head-bucket \
      --profile "${PROFILE}" \
      --bucket "${BUCKET}" 2>&1 && echo "exists" || echo "missing")
    if [ "${bexists}" = "exists" ]; then
      ok "  S3: ${BUCKET} → exists"
    else
      err "  S3: ${BUCKET} → MISSING ← PROBLEM"
      all_ok=1
    fi
  done

  if [ ${all_ok} -eq 0 ]; then
    sep
    ok "HEPE Foundation: ALL RESOURCES INTACT"
  else
    sep
    err "HEPE Foundation: SOME RESOURCES MAY HAVE ISSUES — INVESTIGATE IMMEDIATELY"
  fi
  sep
  return ${all_ok}
}

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

echo ""
print -P "${BOLD}AWS Account Resource Deletion — Parallel + Pre-validated${NC}"
echo "Profile: ${PROFILE} | Region: ${REGION}"
echo "Backup root: ${BACKUP_ROOT}"
print -P "${GREEN}HEPE Foundation: PRESERVED — never deleted at any step${NC}"
echo "Started: $(date)"
echo ""

if [ "${RUN_DELETE}" != "--delete" ]; then
  print -P "${CYAN}${BOLD}DRY-RUN MODE — No changes will be made${NC}"
  print -P "${CYAN}Add --delete and confirm phrase to execute${NC}"
  echo ""
  sep
  log "DRY RUN: Stack readiness checks..."
  local stack_status
  for STACK in "${STACKS_TO_DELETE[@]}"; do
    stack_status=$(aws cloudformation describe-stacks \
      --profile "${PROFILE}" --region "${REGION}" \
      --stack-name "${STACK}" \
      --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "DOES_NOT_EXIST")
    if [ "${stack_status}" = "DOES_NOT_EXIST" ]; then
      ok "[ALREADY GONE] ${STACK}"
    else
      log "[CHECK] ${STACK} (${stack_status})"
      stack_ready_to_delete "${STACK}" && ok "[READY] ${STACK}" || warn "[NOT READY] ${STACK}"
    fi
  done

  sep
  log "DRY RUN: Orphan resources that would be deleted..."
  delete_orphans_parallel
  sep
  ok "Dry-run complete. To execute:"
  echo "  zsh Archive/administration/delete-resources.sh --delete"
  echo ""
  exit 0
fi

# ── Live delete confirmation ──────────────────────────────────────────────────
echo ""
print -P "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
print -P "${RED}${BOLD}  DESTRUCTIVE: DELETE ALL NON-HEPE STACKS & RESOURCES${NC}"
print -P "${RED}  16 stacks, all orphaned S3/DynamoDB/logs/alarms/SNS/EIPs${NC}"
print -P "${RED}  EC2 instances terminated via stack deletion:${NC}"
print -P "${RED}    • AskDao Kapra mail server${NC}"
print -P "${RED}    • EMC Notary mail server${NC}"
print -P "${RED}    • EMC Notary web server${NC}"
print -P "${GREEN}  HEPE Foundation (44.194.23.56) stays UP — never touched.${NC}"
print -P "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
read -r "CONFIRM?Type 'DELETE EVERYTHING EXCEPT HEPE' to confirm: "
if [ "${CONFIRM}" != "DELETE EVERYTHING EXCEPT HEPE" ]; then
  warn "Confirmation phrase incorrect. Aborting."
  exit 1
fi

# Execute deletion
delete_stacks_parallel
delete_orphans_parallel
verify_hepe_intact

echo ""
ok "DELETION COMPLETE"
echo "Finished: $(date)"
