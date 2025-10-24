terraform {
  source = "../../../aws//iam"
}

dependencies {
  paths = ["../ssm", "../database"]
}

dependency "ssm" {
  config_path                             = "../ssm"
  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    docdb_username_arn           = ""
    docdb_password_arn           = ""
    azure_openai_api_key_arn     = ""
    azure_openai_endpoint_arn    = ""
    azure_openai_api_version_arn = ""
    canada_ca_search_api_key_arn = ""
    canada_ca_search_uri_arn     = ""
    user_agent_arn               = ""
    jwt_secret_key_arn           = ""
    google_api_key_arn           = ""
    gc_notify_api_key_arn        = ""
    google_search_engine_id_arn  = ""
    adobe_analytics_url_arn      = ""
  }
}

dependency "database" {
  config_path                             = "../database"
  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    docdb_uri_arn = "mock_docdb_uri_arn"
  }
}

inputs = {
  docdb_password_arn           = dependency.ssm.outputs.docdb_password_arn
  docdb_username_arn           = dependency.ssm.outputs.docdb_username_arn
  azure_openai_api_key_arn     = dependency.ssm.outputs.azure_openai_api_key_arn
  azure_openai_endpoint_arn    = dependency.ssm.outputs.azure_openai_endpoint_arn
  azure_openai_api_version_arn = dependency.ssm.outputs.azure_openai_api_version_arn
  docdb_uri_arn                = dependency.database.outputs.docdb_uri_arn
  canada_ca_search_api_key_arn = dependency.ssm.outputs.canada_ca_search_api_key_arn
  canada_ca_search_uri_arn     = dependency.ssm.outputs.canada_ca_search_uri_arn
  user_agent_arn               = dependency.ssm.outputs.user_agent_arn
  jwt_secret_key_arn           = dependency.ssm.outputs.jwt_secret_key_arn
  google_api_key_arn           = dependency.ssm.outputs.google_api_key_arn
  gc_notify_api_key_arn        = dependency.ssm.outputs.gc_notify_api_key_arn
  google_search_engine_id_arn  = dependency.ssm.outputs.google_search_engine_id_arn
  adobe_analytics_url_arn      = dependency.ssm.outputs.adobe_analytics_url_arn
}

include {
  path = find_in_parent_folders("root.hcl")
}
