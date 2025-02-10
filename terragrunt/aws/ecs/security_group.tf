###
# Security groups for ECS
###

resource "aws_security_group" "ecs_tasks" {
  name        = "ai-answers-security-group"
  description = "Allow inbound and outbound traffic for AI Answers"
  vpc_id      = var.vpc_id

  ingress {
    protocol        = "tcp"
    description     = "Allow the ecs security group to receive traffic only from the load balancer on port 3001"
    security_groups = ["${var.ai_answers_load_balancer_sg}"]
    self            = "false"
    from_port       = "3001"
    to_port         = "3001"
  }

  egress {
    description = "Allow ecs security group to send all traffic"
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    "CostCentre" = var.billing_code
  }
}

###
# Traffic to DocumentDB should only come from ECS
###

resource "aws_security_group_rule" "ecs_egress_database" {
  description              = "Allow ECS to talk to the DocumentDB cluster"
  type                     = "egress"
  from_port                = 27017
  to_port                  = 27017
  protocol                 = "TCP"
  source_security_group_id = var.proxy_security_group_id
  security_group_id        = aws_security_group.ecs_tasks.id
}

resource "aws_security_group_rule" "database_ingress_ecs" {
  description              = "Allow DocumentDB cluster to receive requests from ECS"
  type                     = "ingress"
  from_port                = 27017
  to_port                  = 27017
  protocol                 = "TCP"
  source_security_group_id = aws_security_group.ecs_tasks.id
  security_group_id        = var.proxy_security_group_id
}