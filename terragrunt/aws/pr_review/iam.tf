#
# Lambda execution role for AI Answers PR review functions
#
data "aws_iam_policy_document" "ai_answers_lambda_assume_role" {
  count = var.env == "staging" ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]
    effect  = "Allow"

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ai_answers_lambda_client" {
  count = var.env == "staging" ? 1 : 0

  name               = "ai-answers-lambda-client"
  assume_role_policy = data.aws_iam_policy_document.ai_answers_lambda_assume_role[0].json

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

# Attach basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "ai_answers_lambda_basic_execution" {
  count = var.env == "staging" ? 1 : 0

  role       = aws_iam_role.ai_answers_lambda_client[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Attach VPC execution policy for Lambda
resource "aws_iam_role_policy_attachment" "ai_answers_lambda_vpc_execution" {
  count = var.env == "staging" ? 1 : 0

  role       = aws_iam_role.ai_answers_lambda_client[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# SSM Parameter Store access for Lambda
data "aws_iam_policy_document" "ai_answers_lambda_parameter_store" {
  count = var.env == "staging" ? 1 : 0

  statement {
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath"
    ]
    effect = "Allow"
    resources = [
      var.docdb_uri_arn,
      var.docdb_username_arn,
      var.docdb_password_arn,
      var.azure_openai_api_key_arn,
      var.azure_openai_endpoint_arn,
      var.azure_openai_api_version_arn,
      var.canada_ca_search_uri_arn,
      var.canada_ca_search_api_key_arn,
      var.jwt_secret_key_arn,
      var.user_agent_arn,
      var.google_api_key_arn,
      var.gc_notify_api_key_arn,
      var.google_search_engine_id_arn
    ]
  }
}

resource "aws_iam_policy" "ai_answers_lambda_parameter_store" {
  count = var.env == "staging" ? 1 : 0

  name   = "aiAnswersLambdaParameterStoreRetrieval"
  path   = "/"
  policy = data.aws_iam_policy_document.ai_answers_lambda_parameter_store[0].json

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_iam_role_policy_attachment" "ai_answers_lambda_parameter_store" {
  count = var.env == "staging" ? 1 : 0

  role       = aws_iam_role.ai_answers_lambda_client[0].name
  policy_arn = aws_iam_policy.ai_answers_lambda_parameter_store[0].arn
}

#
# GitHub Actions OIDC roles for PR review workflows
#
locals {
  ai_answers_lambda_client_pr_review_env = "ai-answers-lambda-client-pr-review-env"
}

module "github_workflow_roles" {
  count = var.env == "staging" ? 1 : 0

  source            = "github.com/cds-snc/terraform-modules//gh_oidc_role?ref=v10.4.1"
  billing_tag_value = var.billing_code

  roles = [
    {
      name      = local.ai_answers_lambda_client_pr_review_env
      repo_name = "ai-answers"
      claim     = "pull_request"
    }
  ]
}

# Attach Lambda management permissions to the GitHub Actions roles
data "aws_iam_policy_document" "lambda_management" {
  count = var.env == "staging" ? 1 : 0

  statement {
    actions = [
      "lambda:*",
      "ecr:*",
      "logs:*",
      "iam:PassRole",
      "ec2:DescribeVpcs",
      "ec2:DescribeSubnets",
      "ec2:DescribeSecurityGroups"
    ]
    effect    = "Allow"
    resources = ["*"]
  }
}

resource "aws_iam_policy" "lambda_management" {
  count = var.env == "staging" ? 1 : 0

  name   = "aiAnswersLambdaManagement"
  path   = "/"
  policy = data.aws_iam_policy_document.lambda_management[0].json

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_iam_role_policy_attachment" "lambda_client_pr_review_management" {
  count = var.env == "staging" ? 1 : 0

  role       = local.ai_answers_lambda_client_pr_review_env
  policy_arn = aws_iam_policy.lambda_management[0].arn
  depends_on = [module.github_workflow_roles[0]]
}

# Attach SSM parameter store access to GitHub Actions role
resource "aws_iam_role_policy_attachment" "lambda_client_pr_review_parameter_store" {
  count = var.env == "staging" ? 1 : 0

  role       = local.ai_answers_lambda_client_pr_review_env
  policy_arn = aws_iam_policy.ai_answers_lambda_parameter_store[0].arn
  depends_on = [module.github_workflow_roles[0]]
}
