#
# Security group allowing the AI Answers PR review environment to communicate
# with DocumentDB, and receive HTTPS requests.
#
resource "aws_security_group" "ai_answers_lambda_pr_review" {
  count = var.env == "staging" ? 1 : 0

  name        = "ai-answers-lambda-pr-review"
  description = "AI Answers Lambda PR review environment"
  vpc_id      = var.vpc_id
}

resource "aws_security_group_rule" "internet_ingress_to_ai_answers_lambda" {
  count = var.env == "staging" ? 1 : 0

  description       = "Allow inbound connections from the internet to the AI Answers lambda PR review env"
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  security_group_id = aws_security_group.ai_answers_lambda_pr_review[0].id
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group_rule" "ai_answers_lambda_egress_to_internet" {
  count = var.env == "staging" ? 1 : 0

  description       = "Allow outbound connections from AI Answers lambda PR review env to the internet"
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  security_group_id = aws_security_group.ai_answers_lambda_pr_review[0].id
  cidr_blocks       = ["0.0.0.0/0"]
}



resource "aws_security_group_rule" "ai_answers_lambda_egress_docdb" {
  count = var.env == "staging" ? 1 : 0

  description              = "Security group rule for AI Answers egress to DocumentDB"
  type                     = "egress"
  from_port                = 27017
  to_port                  = 27017
  protocol                 = "tcp"
  security_group_id        = aws_security_group.ai_answers_lambda_pr_review[0].id
  source_security_group_id = var.ai_answers_docdb_security_group_id
}

resource "aws_security_group_rule" "docdb_ai_answers_lambda_ingress" {
  count = var.env == "staging" ? 1 : 0

  description              = "Security group rule for AI Answers DocumentDB ingress"
  type                     = "ingress"
  from_port                = 27017
  to_port                  = 27017
  protocol                 = "tcp"
  security_group_id        = var.ai_answers_docdb_security_group_id
  source_security_group_id = aws_security_group.ai_answers_lambda_pr_review[0].id
}
