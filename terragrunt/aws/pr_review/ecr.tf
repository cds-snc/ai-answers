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

resource "aws_ecr_lifecycle_policy" "ai_answers_pr_review_policy" {
  count = var.env == "staging" ? 1 : 0

  repository = aws_ecr_repository.ai_answers_pr_review_repository[0].name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 30 images"

      selection = {
        tagStatus     = "tagged"
        tagPrefixList = ["v"]
        countType     = "imageCountMoreThan"
        countNumber   = 30
      }

      action = {
        type = "expire"
      }
    }]
  })
}