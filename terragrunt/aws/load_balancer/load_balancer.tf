resource "aws_lb" "main" {
  name               = "ai-answers-lb"          # Unique name for the lb
  internal           = false                     # false = internet-facing, true = internal
  load_balancer_type = "application"            # lb type (as opposed to Network Load Balancer)
  security_groups    = [var.lb_security_group_id]  # Security group that controls inbound/outbound traffic
  subnets            = var.public_subnet_ids    # Public subnets where the lb will be placed

  enable_deletion_protection = false  ƒ          # Set to true in production to prevent accidental deletion

  tags = {
    Environment = var.environment
    Terraform   = "true"
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn          # Attaches listener to our lb
  port              = "443"                     # Standard HTTPS port
  protocol          = "HTTPS"                   # Use HTTPS protocol
  ssl_policy        = "ELBSecurityPolicy-2016-08"  # AWS-managed SSL policy
  certificate_arn   = var.certificate_arn       # SSL certificate for HTTPS

  default_action {
    type = "fixed-response"                     # Returns a fixed response

    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }
}

# HTTP Listener
# Automatically redirects HTTP traffic to HTTPS
resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.main.arn          # Attaches listener to our lb
  port              = "80"                      # Standard HTTP port
  protocol          = "HTTP"                    # Use HTTP protocol

  # Redirect all HTTP traffic to HTTPS
  default_action {
    type = "redirect"

    redirect {
      port        = "443"                       # Redirect to HTTPS port
      protocol    = "HTTPS"                     # Redirect to HTTPS protocol
      status_code = "HTTP_301"                  # Permanent redirect
    }
  }
}


variable "environment" {
  type        = string
  description = "The environment name"
}

variable "lb_security_group_id" {
  type        = string
  description = "Security group ID for the lb"
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "List of public subnet IDs for the lb"
}

variable "certificate_arn" {
  type        = string
  description = "ARN of the SSL certificate for HTTPS"
}