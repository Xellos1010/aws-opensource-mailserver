# Deploy script for hepefoundation.org
# This script invokes the main deploy-stack.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deploying mailserver infrastructure for hepefoundation.org..."
echo "Invoking deploy-stack.sh from administration folder..."

# Call the main deploy-stack.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/deploy-stack.sh" "hepefoundation.org" 