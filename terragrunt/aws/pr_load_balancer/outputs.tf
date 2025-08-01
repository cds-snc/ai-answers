output "pr_target_group_arn" {
  description = "ARN of the PR target group"
  value       = aws_lb_target_group.pr_review.arn
}

output "pr_listener_rule_arn" {
  description = "ARN of the PR listener rule"
  value       = aws_lb_listener_rule.pr_review.arn
}