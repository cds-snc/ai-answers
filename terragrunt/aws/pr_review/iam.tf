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
      "arn:aws:ssm:ca-central-1:${var.account_id}:parameter/docdb_uri",
      "arn:aws:ssm:ca-central-1:${var.account_id}:parameter/docdb_username",
      "arn:aws:ssm:ca-central-1:${var.account_id}:parameter/docdb_password",
      "arn:aws:ssm:ca-central-1:${var.account_id}:parameter/azure_openai_api_key",
      "arn:aws:ssm:ca-central-1:${var.account_id}:parameter/azure_openai_endpoint",
      "arn:aws:ssm:ca-central-1:${var.account_id}:parameter/azure_openai_api_version",
      "arn:aws:ssm:ca-central-1:${var.account_id}:parameter/canada_ca_search_uri",
      "arn:aws:ssm:ca-central-1:${var.account_id}:parameter/canada_ca_search_api_key",
      "arn:aws:ssm:ca-central-1:${var.account_id}:parameter/jwt_secret_key",
      "arn:aws:ssm:ca-central-1:${var.account_id}:parameter/user_agent",
      "arn:aws:ssm:ca-central-1:${var.account_id}:parameter/google_api_key",
      "arn:aws:ssm:ca-central-1:${var.account_id}:parameter/google_search_engine_id"
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
  ai_answers_lambda_client_apply         = "ai-answers-lambda-client-apply"
  ai_answers_lambda_client_pr_review_env = "ai-answers-lambda-client-pr-review-env"
}

module "github_workflow_roles" {
  count = var.env == "staging" ? 1 : 0

  source            = "github.com/cds-snc/terraform-modules//gh_oidc_role?ref=v10.4.1"
  billing_tag_value = var.billing_code

  roles = [
    {
      name      = local.ai_answers_lambda_client_apply
      repo_name = "ai-answers"
      claim     = "ref:refs/heads/main"
    },
    {
      name      = local.ai_answers_lambda_client_pr_review_env
      repo_name = "ai-answers"
      claim     = "*"
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
      "iam:PassRole"
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

resource "aws_iam_role_policy_attachment" "lambda_client_apply_management" {
  count = var.env == "staging" ? 1 : 0

  role       = local.ai_answers_lambda_client_apply
  policy_arn = aws_iam_policy.lambda_management[0].arn
  depends_on = [module.github_workflow_roles[0]]
}

resource "aws_iam_role_policy_attachment" "lambda_client_pr_review_management" {
  count = var.env == "staging" ? 1 : 0

  role       = local.ai_answers_lambda_client_pr_review_env
  policy_arn = aws_iam_policy.lambda_management[0].arn
  depends_on = [module.github_workflow_roles[0]]
}