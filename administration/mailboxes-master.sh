#!/usr/bin/env bash
set -Eeuo pipefail

# Usage:
#   ./administration/mailboxes-master.sh backup   <domain>   # pulls mailboxes to Desktop/
#   ./administration/mailboxes-master.sh upload   <domain>   # rsyncs Desktop backup to server (/tmp/...) and stages
#   ./administration/mailboxes-master.sh finalize <domain>   # moves staged mailboxes into place & restarts services
#
# Domains map to stacks like: <domain> -> <domain-with-dashes>-mailserver

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADMIN="$ROOT/administration"
CMD="${1:-}"
DOMAIN="${2:-hepefoundation.org}"

case "$CMD" in
  backup)
    echo "== Backup from server -> Desktop =="
    bash "$ADMIN/download-mailboxes.sh"
    ;;
  upload)
    echo "== Upload Desktop backup -> server (staged) =="
    bash "$ADMIN/upload-mailboxes.sh" "$DOMAIN"
    ;;
  finalize)
    echo "== Finalize server mailboxes (move + restart) =="
    bash "$ADMIN/finalize-mailbox-upload.sh" "$DOMAIN"
    ;;
  *)
    echo "Usage: $0 {backup|upload|finalize} <domain>"
    exit 1
    ;;
esac


