variable "product_name" {
  description = "Product name used for resource naming"
  type        = string
}

variable "env" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "billing_code" {
  description = "Billing code for cost tracking"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where Redis will be deployed"
  type        = string
}

variable "vpc_cidr_block" {
  description = "VPC CIDR block for security group rules"
  type        = string
}

variable "vpc_private_subnet_ids" {
  description = "List of private subnet IDs for the subnet group"
  type        = list(string)
}

variable "node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"  # Cheapest option: ~$12/month, 0.5GB RAM
}
