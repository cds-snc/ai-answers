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
  redis_url = dependency.elasticache.outputs.redis_url
}