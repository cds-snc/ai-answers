data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  ai_answers_release   = "ai_answers_release"
  ai_answers_pr_review = "ai-answers-pr-review"
}

module "github_workflow_roles" {
  count = var.env == "production" ? 1 : 0

  source            = "github.com/cds-snc/terraform-modules//gh_oidc_role?ref=v10.4.1"
  billing_tag_value = var.billing_code

  roles = [
    {
      name      = local.ai_answers_release
      repo_name = "ai-answers"
      claim     = "environment:production"
    },
    {
      name      = local.ai_answers_pr_review
      repo_name = "ai-answers"
      claim     = "pull_request"
    }
  ]
}

resource "aws_iam_role_policy_attachment" "ai_answers_release" {
  count = var.env == "production" ? 1 : 0

  role       = local.ai_answers_release
  policy_arn = data.aws_iam_policy.admin.arn
  depends_on = [
    module.github_workflow_roles[0]
  ]
}

resource "aws_iam_role_policy_attachment" "ai_answers_pr_review" {
  count = var.env == "production" ? 1 : 0

  role       = local.ai_answers_pr_review
  policy_arn = aws_iam_policy.ai_answers_pr_review.arn
  depends_on = [
    module.github_workflow_roles[0]
  ]
}

data "aws_iam_policy" "admin" {
  # checkov:skip=CKV_AWS_275:This policy is required for the Terraform apply
  name = "AdministratorAccess"
}

resource "aws_iam_policy" "ai_answers_pr_review" {
  name   = local.ai_answers_pr_review
  path   = "/"
  policy = data.aws_iam_policy_document.pr_review_env.json
}

data "aws_iam_policy_document" "pr_review_env" {
  source_policy_documents = [
    data.aws_iam_policy_document.lambda_function_manage.json,
    data.aws_iam_policy_document.ecr_image_manage.json,
  ]
}

data "aws_iam_policy_document" "lambda_function_manage" {
  statement {
    effect = "Allow"
    actions = [
      "lambda:AddPermission",
      "lambda:CreateFunction",
      "lambda:CreateFunctionUrlConfig",
      "lambda:DeleteFunction",
      "lambda:DeleteFunctionUrlConfig",
      "lambda:DeleteFunctionConcurrency",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:GetFunctionUrlConfig",
      "lambda:ListFunctionUrlConfigs",
      "lambda:PutFunctionConcurrency",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:UpdateFunctionUrlConfig"
    ]
    resources = [
      "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:${var.product_name}-pr-review-*"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "iam:PassRole"
    ]
    resources = [
      aws_iam_role.pr-review-env-lambda.arn
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "logs:DescribeLogGroups"
    ]
    resources = [
      "*"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:DeleteLogGroup",
      "logs:DeleteLogStream",
      "logs:DeleteRetentionPolicy",
      "logs:DescribeLogStreams",
      "logs:PutRetentionPolicy"
    ]
    resources = [
      "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.product_name}-pr-review-*"
    ]
  }
}

data "aws_iam_policy_document" "ecr_image_manage" {
  statement {
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchDeleteImage",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:DescribeRepositories",
      "ecr:GetDownloadUrlForLayer",
      "ecr:GetRepositoryPolicy",
      "ecr:InitiateLayerUpload",
      "ecr:ListImages",
      "ecr:PutImage",
      "ecr:SetRepositoryPolicy",
      "ecr:UploadLayerPart"
    ]
    resources = [
      "arn:aws:ecr:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:repository/${var.product_name}-pr-review"
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "ecr:GetAuthorizationToken"
    ]
    resources = ["*"]
  }
}

data "aws_iam_policy_document" "pr_review_env_policy_document" {
  statement {
    effect = "Allow"

    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]

    resources = [
      "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:*"
    ]
  }
}

resource "aws_iam_role_policy_attachment" "pr-review-env-lambda" {
  role       = aws_iam_role.pr-review-env-lambda.name
  policy_arn = aws_iam_policy.pr-review-env-lambda.arn
}

resource "aws_iam_policy" "pr-review-env-lambda" {
  name   = "pr-review-env-lambda"
  path   = "/"
  policy = data.aws_iam_policy_document.pr_review_env_policy_document.json
}

data "aws_iam_policy_document" "pr-review-env-lambda-execution" {
  statement {
    effect = "Allow"

    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}
resource "aws_iam_role" "pr-review-env-lambda" {
  name               = "pr-review-env-lambda"
  assume_role_policy = data.aws_iam_policy_document.pr-review-env-lambda-execution.json
}
