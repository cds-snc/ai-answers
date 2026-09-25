# The AWS half of the Sentinel forwarder's secretless path to the Logs Ingestion
# API (DCE/DCR), which replaces the retiring Data Collector API. Nothing is
# stored — the forwarder's IAM role is the only credential:
#
#   role -> cognito-identity:GetOpenIdTokenForDeveloperIdentity  (this pool)
#        -> that OIDC JWT as an Entra client assertion
#        -> token for the user-assigned managed identity
#           sentinel-forwarder-v2-aws-cognito (cds-snc/cds-azure-resources)
#        -> POST to the data collection endpoint
#
# Identity pools carry no resource policy, so the forwarder can only use a pool
# in its own account: staging and production each get one from this file.
#
# Nothing uses the pool yet. The forwarder stays on v1 until a follow-up change
# passes the pool's id to the ecs module as sentinel_cognito_identity_pool_id.

resource "aws_cognito_identity_pool" "sentinel_forwarder_v2" {
  identity_pool_name               = "sentinel-forwarder-v2-federation"
  allow_unauthenticated_identities = false
  developer_provider_name          = "azure-sentinel-access"
}
