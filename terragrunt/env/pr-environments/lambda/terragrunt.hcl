terraform {
  source = "../../../aws//lambda"
}

include {
  path = find_in_parent_folders("root.hcl")
}

dependencies {
  paths = ["../../staging/iam", "../../staging/network", "../../staging/ecr", "../../staging/load_balancer", "../../staging/ssm"]
}

dependency "iam" {
  config_path = "../../staging/iam"
  
  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    iam_role_ai-answers-ecs-role_arn = ""
  }
}

dependency "network" {
  config_path = "../../staging/network"
  
  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    vpc_id                 = ""
    vpc_private_subnet_ids = [""]
    ecs_security_group_id  = ""
  }
}

dependency "ecr" {
  config_path = "../../staging/ecr"
  
  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    ecr_repository_url = ""
  }
}

dependency "load_balancer" {
  config_path = "../../staging/load_balancer"
  
  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    lb_listener = ""
    lb_arn      = ""
  }
}

dependency "ssm" {
  config_path = "../../staging/ssm"
  
  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    docdb_uri_arn                = ""
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
  # PR number will be passed as a variable from the GitHub Action
  pr_number = get_env("TF_VAR_pr_number", "0")
  
  # Lambda configuration
  ecr_repository_url = dependency.ecr.outputs.ecr_repository_url
  lambda_role_arn    = dependency.iam.outputs.iam_role_ai-answers-ecs-role_arn
  memory_size        = 1024
  timeout            = 300
  
  # Networking
  vpc_id             = dependency.network.outputs.vpc_id
  subnet_ids         = dependency.network.outputs.vpc_private_subnet_ids
  security_group_ids = [dependency.network.outputs.ecs_security_group_id]
  
  # ALB configuration
  alb_listener_arn = dependency.load_balancer.outputs.lb_listener
  domain_name      = "ai-answers.cdssandbox.xyz"
  
  # SSM parameters for secrets
  docdb_uri_arn                = dependency.ssm.outputs.docdb_uri_arn
  azure_openai_api_key_arn     = dependency.ssm.outputs.azure_openai_api_key_arn
  azure_openai_endpoint_arn    = dependency.ssm.outputs.azure_openai_endpoint_arn
  azure_openai_api_version_arn = dependency.ssm.outputs.azure_openai_api_version_arn
  canada_ca_search_uri_arn     = dependency.ssm.outputs.canada_ca_search_uri_arn
  canada_ca_search_api_key_arn = dependency.ssm.outputs.canada_ca_search_api_key_arn
  user_agent_arn               = dependency.ssm.outputs.user_agent_arn
  jwt_secret_key_arn           = dependency.ssm.outputs.jwt_secret_key_arn
  google_api_key_arn           = dependency.ssm.outputs.google_api_key_arn
  google_search_engine_id_arn  = dependency.ssm.outputs.google_search_engine_id_arn
  
  # Environment variables
  environment_variables = {
    NODE_ENV                     = "pr-preview"
    PORT                         = "3001"
    AWS_LAMBDA_FUNCTION_NAME     = "ai-answers-pr-review-${get_env("TF_VAR_pr_number", "0")}"
    IS_PR_PREVIEW                = "true"
    DOCDB_URI                    = dependency.ssm.outputs.docdb_uri_arn
    CANADA_CA_SEARCH_URI         = dependency.ssm.outputs.canada_ca_search_uri_arn
    CANADA_CA_SEARCH_API_KEY     = dependency.ssm.outputs.canada_ca_search_api_key_arn
    AZURE_OPENAI_API_KEY         = dependency.ssm.outputs.azure_openai_api_key_arn
    AZURE_OPENAI_ENDPOINT        = dependency.ssm.outputs.azure_openai_endpoint_arn
    AZURE_OPENAI_API_VERSION     = dependency.ssm.outputs.azure_openai_api_version_arn
    USER_AGENT                   = dependency.ssm.outputs.user_agent_arn
    JWT_SECRET_KEY               = dependency.ssm.outputs.jwt_secret_key_arn
    GOOGLE_API_KEY               = dependency.ssm.outputs.google_api_key_arn
    GOOGLE_SEARCH_ENGINE_ID      = dependency.ssm.outputs.google_search_engine_id_arn
  }
}

# Override the remote state configuration for PR environments
remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = {
    encrypt             = true
    bucket              = "${get_env("TF_VAR_cost_center_code", "cds-snc")}-tf"
    dynamodb_table      = "terraform-state-lock-dynamo"
    region              = "ca-central-1"
    key                 = "pr-environments/lambda-${get_env("TF_VAR_pr_number", "0")}/terraform.tfstate"
    s3_bucket_tags      = { CostCentre : get_env("TF_VAR_cost_center_code", "cds-snc") }
    dynamodb_table_tags = { CostCentre : get_env("TF_VAR_cost_center_code", "cds-snc") }
  }
}