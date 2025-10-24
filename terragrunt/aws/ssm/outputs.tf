output "docdb_username_arn" {
  description = "Arn of the document db username parameter"
  value       = aws_ssm_parameter.docdb_username.arn
}

output "docdb_password_name" {
  description = "The document db password parameter name"
  value       = aws_ssm_parameter.docdb_password.name
}

output "docdb_password_arn" {
  description = "Arn of the document db password parameter"
  value       = aws_ssm_parameter.docdb_password.arn
}

output "docdb_username_name" {
  description = "The document db username"
  value       = aws_ssm_parameter.docdb_username.name
}

output "azure_openai_api_key_arn" {
  description = "ARN of the Azure OpenAI API key parameter"
  value       = aws_ssm_parameter.azure_openai_api_key.arn
}

output "azure_openai_endpoint_arn" {
  description = "ARN of the Azure OpenAI endpoint parameter"
  value       = aws_ssm_parameter.azure_openai_endpoint.arn
}

output "azure_openai_api_version_arn" {
  description = "ARN of the Azure OpenAI API version parameter"
  value       = aws_ssm_parameter.azure_openai_api_version.arn
}

output "canada_ca_search_uri_arn" {
  description = "ARN of the Canada.ca search URI parameter"
  value       = aws_ssm_parameter.canada_ca_search_uri.arn
}

output "canada_ca_search_api_key_arn" {
  description = "ARN of the Canada.ca search API key parameter"
  value       = aws_ssm_parameter.canada_ca_search_api_key.arn
}

output "user_agent_arn" {
  description = "ARN of the user agent parameter"
  value       = aws_ssm_parameter.user_agent.arn
}

output "jwt_secret_key_arn" {
  description = "ARN of the JWT secret key parameter"
  value       = aws_ssm_parameter.jwt_secret_key.arn
}
output "google_api_key_arn" {
  description = "ARN of the Google AI API key parameter"
  value       = aws_ssm_parameter.google_api_key.arn
}

output "gc_notify_api_key_arn" {
  description = "ARN of the GC Notify API key parameter"
  value       = aws_ssm_parameter.gc_notify_api_key.arn
}

output "google_search_engine_id_arn" {
  description = "ARN of the Google Search Engine ID parameter"
  value       = aws_ssm_parameter.google_search_engine_id.arn
}

output "adobe_analytics_url_arn" {
  description = "ARN of the Adobe Analytics URL parameter"
  value       = aws_ssm_parameter.adobe_analytics_url.arn
}
