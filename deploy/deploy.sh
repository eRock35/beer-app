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
  --set-env-vars="NODE_ENV=production,DB_DRIVER=firestore,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},APP_VERSION=${TAG}" \
  --set-secrets="JWT_SECRET=hopscotch-jwt-secret:latest,ANTHROPIC_API_KEY=hopscotch-anthropic-key:latest"

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
echo
echo "==> Live at ${URL}"
curl -fsS "${URL}/api/health" && echo
