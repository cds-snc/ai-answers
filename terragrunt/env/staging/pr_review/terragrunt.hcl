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
    vpc_id = "vpc-00000000"
  }
}

dependency "database" {
  config_path = "../database"
  mock_outputs = {
    aws_docdb_security_group_id = "sg-00000000"
  }
}

inputs = {
  vpc_id                                 = dependency.network.outputs.vpc_id
  ai_answers_docdb_security_group_id     = dependency.database.outputs.aws_docdb_security_group_id
  ai_answers_lambda_client_iam_role_name = "ai-answers-lambda-client"
}
