###
# Security groups for ECS
###

resource "aws_security_group" "ecs_tasks" {
  name        = "ai-answers-security-group"
  description = "Allow inbound and outbound traffic for AI Answers"
  vpc_id      = var.vpc_id

  tags = {
    "CostCentre" = var.billing_code
  }
}

resource "aws_security_group_rule" "ecs_ingress_lb" {
  description              = "Allow the ecs security group to receive traffic only from the load balancer on port 3001"
  type                     = "ingress"
  from_port                = 3001
  to_port                  = 3001
  protocol                 = "tcp"
  source_security_group_id = var.ai_answers_load_balancer_sg
  security_group_id        = aws_security_group.ecs_tasks.id
}

resource "aws_security_group_rule" "ecs_egress_all" {
  #checkov:skip=CKV_AWS_382 # We need to allow all traffic for ECS to work
  description = "Allow ECS security group to send all traffic"
  type        = "egress"
  from_port   = 0
  to_port     = 0
  protocol    = "-1"

  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ecs_tasks.id
}

###
# Traffic to DocumentDB should only come from ECS
###

resource "aws_security_group_rule" "ecs_egress_database" {
  description              = "Allow ECS to talk to the DocumentDB cluster"
  type                     = "egress"
  from_port                = 27017
  to_port                  = 27017
  protocol                 = "tcp"
  source_security_group_id = var.aws_docdb_security_group_id
  security_group_id        = aws_security_group.ecs_tasks.id
}

resource "aws_security_group_rule" "database_ingress_ecs" {
  description              = "Allow DocumentDB cluster to receive requests from ECS"
  type                     = "ingress"
  from_port                = 27017
  to_port                  = 27017
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs_tasks.id
  security_group_id        = var.aws_docdb_security_group_id
}