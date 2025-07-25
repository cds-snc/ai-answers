locals {
  ai_answers_release   = "ai_answers_release"
  ai_answers_pr_review = "ai-answers-apply"
}

module "github_workflow_roles" {
  count = var.env == "production" ? 1 : 0

  source            = "github.com/cds-snc/terraform-modules//gh_oidc_role?ref=v10.4.1"
  billing_tag_value = var.billing_code

  roles = [
    {
      name      = local.ai_answers_release
      repo_name = "ai-answers"
      claim     = "environment:production"
    }
  ]
}

# OIDC role for PR deployments and other non-production workflows
module "github_workflow_pr_roles" {
  count = var.env == "staging" ? 1 : 0

  source            = "github.com/cds-snc/terraform-modules//gh_oidc_role?ref=v10.4.1"
  billing_tag_value = var.billing_code

  roles = [
    {
      name      = local.ai_answers_pr_review
      repo_name = "ai-answers"
      claim     = "pull_request"  # Allow PR deployments
    }
  ]
}

resource "aws_iam_role_policy_attachment" "ai_answers_release" {
  count = var.env == "production" ? 1 : 0

  role       = local.ai_answers_release
  policy_arn = data.aws_iam_policy.admin.arn
  depends_on = [
    module.github_workflow_roles[0]
  ]
}

resource "aws_iam_role_policy_attachment" "ai_answers_pr_review" {
  count = var.env == "staging" ? 1 : 0

  role       = local.ai_answers_pr_review
  policy_arn = data.aws_iam_policy.admin.arn
  depends_on = [
    module.github_workflow_pr_roles[0]
  ]
}

data "aws_iam_policy" "admin" {
  # checkov:skip=CKV_AWS_275:This policy is required for the Terraform apply
  name = "AdministratorAccess"
}
