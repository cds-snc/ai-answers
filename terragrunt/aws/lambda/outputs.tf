output "lambda_function_arn" {
  description = "ARN of the Lambda function"
  value       = aws_lambda_function.pr_preview.arn
}

output "lambda_function_name" {
  description = "Name of the Lambda function"
  value       = aws_lambda_function.pr_preview.function_name
}

output "lambda_function_url" {
  description = "URL of the Lambda function"
  value       = aws_lambda_function_url.pr_preview.function_url
}

output "target_group_arn" {
  description = "ARN of the target group"
  value       = aws_lb_target_group.pr_preview.arn
}

output "alb_listener_rule_arn" {
  description = "ARN of the ALB listener rule"
  value       = aws_lb_listener_rule.pr_preview.arn
}

output "preview_url" {
  description = "The preview URL for this PR"
  value       = "https://${var.pr_number}.${var.domain_name}"
}