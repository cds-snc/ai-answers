terraform {
  source = "../../../aws//pr_load_balancer"
}

dependencies {
  paths = ["../load_balancer", "../lambda"]
}

dependency "load_balancer" {
  config_path = "../load_balancer"

  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    lb_listener_arn = "arn:aws:elasticloadbalancing:ca-central-1:123456789012:listener/app/mock/mock"
  }
}

dependency "lambda" {
  config_path = "../lambda"

  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    lambda_function_arn = "arn:aws:lambda:ca-central-1:123456789012:function:mock"
  }
}

dependency "network" {
  config_path = "../network"

  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    vpc_id = "vpc-mock"
  }
}

inputs = {
  load_balancer_listener_arn = dependency.load_balancer.outputs.lb_listener_arn
  lambda_function_arn        = dependency.lambda.outputs.lambda_function_arn
  vpc_id                     = dependency.network.outputs.vpc_id
  pr_number                  = "216" # overridden by GitHub workflow for PRs
}

include {
  path = find_in_parent_folders("root.hcl")
}