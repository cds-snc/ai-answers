variable "azure_openai_api_key_arn" {
  description = "The arn of the azure openai api key parameter"
  type        = string
}

variable "azure_openai_endpoint_arn" {
  description = "The arn of the azure openai endpoint parameter"
  type        = string
}

variable "azure_openai_api_version_arn" {
  description = "The arn of the azure openai api version parameter"
  type        = string
}

variable "canada_ca_search_uri_arn" {
  description = "The arn of the canada search uri parameter"
  type        = string
}
variable "canada_ca_search_api_key_arn" {
  description = "The arn of the canada search api parameter"
  type        = string
}
variable "user_agent_arn" {
  description = "The arn of the user agent parameter"
  type        = string
}
variable "jwt_secret_key_arn" {
  description = "The arn of the jwt secret key parameter"
  type        = string
}
variable "docdb_username_arn" {
  description = "The arn of the document db username parameter"
  type        = string
}

variable "docdb_password_arn" {
  description = "The arn of the document db password parameter"
  type        = string
}

variable "docdb_uri_arn" {
  description = "The arn of the document db uri parameter"
  type        = string
}

variable "google_api_key_arn" {
  description = "The ARN of the Google AI API Key SSM parameter"
  type        = string
}

variable "gc_notify_api_key_arn" {
  description = "The ARN of the GC Notify API Key SSM parameter"
  type        = string
}

variable "google_search_engine_id_arn" {
  description = "The ARN of the Google Search Engine ID SSM parameter"
  type        = string
}

variable "adobe_analytics_url_arn" {
  description = "The ARN of the Adobe Analytics URL SSM parameter"
  type        = string
}

variable "enable_ecs_exec" {
  description = "Whether to attach SSM Managed Instance Core policy for ECS Exec support"
  type        = bool
  default     = false
}
