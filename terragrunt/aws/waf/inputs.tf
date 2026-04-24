variable "alb_arn" {
  description = "The ARN of the Application Load Balancer to associate the Web ACL with"
  type        = string
}

variable "waf_allowed_cidrs" {
  description = "List of IP addresses or CIDR blocks that are allowed to access the application. All other traffic is blocked."
  type        = list(string)

  validation {
    condition     = length(var.waf_allowed_cidrs) > 0
    error_message = "waf_allowed_cidrs must contain at least one CIDR entry to avoid blocking all ingress or failing WAF IP set creation."
  }
}
