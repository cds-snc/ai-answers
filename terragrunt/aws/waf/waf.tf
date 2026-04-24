##############################################
# WAFv2 Web ACL — IP allowlist for staging ALB
##############################################

resource "aws_wafv2_ip_set" "allowed" {
  name               = "${var.product_name}-${var.env}-allowed-ips"
  description        = "IP addresses and CIDRs allowed to access ${var.product_name} (${var.env})"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  addresses          = var.waf_allowed_cidrs

  tags = merge(var.default_tags, {
    CostCentre = var.billing_code
  })
}

resource "aws_wafv2_web_acl" "main" {
  name        = "${var.product_name}-${var.env}-web-acl"
  description = "Block all traffic except allowed IPs for ${var.product_name} (${var.env})"
  scope       = "REGIONAL"

  default_action {
    block {}
  }

  rule {
    name     = "AllowListedIPs"
    priority = 1

    action {
      allow {}
    }

    statement {
      ip_set_reference_statement {
        arn = aws_wafv2_ip_set.allowed.arn
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.product_name}-${var.env}-allowed-ips-rule"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.product_name}-${var.env}-web-acl"
    sampled_requests_enabled   = true
  }

  tags = merge(var.default_tags, {
    CostCentre = var.billing_code
  })
}

resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = var.alb_arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}
