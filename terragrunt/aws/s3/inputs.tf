

variable "vpc_id" {
  description = "The VPC ID"
  type        = string
}

variable "vpc_private_subnet_ids" {
  description = "List of private subnet IDs"
  type        = list(string)
}
