# Get the Lambda function details
data "aws_lambda_function" "pr_review" {
  function_name = "ai-answers-pr-review-${var.pr_number}"
}

# Create PR-specific target group for Lambda
resource "aws_lb_target_group" "pr_review" {
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
  }

  tags = {
    CostCentre = var.billing_code
    PRNumber   = var.pr_number
  }
}

# Create listener rule for PR subdomain
resource "aws_lb_listener_rule" "pr_review" {
  listener_arn = var.load_balancer_listener_arn
  priority     = tonumber("1${var.pr_number}")

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.pr_review.arn
  }

  condition {
    host_header {
      values = ["${var.pr_number}.${var.domain}"]
    }
  }

  tags = {
    CostCentre = var.billing_code
    PRNumber   = var.pr_number
  }
}

# Allow ALB to invoke the Lambda function
resource "aws_lambda_permission" "pr_review" {
  statement_id  = "AllowExecutionFromALB"
  action        = "lambda:InvokeFunction"
  function_name = data.aws_lambda_function.pr_review.function_name
  principal     = "elasticloadbalancing.amazonaws.com"
  source_arn    = aws_lb_target_group.pr_review.arn
}

# Attach Lambda to target group
resource "aws_lb_target_group_attachment" "pr_review" {
  target_group_arn = aws_lb_target_group.pr_review.arn
  target_id        = var.lambda_function_arn
}