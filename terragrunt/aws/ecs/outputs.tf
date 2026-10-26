output "ecs_tasks_security_group_id" {
  description = "Id of the ECS tasks security group"
  value       = aws_security_group.ecs_tasks.id
}
