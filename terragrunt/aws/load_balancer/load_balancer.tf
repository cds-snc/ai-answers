#############################################
# Application Load Balancer (ALB) + Listener
#############################################

# Secondary hostname (alternate domain) always enabled (present in all envs)
locals {
  secondary_host = var.altdomain
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

  tags = merge(var.default_tags, {
    CostCentre   = var.billing_code
    ForceRefresh = "2025-08-14"
  })
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

  tags = merge(var.default_tags, {
    CostCentre   = var.billing_code
    ForceRefresh = "2025-08-14"
  })
}

# Forward alternate hostname → same target group (prod only when provided)
resource "aws_lb_listener_rule" "https_reponses" {
  listener_arn = aws_lb_listener.ai_answers_listener.arn
  priority     = 110

  condition {
    host_header { values = [local.secondary_host] }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.ai_answers.arn
  }
  tags = merge(var.default_tags, {
    CostCentre   = var.billing_code
    ForceRefresh = "2025-08-14"
  })
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

  tags = merge(var.default_tags, {
    CostCentre   = var.billing_code
    ForceRefresh = "2025-08-14"
  })
}
