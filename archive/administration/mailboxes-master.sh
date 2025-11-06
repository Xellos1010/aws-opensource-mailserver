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


