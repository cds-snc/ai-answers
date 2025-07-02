terraform {
  source = "../../../aws//lambda"
}

dependencies {
  paths = ["../network", "../database"]
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

dependency "database" {
  config_path                             = "../database"
  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    aws_docdb_security_group_id = ""
  }
}

inputs = {
  vpc_id                      = dependency.network.outputs.vpc_id
  vpc_private_subnet_ids      = dependency.network.outputs.vpc_private_subnet_ids
  vpc_cidr_block              = dependency.network.outputs.vpc_cidr_block
  aws_docdb_security_group_id = dependency.database.outputs.aws_docdb_security_group_id
  function_name               = "ai-answers-pr-review"
  pr_number                   = "216" # This will be updated by the pipeline
  ecr_registry                = "992382783569.dkr.ecr.ca-central-1.amazonaws.com"
  image_name                  = "ai-answers-pr-review"
  docdb_uri_name              = "docdb_uri"
}

include {
  path = find_in_parent_folders("root.hcl")
}