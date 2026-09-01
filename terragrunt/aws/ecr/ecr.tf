resource "aws_ecr_repository" "ai_answers" {
  name                 = var.product_name
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}