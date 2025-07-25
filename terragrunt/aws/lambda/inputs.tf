variable "pr_number" {
  description = "The PR number for this preview environment"
  type        = number
}

variable "ecr_repository_url" {
  description = "URL of the ECR repository"
  type        = string
}

variable "lambda_role_arn" {
  description = "ARN of the Lambda execution role"
  type        = string
}

variable "memory_size" {
  description = "Lambda function memory size in MB"
  type        = number
  default     = 1024
}

variable "timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 300
}

variable "vpc_id" {
  description = "VPC ID for the Lambda function"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for the Lambda function"
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security group IDs for the Lambda function"
  type        = list(string)
}

variable "alb_listener_arn" {
  description = "ARN of the ALB listener"
  type        = string
}

variable "domain_name" {
  description = "Domain name for the PR preview (e.g., ai-answers.cdssandbox.xyz)"
  type        = string
}

variable "environment_variables" {
  description = "Environment variables for the Lambda function"
  type        = map(string)
  default     = {}
}

# SSM Parameter ARNs for secrets
variable "docdb_uri_arn" {
  description = "ARN of the Document DB URI parameter"
  type        = string
}

variable "azure_openai_api_key_arn" {
  description = "ARN of the Azure OpenAI API key parameter"
  type        = string
}

variable "azure_openai_endpoint_arn" {
  description = "ARN of the Azure OpenAI endpoint parameter"
  type        = string
}

variable "azure_openai_api_version_arn" {
  description = "ARN of the Azure OpenAI API version parameter"
  type        = string
}

variable "canada_ca_search_uri_arn" {
  description = "ARN of the Canada.ca search URI parameter"
  type        = string
}

variable "canada_ca_search_api_key_arn" {
  description = "ARN of the Canada.ca search API key parameter"
  type        = string
}

variable "user_agent_arn" {
  description = "ARN of the User Agent parameter"
  type        = string
}

variable "jwt_secret_key_arn" {
  description = "ARN of the JWT Secret Key parameter"
  type        = string
}

variable "google_api_key_arn" {
  description = "ARN of the Google AI API key parameter"
  type        = string
}

variable "google_search_engine_id_arn" {
  description = "ARN of the Google Search Engine ID parameter"
  type        = string
}