# Lambda function for PR preview
resource "aws_lambda_function" "pr_preview" {
  function_name = "${var.product_name}-pr-review-${var.pr_number}"
  role         = var.lambda_role_arn
  
  package_type = "Image"
  image_uri    = "${var.ecr_repository_url}:${var.pr_number}"
  
  memory_size = var.memory_size
  timeout     = var.timeout
  
  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = var.security_group_ids
  }
  
  environment {
    variables = merge(
      var.environment_variables,
      {
        # Add SSM parameter ARNs as environment variables
        # The Lambda function will need to fetch these at runtime
        DOCDB_URI_SSM_ARN                = var.docdb_uri_arn
        AZURE_OPENAI_API_KEY_SSM_ARN     = var.azure_openai_api_key_arn
        AZURE_OPENAI_ENDPOINT_SSM_ARN    = var.azure_openai_endpoint_arn
        AZURE_OPENAI_API_VERSION_SSM_ARN = var.azure_openai_api_version_arn
        CANADA_CA_SEARCH_URI_SSM_ARN     = var.canada_ca_search_uri_arn
        CANADA_CA_SEARCH_API_KEY_SSM_ARN = var.canada_ca_search_api_key_arn
        USER_AGENT_SSM_ARN                = var.user_agent_arn
        JWT_SECRET_KEY_SSM_ARN            = var.jwt_secret_key_arn
        GOOGLE_API_KEY_SSM_ARN            = var.google_api_key_arn
        GOOGLE_SEARCH_ENGINE_ID_SSM_ARN   = var.google_search_engine_id_arn
      }
    )
  }
  
  tags = {
    Name        = "${var.product_name}-pr-review-${var.pr_number}"
    Environment = "pr-preview"
    PRNumber    = var.pr_number
    CostCentre  = var.billing_code
  }
}

# Permission for ALB to invoke Lambda
resource "aws_lambda_permission" "alb_invoke" {
  statement_id  = "AllowALBInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pr_preview.function_name
  principal     = "elasticloadbalancing.amazonaws.com"
}

# Target group for Lambda
resource "aws_lb_target_group" "pr_preview" {
  name        = "${var.product_name}-pr-${var.pr_number}"
  target_type = "lambda"
  vpc_id      = var.vpc_id
  
  health_check {
    enabled             = true
    interval            = 60
    path                = "/health"
    timeout             = 30
    healthy_threshold   = 2
    unhealthy_threshold = 2
    matcher             = "200"
  }
  
  tags = {
    Name        = "${var.product_name}-pr-${var.pr_number}"
    Environment = "pr-preview"
    PRNumber    = var.pr_number
    CostCentre  = var.billing_code
  }
}

# Attach Lambda to target group
resource "aws_lb_target_group_attachment" "pr_preview" {
  target_group_arn = aws_lb_target_group.pr_preview.arn
  target_id        = aws_lambda_function.pr_preview.arn
  
  depends_on = [aws_lambda_permission.alb_invoke]
}

# ALB listener rule for PR subdomain
resource "aws_lb_listener_rule" "pr_preview" {
  listener_arn = var.alb_listener_arn
  priority     = 100 + var.pr_number  # Ensure unique priority
  
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.pr_preview.arn
  }
  
  condition {
    host_header {
      values = ["${var.pr_number}.${var.domain_name}"]
    }
  }
  
  tags = {
    Name        = "${var.product_name}-pr-${var.pr_number}-rule"
    Environment = "pr-preview"
    PRNumber    = var.pr_number
    CostCentre  = var.billing_code
  }
}

# CloudWatch log group for Lambda
resource "aws_cloudwatch_log_group" "pr_preview" {
  name              = "/aws/lambda/${var.product_name}-pr-review-${var.pr_number}"
  retention_in_days = 7  # Short retention for PR previews
  
  tags = {
    Name        = "${var.product_name}-pr-review-${var.pr_number}"
    Environment = "pr-preview"
    PRNumber    = var.pr_number
    CostCentre  = var.billing_code
  }
}