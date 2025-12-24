variable "docdb_username" {
  description = "The username of the documentdb cluseter"
  sensitive   = true
  type        = string
}

variable "docdb_password" {
  description = "The password of the documentdb cluster"
  sensitive   = true
  type        = string
}

variable "azure_openai_api_key" {
  description = "The Azure OpenAI API key"
  sensitive   = true
  type        = string
}

variable "azure_openai_endpoint" {
  description = "The Azure OpenAI endpoint"
  sensitive   = true
  type        = string
}

variable "azure_openai_api_version" {
  description = "The Azure OpenAI API version"
  sensitive   = true
  type        = string
  default     = "2024-06-01"
}

variable "canada_ca_search_uri" {
  description = "The URI of the Canada.ca search API"
  sensitive   = true
  type        = string
}

variable "canada_ca_search_api_key" {
  description = "The API key of the Canada.ca search API"
  sensitive   = true
  type        = string
}
variable "user_agent" {
  description = "The user agent for the AI Answers service"
  sensitive   = true
  type        = string
}
variable "jwt_secret_key" {
  description = "The secret key for the JWT token"
  sensitive   = true
  type        = string
}
variable "google_api_key" {
  description = "The Google AI API key"
  sensitive   = true
  type        = string
}

variable "gc_notify_api_key" {
  description = "The GC Notify API key"
  sensitive   = true
  type        = string
}

variable "google_search_engine_id" {
  description = "The Google Search Engine ID"
  sensitive   = true
  type        = string
}

variable "adobe_analytics_url" {
  description = "The Adobe Analytics script URL"
  sensitive   = false
  type        = string
}

variable "conversation_integrity_secret" {
  description = "The secret key for interaction history integrity"
  sensitive   = true
  type        = string
}

# Temporary dummy variable to trigger workflow
variable "dummy2_trigger" {
  type        = string
  description = "Dummy variable for triggering CI"
  default     = "trigger"
}
