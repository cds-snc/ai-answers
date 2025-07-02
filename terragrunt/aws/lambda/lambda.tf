#
# Terraform code to create an Amazon Lambda function
#

# Extract parameter names from ARNs
locals {
  docdb_uri_name                = regex("parameter/(.+)$", var.docdb_uri_arn)[0]
  canada_ca_search_uri_name     = regex("parameter/(.+)$", var.canada_ca_search_uri_arn)[0]
  canada_ca_search_api_key_name = regex("parameter/(.+)$", var.canada_ca_search_api_key_arn)[0]
  azure_openai_api_key_name     = regex("parameter/(.+)$", var.azure_openai_api_key_arn)[0]
  azure_openai_endpoint_name    = regex("parameter/(.+)$", var.azure_openai_endpoint_arn)[0]
  azure_openai_api_version_name = regex("parameter/(.+)$", var.azure_openai_api_version_arn)[0]
  user_agent_name               = regex("parameter/(.+)$", var.user_agent_arn)[0]
  jwt_secret_key_name           = regex("parameter/(.+)$", var.jwt_secret_key_arn)[0]
  google_api_key_name           = regex("parameter/(.+)$", var.google_api_key_arn)[0]
  google_search_engine_id_name  = regex("parameter/(.+)$", var.google_search_engine_id_arn)[0]
}

# IAM Role for Lambda
resource "aws_iam_role" "lambda_exec_role" {
  name = "${var.product_name}-lambda-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Principal = {
          Service = "lambda.amazonaws.com"
        },
        Effect = "Allow",
        Sid    = ""
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic_execution_policy" {
  role       = aws_iam_role.lambda_exec_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_vpc_access_policy" {
  role       = aws_iam_role.lambda_exec_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# IAM policy for Lambda to read SSM parameters
resource "aws_iam_role_policy" "lambda_ssm_policy" {
  name = "${var.product_name}-lambda-ssm-policy"
  role = aws_iam_role.lambda_exec_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Resource = [
          var.docdb_uri_arn,
          var.canada_ca_search_uri_arn,
          var.canada_ca_search_api_key_arn,
          var.azure_openai_api_key_arn,
          var.azure_openai_endpoint_arn,
          var.azure_openai_api_version_arn,
          var.user_agent_arn,
          var.jwt_secret_key_arn,
          var.google_api_key_arn,
          var.google_search_engine_id_arn
        ]
      }
    ]
  })
}

# Security Group for Lambda
resource "aws_security_group" "lambda_sg" {
  name        = "${var.product_name}-lambda-sg"
  description = "Security group for the AI Answers Lambda function"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 27017
    to_port     = 27017
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr_block]
  }

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

# Rule to allow Lambda to talk to DocumentDB
resource "aws_security_group_rule" "docdb_ingress_lambda" {
  description              = "Allow Lambda to communicate with DocumentDB"
  type                     = "ingress"
  from_port                = 27017
  to_port                  = 27017
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.lambda_sg.id
  security_group_id        = var.aws_docdb_security_group_id
}

# Get all SSM parameters
data "aws_ssm_parameter" "docdb_uri" {
  name = local.docdb_uri_name
}

data "aws_ssm_parameter" "canada_ca_search_uri" {
  name = local.canada_ca_search_uri_name
}

data "aws_ssm_parameter" "canada_ca_search_api_key" {
  name = local.canada_ca_search_api_key_name
}

data "aws_ssm_parameter" "azure_openai_api_key" {
  name = local.azure_openai_api_key_name
}

data "aws_ssm_parameter" "azure_openai_endpoint" {
  name = local.azure_openai_endpoint_name
}

data "aws_ssm_parameter" "azure_openai_api_version" {
  name = local.azure_openai_api_version_name
}

data "aws_ssm_parameter" "user_agent" {
  name = local.user_agent_name
}

data "aws_ssm_parameter" "jwt_secret_key" {
  name = local.jwt_secret_key_name
}

data "aws_ssm_parameter" "google_api_key" {
  name = local.google_api_key_name
}

data "aws_ssm_parameter" "google_search_engine_id" {
  name = local.google_search_engine_id_name
}

# Lambda Function
resource "aws_lambda_function" "ai_answers_lambda" {
  function_name = "${var.function_name}-${var.pr_number}"
  role          = aws_iam_role.lambda_exec_role.arn
  package_type  = "Image"
  image_uri     = "${var.ecr_registry}/${var.image_name}:${var.pr_number}"
  timeout       = 900
  memory_size   = 2048

  vpc_config {
    subnet_ids         = var.vpc_private_subnet_ids
    security_group_ids = [aws_security_group.lambda_sg.id]
  }

  environment {
    variables = {
      NODE_ENV                 = "production"
      REACT_APP_ENV            = "production"
      DOCDB_URI                = data.aws_ssm_parameter.docdb_uri.value
      CANADA_CA_SEARCH_URI     = data.aws_ssm_parameter.canada_ca_search_uri.value
      CANADA_CA_SEARCH_API_KEY = data.aws_ssm_parameter.canada_ca_search_api_key.value
      AZURE_OPENAI_API_KEY     = data.aws_ssm_parameter.azure_openai_api_key.value
      AZURE_OPENAI_ENDPOINT    = data.aws_ssm_parameter.azure_openai_endpoint.value
      AZURE_OPENAI_API_VERSION = data.aws_ssm_parameter.azure_openai_api_version.value
      USER_AGENT               = data.aws_ssm_parameter.user_agent.value
      JWT_SECRET_KEY           = data.aws_ssm_parameter.jwt_secret_key.value
      GOOGLE_API_KEY           = data.aws_ssm_parameter.google_api_key.value
      GOOGLE_SEARCH_ENGINE_ID  = data.aws_ssm_parameter.google_search_engine_id.value
    }
  }

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}
