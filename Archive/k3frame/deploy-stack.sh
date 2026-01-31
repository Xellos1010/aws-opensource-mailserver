# Deploy script for k3frame.com
# This script invokes the main deploy-stack.sh with the k3frame.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deploying mailserver infrastructure for k3frame.com..."
echo "Invoking deploy-stack.sh from administration folder..."

# Call the main deploy-stack.sh script with k3frame.com domain
exec "${ADMIN_DIR}/deploy-stack.sh" "k3frame.com" 