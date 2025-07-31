variable "pr_number" {
  description = "PR number for review apps"
  type        = string
}

variable "lambda_function_arn" {
  description = "The ARN of the Lambda function to attach to the load balancer"
  type        = string
}

variable "load_balancer_listener_arn" {
  description = "The ARN of the shared load balancer listener"
  type        = string
}

variable "vpc_id" {
  description = "The VPC id"
  type        = string
}