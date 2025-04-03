variable "vpc_id" {
  description = "The VPC id of AI Answers"
  type        = string
}

variable "vpc_cidr_block" {
  description = "List of cidr block ips for the React Answers VPC app"
  type        = string
}

variable "vpc_private_subnet_ids" {
  description = "Private subnet ids of the AI Answers VPC"
  type        = list(string)
}

variable "ecr_repository_arn" {
  description = "Arn of the ECR Repository"
  type        = string
}

variable "ecr_repository_url" {
  description = "URL of the AI Answers ECR"
  type        = string
}

variable "fargate_cpu" {
  description = "Fargate CPU units"
  type        = number
  default     = 256
}

variable "fargate_memory" {
  description = "Fargate Memory units"
  type        = number
  default     = 512
}

variable "iam_role_ai-answers-ecs-role_arn" {
  description = "Arn of the IAM AI Answers task role"
  type        = string
}

variable "ai-answers-ecs-policy_attachment" {
  description = "ECS Task execution policy attachment"
  type        = string
}


variable "lb_listener" {
  description = "Load balancer listener for the AI Answers"
  type        = string
}

variable "lb_target_group_arn" {
  description = "Arn of the load balancer target group"
  type        = string
}

variable "ai_answers_load_balancer_sg" {
  description = "Security group of the Load balancer"
  type        = string
}

variable "aws_docdb_security_group_id" {
  description = "Security group of the DocumentDB database"
  type        = string
}

variable "sentinel_customer_id" {
  type      = string
  sensitive = true
}

variable "sentinel_shared_key" {
  type      = string
  sensitive = true
}

variable "docdb_uri_arn" {
  description = "ARN of the Document DB URI parameter"
  type        = string
}

variable "azure_openai_api_key_arn" {
  description = "ARN of the Azure OpenAI API key parameter"
  type        = string
}

variable "azure_openai_endpoint_arn" {
  description = "ARN of the Azure OpenAI endpoint parameter"
  type        = string
}

variable "azure_openai_api_version_arn" {
  description = "ARN of the Azure OpenAI API version parameter"
  type        = string
}

variable "canada_ca_search_uri_arn" {
  description = "ARN of the Canada.ca search URI parameter"
  type        = string
}

variable "canada_ca_search_api_key_arn" {
  description = "ARN of the Canada.ca search API key parameter"
  type        = string
}
variable "user_agent_arn" {
  description = "ARN of the User Agent parameter"
  type        = string
}
variable "jwt_secret_key_arn" {
  description = "ARN of the JWT Secret Key parameter"
  type        = string
}