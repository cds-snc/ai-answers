data "aws_lambda_function" "pr_review" {
  count = var.pr_number != "" && var.lambda_function_arn == "" ? 1 : 0
  function_name = "ai-answers-pr-review-${var.pr_number}"
}

# Local value to determine the correct function name and ARN
locals {
  lambda_function_name = var.pr_number != "" ? (
    var.lambda_function_arn != "" ? 
      split(":", var.lambda_function_arn)[6] : 
      try(data.aws_lambda_function.pr_review[0].function_name, null)
  ) : null
  
  lambda_function_arn = var.pr_number != "" ? (
    var.lambda_function_arn != "" ? 
      var.lambda_function_arn : 
      try(data.aws_lambda_function.pr_review[0].arn, null)
  ) : null
}

resource "aws_lb" "ai_answers" {
  name               = "${var.product_name}-lb"
  internal           = false #tfsec:ignore:AWS005
  load_balancer_type = "application"

  idle_timeout               = 300
  enable_deletion_protection = true
  drop_invalid_header_fields = true

  security_groups = [
    aws_security_group.ai_answers_load_balancer_sg.id
  ]

  subnets = var.vpc_public_subnet_ids

  tags = {
    CostCentre = var.billing_code
  }
}

resource "aws_lb_listener" "ai_answers_listener" {
  depends_on = [
    aws_acm_certificate.ai_answers,
    aws_route53_record.ai_answers_certificate_validation,
    aws_acm_certificate_validation.ai_answers,
  ]

  load_balancer_arn = aws_lb.ai_answers.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.ai_answers.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.ai_answers.arn
  }
}

resource "aws_lb_target_group" "ai_answers" {
  name                 = var.product_name
  port                 = 3001
  protocol             = "HTTP"
  protocol_version     = "HTTP1"
  target_type          = "ip"
  deregistration_delay = 30
  vpc_id               = var.vpc_id

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
  }
}

resource "aws_lb_target_group" "pr_review" {
  count = var.pr_number != "" ? 1 : 0

  name        = "${var.product_name}-pr-${var.pr_number}"
  target_type = "lambda"
  vpc_id      = var.vpc_id

  tags = {
    CostCentre = var.billing_code
  }
}

resource "aws_lb_listener_rule" "pr_review" {
  count = var.pr_number != "" ? 1 : 0

  listener_arn = aws_lb_listener.ai_answers_listener.arn
  priority     = tonumber("1${var.pr_number}")

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.pr_review[0].arn
  }

  condition {
    host_header {
      values = ["${var.pr_number}.${var.domain}"]
    }
  }
}

resource "aws_lambda_permission" "pr_review" {
  count = var.pr_number != "" && local.lambda_function_name != null ? 1 : 0

  statement_id  = "AllowExecutionFromALB"
  action        = "lambda:InvokeFunction"
  function_name = local.lambda_function_name
  principal     = "elasticloadbalancing.amazonaws.com"
  source_arn    = aws_lb_target_group.pr_review[0].arn
}

resource "aws_lb_target_group_attachment" "pr_review" {
  count = var.pr_number != "" && local.lambda_function_arn != null ? 1 : 0

  target_group_arn = aws_lb_target_group.pr_review[0].arn
  target_id        = local.lambda_function_arn
}
