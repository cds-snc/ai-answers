output "lb_listener" {
  description = "Load balancer listener of AI Answers"
  value       = aws_lb_listener.ai_answers_listener
}

output "lb_target_group_arn" {
  description = "Arn of the Load balancer target group"
  value       = aws_lb_target_group.ai_answers.arn
}

output "ai_answers_load_balancer_sg" {
  description = "Security group of the Load balancer"
  value       = aws_security_group.ai_answers_load_balancer_sg.id
}