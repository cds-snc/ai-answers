variable "hosted_zone_id" {
  description = "The hosted zone ID to create DNS records in"
  type        = string
}

variable "hosted_zone_name" {
  description = "Route53 hosted zone ID that will hold our DNS records"
  type        = string
}

variable "vpc_id" {
  description = "The VPC id of the url shortener"
  type        = string
}

variable "vpc_cidr_block" {
  description = "IP CIDR block of the VPC"
  type        = string
}

variable "vpc_public_subnet_ids" {
  description = "Public subnet ids of the VPC"
  type        = list(string)
}



variable "alternate_zone_id" {
  description = "Hosted zone ID for the alternate domain (if any)"
  type        = string
  default     = ""
}


