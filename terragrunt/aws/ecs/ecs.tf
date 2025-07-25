locals {
  container_secrets = [
    {
      "name"      = "DOCDB_URI"
      "valueFrom" = var.docdb_uri_arn
    },
    {
      "name"      = "CANADA_CA_SEARCH_URI"
      "valueFrom" = var.canada_ca_search_uri_arn
    },
    {
      "name"      = "CANADA_CA_SEARCH_API_KEY"
      "valueFrom" = var.canada_ca_search_api_key_arn
    },
    {
      "name"      = "AZURE_OPENAI_API_KEY"
      "valueFrom" = var.azure_openai_api_key_arn
    },
    {
      "name"      = "AZURE_OPENAI_ENDPOINT"
      "valueFrom" = var.azure_openai_endpoint_arn
    },
    {
      "name"      = "AZURE_OPENAI_API_VERSION"
      "valueFrom" = var.azure_openai_api_version_arn
    },
    {
      "name"      = "USER_AGENT"
      "valueFrom" = var.user_agent_arn
    },
    {
      "name"      = "JWT_SECRET_KEY"
      "valueFrom" = var.jwt_secret_key_arn
    },
    {
      "name"      = "GOOGLE_API_KEY"
      "valueFrom" = var.google_api_key_arn
    },
    {
      "name"      = "GOOGLE_SEARCH_ENGINE_ID"
      "valueFrom" = var.google_search_engine_id_arn
    }
  ]
}

module "ai_answers" {
  source = "github.com/cds-snc/terraform-modules//ecs?ref=v10.3.0"

  # Cluster and service
  cluster_name = "${var.product_name}-cluster"
  service_name = "${var.product_name}-app-service"
  depends_on = [
    var.lb_listener,
    var.ai-answers-ecs-policy_attachment
  ]

  # Task/Container definition
  container_image            = "${var.ecr_repository_url}:latest"
  container_name             = var.product_name
  task_cpu                   = var.fargate_cpu
  task_memory                = var.fargate_memory
  container_port             = 3001
  container_host_port        = 3001
  container_secrets          = local.container_secrets
  container_linux_parameters = {}
  container_ulimits = [
    {
      "hardLimit" : 1000000,
      "name" : "nofile",
      "softLimit" : 1000000
    }
  ]
  container_read_only_root_filesystem = false

  # Task definition
  task_name          = "${var.product_name}-task"
  task_exec_role_arn = var.iam_role_ai-answers-ecs-role_arn
  task_role_arn      = var.iam_role_ai-answers-ecs-role_arn

  # Scaling
  enable_autoscaling = true
  desired_count      = 1

  # Networking
  lb_target_group_arn = var.lb_target_group_arn
  security_group_ids  = [aws_security_group.ecs_tasks.id]
  subnet_ids          = var.vpc_private_subnet_ids

  # Forward logs to Sentinel
  sentinel_forwarder           = true
  sentinel_forwarder_layer_arn = "arn:aws:lambda:ca-central-1:283582579564:layer:aws-sentinel-connector-layer:199"

  billing_tag_value = var.billing_code

  # Enabled to allow connection to DB only in staging
  enable_execute_command = var.env == "staging" ? true : false
}

resource "aws_cloudwatch_log_group" "ai_answers_group" {
  name              = "/aws/ecs/${var.product_name}-cluster"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_stream" "ai_answers_stream" {
  name           = "${var.product_name}-log-stream"
  log_group_name = aws_cloudwatch_log_group.ai_answers_group.name
}
