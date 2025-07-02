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

variable "docdb_uri_name" {
  description = "The name of the SSM parameter containing the DocumentDB URI"
  type        = string
}

variable "product_name" {
  description = "The name of the product"
  type        = string
}

variable "billing_code" {
  description = "The billing code for cost allocation"
  type        = string
}

variable "canada_ca_search_uri_name" {
  description = "The name of the SSM parameter containing the Canada.ca search URI"
  type        = string
}

variable "canada_ca_search_api_key_name" {
  description = "The name of the SSM parameter containing the Canada.ca search API key"
  type        = string
}

variable "azure_openai_api_key_name" {
  description = "The name of the SSM parameter containing the Azure OpenAI API key"
  type        = string
}

variable "azure_openai_endpoint_name" {
  description = "The name of the SSM parameter containing the Azure OpenAI endpoint"
  type        = string
}

variable "azure_openai_api_version_name" {
  description = "The name of the SSM parameter containing the Azure OpenAI API version"
  type        = string
}

variable "user_agent_name" {
  description = "The name of the SSM parameter containing the user agent"
  type        = string
}

variable "jwt_secret_key_name" {
  description = "The name of the SSM parameter containing the JWT secret key"
  type        = string
}

variable "google_api_key_name" {
  description = "The name of the SSM parameter containing the Google API key"
  type        = string
}

variable "google_search_engine_id_name" {
  description = "The name of the SSM parameter containing the Google Search Engine ID"
  type        = string
}