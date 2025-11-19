# 
# Hosted zone for React Answers app
#

resource "aws_route53_zone" "ai_answers" {
  name = var.domain

  tags = {
    Name       = "${var.product_name}-zone"
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_route53_zone" "alternate" {
  name = var.altdomain

  tags = {
    Name       = "${var.product_name}-alt-zone"
    CostCentre = var.billing_code
    Terraform  = true
  }
}