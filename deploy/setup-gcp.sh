#!/usr/bin/env bash
#
# One-time GCP setup for Hopscotch. Run this once per project, then use
# deploy/deploy.sh (or Cloud Build) for every deploy after that.
#
#   PROJECT_ID=your-gcp-project ./deploy/setup-gcp.sh
#
# Authenticate first, either as yourself:
#   gcloud auth login
# or with a service account key:
#   gcloud auth activate-service-account --key-file=/path/to/key.json
#
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-hopscotch}"
REPO="${REPO:-hopscotch}"

echo "==> Project: $PROJECT_ID  Region: $REGION"
gcloud config set project "$PROJECT_ID" >/dev/null

echo "==> Enabling APIs (this is slow the first time)"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com

echo "==> Artifact Registry repository"
gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Hopscotch container images"

echo "==> Firestore (Native mode)"
if ! gcloud firestore databases describe --database='(default)' >/dev/null 2>&1; then
  gcloud firestore databases create --location="$REGION" --type=firestore-native
else
  echo "    already exists, leaving it alone"
fi

echo "==> Secrets"
create_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    echo "    $name exists — not overwriting"
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic
    echo "    created $name"
  fi
}

create_secret hopscotch-jwt-secret "$(openssl rand -base64 48)"

# The Anthropic key is optional. Without it the app runs fine and the sommelier
# simply reports itself as switched off. A placeholder keeps the deploy's
# --set-secrets reference valid either way.
create_secret hopscotch-anthropic-key "${ANTHROPIC_API_KEY:-}"

echo "==> Granting the Cloud Run runtime service account what it needs"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for role in roles/datastore.user roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="$role" \
    --condition=None >/dev/null
  echo "    ${RUNTIME_SA} → $role"
done

cat <<DONE

Setup complete.

  Next:   ./deploy/deploy.sh
  AI on:  printf '%s' "sk-ant-..." | gcloud secrets versions add hopscotch-anthropic-key --data-file=-
          (then redeploy so Cloud Run picks up the new version)
DONE
