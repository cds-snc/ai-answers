output "aws_docdb_cluster_id" {
  description = "The document db cluster id"
  value       = aws_docdb_cluster.ai-answers-docdb-cluster.id
}

output "aws_docdb_cluster_arn" {
  description = "The document db cluster arn"
  value       = aws_docdb_cluster.ai-answers-docdb-cluster.arn
}

output "aws_docdb_security_group_id" {
  description = "The security group id of the document db database"
  value       = aws_security_group.ai-answers-docdb-sg.id
}

output "docdb_uri_arn" {
  description = "ARN of the Document DB URI parameter"
  value       = aws_ssm_parameter.docdb_uri.arn
}

output "docdb5_uri_arn" {
  description = "ARN of the DocumentDB 5 URI parameter"
  value       = aws_ssm_parameter.docdb_uri.arn
}

output "docdb8_uri_arn" {
  description = "ARN of the DocumentDB 8 URI parameter, or the DocumentDB 5 URI when DocDB 8 is disabled"
  value       = var.docdb8_enabled ? aws_ssm_parameter.docdb8_uri[0].arn : aws_ssm_parameter.docdb_uri.arn
}
