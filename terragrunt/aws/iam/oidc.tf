locals {
  ai_answers_release = "ai-answers-ecr-deploy-role"
}

#
# Create the OIDC role used by the GitHub workflow
# This role can be assumed by GitHub workflows based on the claim
#
module "github_workflow_roles" {
  count = var.env == "production" ? 1 : 0

  source            = "github.com/cds-snc/terraform-modules//gh_oidc_role?ref=v10.4.1"
  billing_tag_value = var.billing_code

  roles = [
    {
      name      = local.ai_answers_release
      repo_name = "ai-answers"
      claim     = "ref:refs/tags/v*"
    }
  ]
}

#
# IAM policy allowing ECR deploy and ECS update
#
resource "aws_iam_policy" "ecr_deploy_policy" {
  count = var.env == "production" ? 1 : 0

  name        = "ai-answers-ecr-deploy-policy"
  description = "Policy for GitHub Actions to deploy to ECR and update ECS"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices"
        ]
        Resource = "arn:aws:ecs:ca-central-1:730335533085:service/ai-answers-prod-cluster/ai-answers-prod-app-service"
      }
    ]
  })
}

#
# Attach the IAM policy to the OIDC role
#
resource "aws_iam_role_policy_attachment" "ai_answers_release" {
  count = var.env == "production" ? 1 : 0

  role       = local.ai_answers_release
  policy_arn = aws_iam_policy.ecr_deploy_policy[0].arn
  depends_on = [
    module.github_workflow_roles[0]
  ]
}
