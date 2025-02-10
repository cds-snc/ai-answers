terraform {
  source = "../../../aws//ecs"
}

dependencies {
  paths = ["../iam", "../network", "../ecr", "../load_balancer"]
}

dependency "iam" {
  config_path = "../iam"

  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    iam_role_ai_answers_task_arn = ""
    ecs_task_policy_attachment   = ""
  }
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

dependency "ecr" {
  config_path = "../ecr"

  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    ecr_repository_arn = ""
    ecr_repository_url = ""
  }
}

dependency "load_balancer" {
  config_path = "../load_balancer"

  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    lb_listener                 = ""
    lb_target_group_arn         = ""
    ai_answers_load_balancer_sg = ""
  }
}



inputs = {
  iam_role_ai_answers_task_arn = dependency.iam.outputs.iam_role_ai_answers_task_arn
  ecs_task_policy_attachment   = dependency.iam.outputs.ecs_task_policy_attachment
  vpc_private_subnet_ids       = dependency.network.outputs.vpc_private_subnet_ids
  vpc_id                       = dependency.network.outputs.vpc_id
  ecr_repository_url           = dependency.ecr.outputs.ecr_repository_url
  ecr_repository_arn           = dependency.ecr.outputs.ecr_repository_arn
  lb_listener                  = dependency.load_balancer.outputs.lb_listener
  lb_target_group_arn          = dependency.load_balancer.outputs.lb_target_group_arn
  ai_answers_load_balancer_sg  = dependency.load_balancer.outputs.ai_answers_load_balancer_sg
}

include {
  path = find_in_parent_folders("root.hcl")
}