terraform {
  source = "../../../aws//ssm_endpoints"
}

dependencies {
  paths = ["../network"]
}

dependency "network" {
  config_path                             = "../network"
  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    vpc_id                 = ""
    vpc_private_subnet_ids = [""]
  }
}

inputs = {
  vpc_id             = dependency.network.outputs.vpc_id
  private_subnet_ids = dependency.network.outputs.vpc_private_subnet_ids
}

include {
  path = find_in_parent_folders("root.hcl")
}
