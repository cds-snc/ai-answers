terraform {
  source = "../../../aws/pr_review"
}

include "root" {
  path = find_in_parent_folders("root.hcl")
}

include "env" {
  path   = find_in_parent_folders("env_vars.hcl")
  expose = true
}

dependency "network" {
  config_path = "../network"
  mock_outputs = {
    vpc_id                 = "vpc-00000000"
    vpc_private_subnet_ids = ["subnet-00000000", "subnet-11111111"]
  }
}

dependency "database" {
  config_path = "../database"
  mock_outputs = {
    aws_docdb_security_group_id = "sg-00000000"
    docdb_uri_arn               = "arn:aws:ssm:ca-central-1:123456789012:parameter/docdb_uri"
  }
}

dependency "ssm" {
  config_path                             = "../ssm"
  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    docdb_username_arn                   = ""
    docdb_password_arn                   = ""
    azure_openai_api_key_arn             = ""
    azure_openai_endpoint_arn            = ""
    azure_openai_api_version_arn         = ""
    canada_ca_search_api_key_arn         = ""
    canada_ca_search_uri_arn             = ""
    user_agent_arn                       = ""
    jwt_secret_key_arn                   = ""
    google_api_key_arn                   = ""
    gc_notify_api_key_arn                = ""
    google_search_engine_id_arn          = ""
    cross_account_bedrock_role_arn_value = ""
    cross_account_bedrock_role_ssm_arn   = ""
    bedrock_region_ssm_arn               = ""
    redis_url_arn                        = ""
    conversation_integrity_secret_arn    = ""
  }
}


inputs = {
  vpc_id                                 = dependency.network.outputs.vpc_id
  vpc_private_subnet_ids                 = dependency.network.outputs.vpc_private_subnet_ids
  ai_answers_docdb_security_group_id     = dependency.database.outputs.aws_docdb_security_group_id
  redis_security_group_id                = dependency.elasticache.outputs.redis_security_group_id
  ai_answers_lambda_client_iam_role_name = "ai-answers-lambda-client"
  docdb_uri_arn                          = dependency.database.outputs.docdb_uri_arn
  docdb_username_arn                     = dependency.ssm.outputs.docdb_username_arn
  docdb_password_arn                     = dependency.ssm.outputs.docdb_password_arn
  azure_openai_api_key_arn               = dependency.ssm.outputs.azure_openai_api_key_arn
  azure_openai_endpoint_arn              = dependency.ssm.outputs.azure_openai_endpoint_arn
  azure_openai_api_version_arn           = dependency.ssm.outputs.azure_openai_api_version_arn
  canada_ca_search_uri_arn               = dependency.ssm.outputs.canada_ca_search_uri_arn
  canada_ca_search_api_key_arn           = dependency.ssm.outputs.canada_ca_search_api_key_arn
  jwt_secret_key_arn                     = dependency.ssm.outputs.jwt_secret_key_arn
  user_agent_arn                         = dependency.ssm.outputs.user_agent_arn
  google_api_key_arn                     = dependency.ssm.outputs.google_api_key_arn
  gc_notify_api_key_arn                  = dependency.ssm.outputs.gc_notify_api_key_arn
  google_search_engine_id_arn            = dependency.ssm.outputs.google_search_engine_id_arn
  bedrock_invoke_role_arn                = dependency.ssm.outputs.cross_account_bedrock_role_arn_value
  cross_account_bedrock_role_ssm_arn     = dependency.ssm.outputs.cross_account_bedrock_role_ssm_arn
  bedrock_region_ssm_arn                 = dependency.ssm.outputs.bedrock_region_ssm_arn
  redis_url_arn                          = dependency.ssm.outputs.redis_url_arn
  conversation_integrity_secret_arn      = dependency.ssm.outputs.conversation_integrity_secret_arn
  s3_bucket_name_ssm_arn                 = dependency.s3.outputs.s3_bucket_name_ssm_arn
  s3_bucket_arn                          = dependency.s3.outputs.bucket_arn
}

dependency "elasticache" {
  config_path = "../elasticache"
  mock_outputs = {
    redis_security_group_id = "sg-00000000"
  }
}

dependency "s3" {
  config_path                             = "../s3"
  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    s3_bucket_name_ssm_arn = "arn:aws:ssm:ca-central-1:123456789012:parameter/s3_bucket_name"
    bucket_arn             = "arn:aws:s3:::mock-bucket"
  }
}
