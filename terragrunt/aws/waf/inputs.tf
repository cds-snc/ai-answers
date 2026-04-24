variable "alb_arn" {
  description = "The ARN of the Application Load Balancer to associate the Web ACL with"
  type        = string
}

variable "waf_allowed_cidrs" {
  description = "List of IP addresses or CIDR blocks that are allowed to access the application. All other traffic is blocked."
  type        = list(string)
  sensitive   = true

  validation {
    condition     = length(var.waf_allowed_cidrs) > 0
    error_message = "waf_allowed_cidrs must contain at least one CIDR entry to avoid blocking all ingress or failing WAF IP set creation."
  }

  validation {
    condition     = alltrue([for cidr in var.waf_allowed_cidrs : can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/[0-9]{1,2}$", cidr))])
    error_message = "All entries in waf_allowed_cidrs must use CIDR notation (e.g. 1.2.3.4/32). Bare IP addresses without a prefix length are not valid."
  }
}
