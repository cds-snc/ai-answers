terraform {
  source = "../../../aws//iam"
}

dependencies {
  paths = ["../ssm"]
}

dependency "ssm" {
  config_path                             = "../ssm"
  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    docdb_username_arn = ""
    docdb_password_arn = ""
    openai_api_key_arn = ""
  }
}

inputs = {
  docdb_password_arn = dependency.ssm.outputs.docdb_password_arn
  docdb_username_arn = dependency.ssm.outputs.docdb_username_arn
  openai_api_key_arn = dependency.ssm.outputs.openai_api_key_arn
}

include {
  path = find_in_parent_folders("root.hcl")
}