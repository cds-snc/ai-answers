# IAM Role definitions

# Policy for ECS task role
data "aws_iam_policy_document" "ai-answers-ecs-policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com", "lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "ai-answers-ssm-policy" {
  statement {
    sid    = "AllowSSMParameterAccess"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath"
    ]
    resources = [
      var.docdb_password_arn,
      var.docdb_username_arn,
      var.azure_openai_api_key_arn,
      var.azure_openai_endpoint_arn,
      var.azure_openai_api_version_arn,
      var.canada_ca_search_uri_arn,
      var.canada_ca_search_api_key_arn,
      var.user_agent_arn,
      var.jwt_secret_key_arn,
      var.docdb_uri_arn,
      var.google_api_key_arn,
      var.google_search_engine_id_arn,
    ]
  }
}

resource "aws_iam_policy" "ai-answers-ssm-policy" {
  name        = "${var.product_name}-ssm-policy"
  description = "Policy for ${var.product_name} ${var.env} to access SSM parameters"
  policy      = data.aws_iam_policy_document.ai-answers-ssm-policy.json

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_iam_role" "ai-answers-ecs-role" {
  name               = "${var.product_name}-ecs-role"
  assume_role_policy = data.aws_iam_policy_document.ai-answers-ecs-policy.json
}

resource "aws_iam_role_policy_attachment" "ai-answers-ecs-policy" {
  role       = aws_iam_role.ai-answers-ecs-role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Add Lambda basic execution policy for PR preview environments
resource "aws_iam_role_policy_attachment" "ai-answers-lambda-basic" {
  role       = aws_iam_role.ai-answers-ecs-role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Add Lambda VPC access policy for PR preview environments
resource "aws_iam_role_policy_attachment" "ai-answers-lambda-vpc" {
  role       = aws_iam_role.ai-answers-ecs-role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_policy_attachment" "ai-answers-ssm-policy" {
  name       = "${var.product_name}-ssm-policy"
  policy_arn = aws_iam_policy.ai-answers-ssm-policy.arn
  roles      = [aws_iam_role.ai-answers-ecs-role.name]
}