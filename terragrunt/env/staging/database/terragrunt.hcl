terraform {
  source = "../../../aws//database"
}

dependencies {
  paths = ["../network", "../ssm"]
}

dependency "network" {
  config_path                             = "../network"
  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    vpc_id                 = ""
    vpc_private_subnet_ids = [""]
    vpc_cidr_block         = ""
  }
}

dependency "ssm" {
  config_path                             = "../ssm"
  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    docdb_username = ""
    docdb_password = ""
  }
}

inputs = {
  vpc_id                 = dependency.network.outputs.vpc_id
  vpc_private_subnet_ids = dependency.network.outputs.vpc_private_subnet_ids
  vpc_cidr_block         = dependency.network.outputs.vpc_cidr_block
  docdb_password_name    = dependency.ssm.outputs.docdb_password_name
  docdb_username_name    = dependency.ssm.outputs.docdb_username_name
}

include {
  path = find_in_parent_folders("root.hcl")
}