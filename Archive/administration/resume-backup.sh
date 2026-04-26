#!/usr/bin/env zsh
# resume-backup.sh
# Resumes the backup from where it stopped.
# Skips: CF templates, Lambda code, SSM params, Secrets Manager, Route53 (all done)
# Does:  Fix misplaced buckets, sync remaining 32 S3 buckets, DynamoDB export, CW logs
set -Eeuo pipefail

PROFILE="hepe-admin-mfa"
REGION="us-east-1"
BACKUP_ROOT="/Volumes/EvanMcCall/AWS-Backups"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log()  { print -P "${BLUE}[INFO]${NC} $*"; }
ok()   { print -P "${GREEN}[OK]${NC}   $*"; }
warn() { print -P "${YELLOW}[WARN]${NC} $*"; }
sep()  { print -P "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# S3 buckets already synced — skip these
ALREADY_DONE_S3=(
  "ask-dao"
  "ask-dao-kapra-addressables"
  "ask-dao-testimonial-photos"
  "askdao-router-artifacts-413988044972-us-east-1"
  "askdaokapra-backend-artifacts"
  "askdaokapra-backend-keyexchange-artifacts"
  "askdaokapra-opensource-mailserver-backup"
  "askdaokapra-opensource-mailserver-nextcloud"
  "askdaokapra-registeraffiliate"
  "askdaokapra.com-backup"
  "askdaokapra.com-nextcloud"
  "aws-cloudtrail-logs-413988044972-47c0a1f5"
  "aws-log-archive-413988044972-us-east-1"
  "bedrock-cline-setup-trail-logs-413988044972"
  "billing-reports-tab"
  "cdk-hnb659fds-assets-413988044972-us-east-1"
  "cf-templates-1llszl4kz6348-us-east-1"
  "dao-kapra-books"
  "emcnotary-divorcedesk-artifacts-staging"
  "emcnotary-google-profile-state-staging"
  "emcnotary.com-backup"
  "emcnotary.com-nextcloud"
  "emcnotarycore-staging-assetsbucket5cb76180-dwzfmryvhcns"
  "generative-art-adk"
  "hepefoundation-aws-opensource-mailserver-backup"
  "hepefoundation-aws-opensource-mailserver-nextcloud"
  "hepefoundation.org-backup"
  "hepefoundation.org-nextcloud"
  "mantisinsights"
  "mind-and-mobility"
  "quellivcore-dev-assetsbucket5cb76180-eaxk5l0j8h6h"
  "sanando-juntos-transcriptions"
  "serverless-framework-deployments-us-east-1-ab95aa2b-e8db"
  "td-tradingbot-backup"
  "transcribe-files-hepe"
  "transcribe-files-roberto"
  "translate-console-us-east-1-5f3690d1-aed2-4a8a-b13a-b0c1ac581e1"
  "translations-data"
  "trinitycomprehensivehealthcare.com-website"
  "trinitycomprehensivehealthcare.com-website-logs"
  "visomarketinggroup.com-website"
  "visomarketinggroup.com-website-logs"
)

s3_done() {
  local b="$1"
  for done in "${ALREADY_DONE_S3[@]}"; do
    [ "${b}" = "${done}" ] && return 0
  done
  return 1
}

bucket_category() {
  case "$1" in
    ask-dao|ask-dao-*|askdao-*|askdaokapra-*|askdaokapra.*|\
    dao-kapra-*|www.askdaokapra.*)
      echo "askdao" ;;
    emcnotary-*|emcnotarycore-*|"emcnotary.com-"*)
      echo "emcnotary" ;;
    hepefoundation-*|"hepefoundation.org-"*|transcribe-files-hepe)
      echo "hepefoundation" ;;
    visomarketinggroup*)
      echo "visomarketinggroup" ;;
    trinitycomprehensivehealthcare*)
      echo "trinitycomprehensivehealthcare" ;;
    cdk-*|cf-templates-*|serverless-framework-*)
      echo "infrastructure" ;;
    aws-cloudtrail-*|aws-log-archive-*|bedrock-cline-*|billing-reports-tab)
      echo "logging" ;;
    *)
      echo "uncategorized" ;;
  esac
}

table_category() {
  case "$1" in
    AppVersions|AskDao*|askdao-*) echo "askdao" ;;
    EmcNotary*|emcnotary-*)       echo "emcnotary" ;;
    *)                             echo "uncategorized" ;;
  esac
}

# ── Fix misplaced buckets ─────────────────────────────────────────────────────
sep
log "Fixing misplaced bucket folders..."

if [ -d "${BACKUP_ROOT}/uncategorized/s3/askdaokapra.com-backup" ]; then
  mkdir -p "${BACKUP_ROOT}/askdao/s3"
  mv "${BACKUP_ROOT}/uncategorized/s3/askdaokapra.com-backup" "${BACKUP_ROOT}/askdao/s3/"
  ok "Moved askdaokapra.com-backup → askdao/s3/"
fi
if [ -d "${BACKUP_ROOT}/uncategorized/s3/askdaokapra.com-nextcloud" ]; then
  mkdir -p "${BACKUP_ROOT}/askdao/s3"
  mv "${BACKUP_ROOT}/uncategorized/s3/askdaokapra.com-nextcloud" "${BACKUP_ROOT}/askdao/s3/"
  ok "Moved askdaokapra.com-nextcloud → askdao/s3/"
fi

