terraform {
  source = "../../../aws//waf"
}

dependencies {
  paths = ["../load_balancer"]
}

dependency "load_balancer" {
  config_path = "../load_balancer"

  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    alb_arn = "arn:aws:elasticloadbalancing:ca-central-1:992382783569:loadbalancer/app/ai-answers-lb/mock"
  }
}

include {
  path = find_in_parent_folders("root.hcl")
}

inputs = {
  alb_arn = dependency.load_balancer.outputs.alb_arn
}
