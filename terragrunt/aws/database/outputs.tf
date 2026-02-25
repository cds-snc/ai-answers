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

# DocumentDB v8 Outputs
output "aws_docdb_v8_cluster_id" {
  description = "The document db v8 cluster id"
  value       = aws_docdb_cluster.ai-answers-docdb-v8-cluster.id
}

output "aws_docdb_v8_cluster_arn" {
  description = "The document db v8 cluster arn"
  value       = aws_docdb_cluster.ai-answers-docdb-v8-cluster.arn
}

output "docdb_uri_v8_arn" {
  description = "ARN of the Document DB v8 URI parameter"
  value       = aws_ssm_parameter.docdb_uri_v8.arn
}