# Trigger workflow to apply redis_url parameter
terraform {
  source = "../../../aws//ssm"
}

include {
  path = find_in_parent_folders("root.hcl")
}

dependencies {
  paths = ["../elasticache"]
}

dependency "elasticache" {
  config_path                             = "../elasticache"
  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    redis_url = "redis://mock-redis:6379"
  }
}

inputs = {
  cross_account_bedrock_role_arn = "arn:aws:iam::144414543732:role/ai-answers-bedrock-invoke"
  bedrock_region                 = "ca-central-1"
  redis_url                      = dependency.elasticache.outputs.redis_url
}