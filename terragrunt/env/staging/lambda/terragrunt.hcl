terraform {
  source = "../../../aws//lambda"
}

dependencies {
  paths = ["../network", "../database", "../ssm"]
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
    docdb_uri_arn               = "mock_docdb_uri_arn"
  }
}

dependency "ssm" {
  config_path = "../ssm"

  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    azure_openai_api_key_arn     = ""
    azure_openai_endpoint_arn    = ""
    azure_openai_api_version_arn = ""
    canada_ca_search_uri_arn     = ""
    canada_ca_search_api_key_arn = ""
    user_agent_arn               = ""
    jwt_secret_key_arn           = ""
    google_api_key_arn           = ""
    google_search_engine_id_arn  = ""
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
  docdb_uri_arn               = dependency.database.outputs.docdb_uri_arn
  azure_openai_api_key_arn    = dependency.ssm.outputs.azure_openai_api_key_arn
  azure_openai_endpoint_arn   = dependency.ssm.outputs.azure_openai_endpoint_arn
  azure_openai_api_version_arn = dependency.ssm.outputs.azure_openai_api_version_arn
  canada_ca_search_uri_arn    = dependency.ssm.outputs.canada_ca_search_uri_arn
  canada_ca_search_api_key_arn = dependency.ssm.outputs.canada_ca_search_api_key_arn
  user_agent_arn              = dependency.ssm.outputs.user_agent_arn
  jwt_secret_key_arn          = dependency.ssm.outputs.jwt_secret_key_arn
  google_api_key_arn          = dependency.ssm.outputs.google_api_key_arn
  google_search_engine_id_arn = dependency.ssm.outputs.google_search_engine_id_arn
}

include {
  path = find_in_parent_folders("root.hcl")
}
