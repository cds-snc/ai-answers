variable "alb_arn" {
  description = "The ARN of the Application Load Balancer to associate the Web ACL with"
  type        = string
}

variable "waf_allowed_cidrs" {
  description = "List of IP addresses or CIDR blocks that are allowed to access the application. All other traffic is blocked."
  type        = list(string)
}
