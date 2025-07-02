variable "vpc_id" {
  description = "The ID of the VPC"
  type        = string
}

variable "vpc_cidr_block" {
  description = "The CIDR block for the VPC"
  type        = string
}

variable "vpc_private_subnet_ids" {
  description = "A list of private subnet IDs"
  type        = list(string)
}

variable "aws_docdb_security_group_id" {
  description = "The security group ID for the DocumentDB cluster"
  type        = string
}

variable "function_name" {
  description = "The name of the Lambda function"
  type        = string
}

variable "pr_number" {
  description = "The pull request number"
  type        = string
}

variable "ecr_registry" {
  description = "The ECR registry URL"
  type        = string
}

variable "image_name" {
  description = "The name of the Docker image"
  type        = string
}

variable "docdb_uri_arn" {
  description = "ARN of the Document DB URI parameter"
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
