#!/usr/bin/env bash
#
# Build and deploy Hopscotch to Cloud Run.
#
#   PROJECT_ID=your-gcp-project ./deploy/deploy.sh
#
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-hopscotch}"
REPO="${REPO:-hopscotch}"
TAG="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
# Secret names. The Anthropic key and the cron secret are the ones shared
# with the other apps on this project; only the JWT secret is Hopscotch's own.
JWT_SECRET_NAME="${JWT_SECRET_NAME:-hopscotch-jwt-secret}"
ANTHROPIC_SECRET_NAME="${ANTHROPIC_SECRET_NAME:-anthropic-api-key}"
CRON_SECRET_NAME="${CRON_SECRET_NAME:-cron-secret}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}"

echo "==> Building ${IMAGE}:${TAG} with Cloud Build"
gcloud builds submit \
  --project="$PROJECT_ID" \
  --tag "${IMAGE}:${TAG}" \
  .

echo "==> Deploying to Cloud Run"
gcloud run deploy "$SERVICE" \
  --project="$PROJECT_ID" \
  --image="${IMAGE}:${TAG}" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --min-instances=0 \
  --max-instances=4 \
  --timeout=300 \
  --set-env-vars="NODE_ENV=production,DB_DRIVER=firestore,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},FIRESTORE_DATABASE_ID=${DATABASE_ID:-hopscotch},APP_VERSION=${TAG}" \
  --set-secrets="JWT_SECRET=${JWT_SECRET_NAME}:latest,ANTHROPIC_API_KEY=${ANTHROPIC_SECRET_NAME}:latest,CRON_SECRET=${CRON_SECRET_NAME}:latest"

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
echo
echo "==> Live at ${URL}"
curl -fsS "${URL}/api/health" && echo
