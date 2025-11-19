resource "aws_security_group" "ai_answers_load_balancer_sg" {
  name        = "ai_answers_load_balancer_sg"
  description = "Security group for load balancer"
  vpc_id      = var.vpc_id

  ingress {
    protocol    = "tcp"
    from_port   = 443
    to_port     = 443
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow HTTPS inbound traffic"
  }
  egress {
    protocol    = "tcp"
    from_port   = 3001
    to_port     = 3001
    cidr_blocks = [var.vpc_cidr_block] #tfsec:ignore:AWS008
  }

  tags = merge(var.default_tags, {
    CostCentre = var.billing_code
  })
}