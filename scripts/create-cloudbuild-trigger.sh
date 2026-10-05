#!/usr/bin/env bash
set -euo pipefail
# Prerequisite: Cloud Build GitHub App must have access to baiq-bq/llmclient.
# Prerequisite: the dedicated llmclient connection is authorized and COMPLETE.
# This script does not change connection credentials.
readonly release_project='baiq-459807'
readonly release_region='europe-west1'
readonly release_repo='baiq-bq-llmclient'
readonly release_trigger='llmclient-main-publish'
readonly release_sa='llmclient-publisher@baiq-459807.iam.gserviceaccount.com'
if ! gcloud builds repositories describe "$release_repo" --connection=llmclient --region="$release_region" --project="$release_project" >/dev/null; then
  gcloud builds repositories create "$release_repo" --remote-uri=https://github.com/baiq-bq/llmclient.git --connection=llmclient --region="$release_region" --project="$release_project"
fi
# Creation must succeed before reporting an active trigger. Existing triggers are not overwritten.
gcloud builds triggers create github \
  --name="$release_trigger" \
  --repository="projects/$release_project/locations/$release_region/connections/llmclient/repositories/$release_repo" \
  --branch-pattern='^main$' \
  --build-config=cloudbuild.yaml \
  --service-account="projects/$release_project/serviceAccounts/$release_sa" \
  --description='Publish @baiq/llmclient from main after a strict version gate; no unit tests in CI' \
  --region="$release_region" --project="$release_project"
