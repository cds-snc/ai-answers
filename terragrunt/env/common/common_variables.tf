variable "account_id" {
  description = "(Required) The account ID to perform actions on."
  type        = string
}

variable "cbs_satellite_bucket_name" {
  description = "(Required) Name of the Cloud Based Sensor S3 satellite bucket"
  type        = string
}

variable "domain" {
  description = "(Required) Domain name to deploy to"
  type        = string
}

variable "san" {
  description = "(Optional) List of Subject Alternative Names (SANs) for the certificate."
  type        = list(string)
  default     = []
}

variable "env" {
  description = "The current running environment"
  type        = string
}

variable "product_name" {
  description = "(Required) The name of the product you are deploying."
  type        = string
}

variable "region" {
  description = "The current AWS region"
  type        = string
}

variable "billing_code" {
  description = "The billing code to tag our resources with"
  type        = string
}

variable "billing_tag_value" {
  description = "The value we use to track billing"
  type        = string
}

variable "default_tags" {
  description = "The default tags we apply to all resources"
  type        = map(string)
}