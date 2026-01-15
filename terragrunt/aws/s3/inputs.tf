variable "product_name" {
  description = "The name of the product"
  type        = string
}

variable "env" {
  description = "The environment name"
  type        = string
}

variable "billing_code" {
  description = "The billing code to tag our resources with"
  type        = string
}

variable "vpc_id" {
  description = "The VPC ID"
  type        = string
}

variable "vpc_private_subnet_ids" {
  description = "List of private subnet IDs"
  type        = list(string)
}
