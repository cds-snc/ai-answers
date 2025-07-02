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