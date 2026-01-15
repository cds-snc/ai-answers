resource "aws_ssm_parameter" "docdb_username" {
  name  = "docdb_username"
  type  = "SecureString"
  value = var.docdb_username

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_ssm_parameter" "docdb_password" {
  name  = "docdb_password"
  type  = "SecureString"
  value = var.docdb_password

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_ssm_parameter" "azure_openai_api_key" {
  name  = "azure_openai_api_key"
  type  = "SecureString"
  value = var.azure_openai_api_key

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_ssm_parameter" "azure_openai_endpoint" {
  name  = "azure_openai_endpoint"
  type  = "SecureString"
  value = var.azure_openai_endpoint

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_ssm_parameter" "azure_openai_api_version" {
  name  = "azure_openai_api_version"
  type  = "SecureString"
  value = var.azure_openai_api_version

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_ssm_parameter" "canada_ca_search_uri" {
  name  = "canada_ca_search_uri"
  type  = "SecureString"
  value = var.canada_ca_search_uri

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_ssm_parameter" "canada_ca_search_api_key" {
  name  = "canada_ca_search_api_key"
  type  = "SecureString"
  value = var.canada_ca_search_api_key

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_ssm_parameter" "user_agent" {
  name  = "user_agent"
  type  = "SecureString"
  value = var.user_agent

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_ssm_parameter" "jwt_secret_key" {
  name  = "jwt_secret_key"
  type  = "SecureString"
  value = var.jwt_secret_key

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}
resource "aws_ssm_parameter" "google_api_key" {
  name  = "google_api_key"
  type  = "SecureString"
  value = var.google_api_key

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_ssm_parameter" "gc_notify_api_key" {
  name  = "gc_notify_api_key"
  type  = "SecureString"
  value = var.gc_notify_api_key

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_ssm_parameter" "google_search_engine_id" {
  name  = "google_search_engine_id"
  type  = "SecureString"
  value = var.google_search_engine_id

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_ssm_parameter" "adobe_analytics_url" {
  name  = "adobe_analytics_url"
  type  = "SecureString"
  value = var.adobe_analytics_url

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}
resource "aws_ssm_parameter" "session_secret" {
  name  = "session_secret"
  type  = "SecureString"
  value = var.session_secret

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_ssm_parameter" "conversation_integrity_secret" {
  name  = "conversation_integrity_secret"
  type  = "SecureString"
  value = var.conversation_integrity_secret

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_ssm_parameter" "cross_account_bedrock_role" {
  name  = "cross_account_bedrock_role"
  type  = "SecureString"
  value = var.cross_account_bedrock_role_arn

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_ssm_parameter" "bedrock_region" {
  name  = "bedrock_region"
  type  = "SecureString"
  value = var.bedrock_region

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}
