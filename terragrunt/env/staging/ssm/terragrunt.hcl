terraform {
  source = "../../../aws//ssm"
}

include {
  path = find_in_parent_folders("root.hcl")
}

inputs = {
  cross_account_bedrock_role_arn = "arn:aws:iam::144414543732:role/ai-answers-bedrock-invoke"
  bedrock_region                 = "ca-central-1"
}