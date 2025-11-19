variable "vpc_id" {
  description = "VPC ID to attach the Lambda's security group to"
  type        = string
}

variable "vpc_private_subnet_ids" {
  description = "List of private subnet IDs where Lambda functions will be deployed"
  type        = list(string)
}

variable "ai_answers_docdb_security_group_id" {
  description = "Security group ID for the ai-answers DocumentDB"
  type        = string
}

variable "ai_answers_lambda_client_iam_role_name" {
  description = "IAM role name for ai-answers client Lambda"
  type        = string
}
variable "docdb_uri_arn" {
  description = "ARN for the docdb_uri SSM parameter"
  type        = string
}

variable "docdb_username_arn" {
  description = "ARN for the docdb_username SSM parameter"
  type        = string
}

variable "docdb_password_arn" {
  description = "ARN for the docdb_password SSM parameter"
  type        = string
}

variable "azure_openai_api_key_arn" {
  description = "ARN for the azure_openai_api_key SSM parameter"
  type        = string
}

variable "azure_openai_endpoint_arn" {
  description = "ARN for the azure_openai_endpoint SSM parameter"
  type        = string
}

variable "azure_openai_api_version_arn" {
  description = "ARN for the azure_openai_api_version SSM parameter"
  type        = string
}

variable "canada_ca_search_uri_arn" {
  description = "ARN for the canada_ca_search_uri SSM parameter"
  type        = string
}

variable "canada_ca_search_api_key_arn" {
  description = "ARN for the canada_ca_search_api_key SSM parameter"
  type        = string
}

variable "jwt_secret_key_arn" {
  description = "ARN for the jwt_secret_key SSM parameter"
  type        = string
}

variable "user_agent_arn" {
  description = "ARN for the user_agent SSM parameter"
  type        = string
}

variable "google_api_key_arn" {
  description = "ARN for the google_api_key SSM parameter"
  type        = string
}

variable "gc_notify_api_key_arn" {
  description = "ARN for the gc_notify_api_key SSM parameter"
  type        = string
}

variable "google_search_engine_id_arn" {
  description = "ARN for the google_search_engine_id SSM parameter"
  type        = string
}
