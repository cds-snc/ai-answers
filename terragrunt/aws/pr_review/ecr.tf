#
# Holds the AI Answers app images used by the Lambda preview service
#
resource "aws_ecr_repository" "ai_answers_pr_review_repository" {
  count = var.env == "staging" ? 1 : 0

  name                 = "ai_answers_pr_review"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}