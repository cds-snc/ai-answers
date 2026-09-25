output "ecs_tasks_security_group_id" {
  description = "Id of the ECS tasks security group"
  value       = aws_security_group.ecs_tasks.id
}
output "sentinel_forwarder_cognito_identity_pool_id" {
  description = "Id of the Cognito identity pool the Sentinel forwarder federates through"
  value       = aws_cognito_identity_pool.sentinel_forwarder_v2.id
}
