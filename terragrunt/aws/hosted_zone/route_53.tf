# 
# Hosted zone for React Answers app
#

resource "aws_route53_zone" "ai_answers" {
  name = var.domain

  tags = {
    Name       = "${var.product_name}-${var.env}-zone"
    CostCentre = var.billing_code
    Terraform  = true
  }
}