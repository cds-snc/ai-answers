#
# Terraform code to create an Amazon Lambda function
#

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

# Lambda Function
resource "aws_lambda_function" "ai_answers_lambda" {
  function_name = "${var.function_name}-${var.pr_number}"
  role          = aws_iam_role.lambda_exec_role.arn
  package_type  = "Image"
  image_uri     = "${var.ecr_registry}/${var.image_name}:${var.pr_number}"

  vpc_config {
    subnet_ids         = var.vpc_private_subnet_ids
    security_group_ids = [aws_security_group.lambda_sg.id]
  }

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}