# ── Resume S3 sync ────────────────────────────────────────────────────────────
sep
log "Resuming S3 bucket sync (skipping already-done buckets)..."

ALL_BUCKETS=$(aws s3api list-buckets --profile "${PROFILE}" \
  --query 'Buckets[*].Name' --output json | jq -r '.[]')

S3_TOTAL=0
S3_SKIPPED=0
S3_SYNCED=0

while IFS= read -r BUCKET; do
  [ -z "${BUCKET}" ] && continue
  S3_TOTAL=$((S3_TOTAL + 1))
  if s3_done "${BUCKET}"; then
    log "  [SKIP - already done] ${BUCKET}"
    S3_SKIPPED=$((S3_SKIPPED + 1))
    continue
  fi
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
  S3_SYNCED=$((S3_SYNCED + 1))
done <<< "${ALL_BUCKETS}"

ok "S3 sync complete: ${S3_SYNCED} synced, ${S3_SKIPPED} skipped of ${S3_TOTAL} total"

# ── DynamoDB export ───────────────────────────────────────────────────────────
sep
log "Exporting DynamoDB tables..."

ALL_TABLES=$(aws dynamodb list-tables \
  --profile "${PROFILE}" --region "${REGION}" \
  --query 'TableNames' --output json | jq -r '.[]')

DB_COUNT=0
while IFS= read -r TABLE; do
  [ -z "${TABLE}" ] && continue
  local CAT
  CAT=$(table_category "${TABLE}")
  local DEST_DIR="${BACKUP_ROOT}/${CAT}/dynamodb"
  mkdir -p "${DEST_DIR}"
  local DEST_FILE="${DEST_DIR}/${TABLE}.json"

  # Skip if already exported and non-empty
  if [ -f "${DEST_FILE}" ] && [ -s "${DEST_FILE}" ]; then
    log "  [SKIP - already exported] ${TABLE}"
    continue
  fi

  log "  Scanning: ${TABLE}"
  local LAST_KEY=""
  local TEMP_DIR
  TEMP_DIR=$(mktemp -d)
  local PAGE_NUM=0
  while true; do
    local RAW
    if [ -z "${LAST_KEY}" ]; then
      RAW=$(aws dynamodb scan \
        --profile "${PROFILE}" --region "${REGION}" \
        --table-name "${TABLE}" --output json 2>/dev/null) || { warn "  Scan failed: ${TABLE}"; break; }
    else
      RAW=$(aws dynamodb scan \
        --profile "${PROFILE}" --region "${REGION}" \
        --table-name "${TABLE}" \
        --exclusive-start-key "${LAST_KEY}" --output json 2>/dev/null) || { warn "  Scan page failed: ${TABLE}"; break; }
    fi
    # Strip unescaped control chars (U+0000–U+001F except tab \011 and newline \012)
    # so jq can parse tables whose string fields contain raw binary/control data
    local CLEAN
    CLEAN=$(echo "${RAW}" | LC_ALL=C tr -d '\000-\010\013-\037')
    echo "${CLEAN}" | jq '.Items' > "${TEMP_DIR}/page_${PAGE_NUM}.json" 2>/dev/null \
      || { warn "  jq parse failed on page ${PAGE_NUM} for ${TABLE} — writing empty page"; echo "[]" > "${TEMP_DIR}/page_${PAGE_NUM}.json"; }
    LAST_KEY=$(echo "${CLEAN}" | jq -rc '.LastEvaluatedKey // empty' 2>/dev/null || echo "")
    PAGE_NUM=$((PAGE_NUM + 1))
    [ -z "${LAST_KEY}" ] && break
  done

  jq -s 'add // []' "${TEMP_DIR}"/page_*.json > "${DEST_FILE}" 2>/dev/null \
    || echo "[]" > "${DEST_FILE}"
  rm -rf "${TEMP_DIR}"
  local COUNT
  COUNT=$(jq 'length' "${DEST_FILE}" 2>/dev/null || echo "?")
  ok "  ${TABLE}: ${COUNT} items (${CAT})"
  DB_COUNT=$((DB_COUNT + 1))
done <<< "${ALL_TABLES}"

ok "DynamoDB export complete: ${DB_COUNT} tables exported"

# ── CloudWatch log groups ─────────────────────────────────────────────────────
sep
log "Exporting non-empty CloudWatch log groups..."

LOG_GROUPS=$(aws logs describe-log-groups \
  --profile "${PROFILE}" --region "${REGION}" \
  --query 'logGroups[?storedBytes>`0`].logGroupName' \
  --output json | jq -r '.[]')

LG_COUNT=0
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

  if [ -f "${DEST_FILE}" ] && [ -s "${DEST_FILE}" ]; then
    log "  [SKIP - already exported] ${LG_NAME}"
    continue
  fi

  log "  Exporting: ${LG_NAME}"

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
  LG_COUNT=$((LG_COUNT + 1))
done <<< "${LOG_GROUPS}"

ok "CloudWatch logs export complete: ${LG_COUNT} groups exported"

# ── Final summary ─────────────────────────────────────────────────────────────
sep
ok "BACKUP RESUME COMPLETE"
sep
echo ""
du -sh "${BACKUP_ROOT}"/*/  2>/dev/null | sort -h
echo ""
echo "Next step — to delete all non-HEPE stacks and resources:"
echo "  zsh Archive/administration/backup-and-cleanup.sh --delete"
echo ""
echo "Finished: $(date)"
