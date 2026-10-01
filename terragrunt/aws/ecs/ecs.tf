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
      "name"      = "GC_NOTIFY_API_KEY"
      "valueFrom" = var.gc_notify_api_key_arn
    },
    {
      "name"      = "GOOGLE_SEARCH_ENGINE_ID"
      "valueFrom" = var.google_search_engine_id_arn
    },
    {
      "name"      = "REACT_APP_ADOBE_ANALYTICS_URL"
      "valueFrom" = var.adobe_analytics_url_arn
    },
    {
      "name"      = "SESSION_SECRET"
      "valueFrom" = var.session_secret_arn
    },
    {
      "name"      = "CONVERSATION_INTEGRITY_SECRET"
      "valueFrom" = var.conversation_integrity_secret_arn
    },
    {
      "name"      = "BEDROCK_ROLE_ARN"
      "valueFrom" = var.cross_account_bedrock_role_ssm_arn
    },
    {
      "name"      = "BEDROCK_REGION"
      "valueFrom" = var.bedrock_region_ssm_arn
    }
  ]
}

module "ai_answers" {
  source = "github.com/cds-snc/terraform-modules//ecs?ref=v12.1.2"

  # Cluster and service
  cluster_name = "${var.product_name}-cluster"
  service_name = "${var.product_name}-app-service"
  depends_on = [
    var.lb_listener,
    var.ai-answers-ecs-policy_attachment
  ]

  # Task/Container definition
  container_image     = "${var.ecr_repository_url}:latest"
  container_name      = var.product_name
  task_cpu            = var.fargate_cpu
  task_memory         = var.fargate_memory
  container_port      = 3001
  container_host_port = 3001
  container_secrets   = local.container_secrets
  container_environment = concat(
    [
      {
        name  = "REDIS_URL"
        value = var.redis_url
      },
      {
        name  = "S3_BUCKET_NAME"
        value = var.s3_bucket_name
      }
    ],
    var.env == "staging" ? [
      {
        name  = "REQUIRE_AUTH_FOR_CHAT"
        value = "true"
      }
    ] : []
  )

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

  # Forward logs to Sentinel over the Logs Ingestion API. The forwarder's IAM
  # role is the only credential: it federates through the Cognito pool in
  # sentinel_v2_cognito.tf to reach the Azure identity that may write to the
  # data collection rule. customer_id/shared_key stay as the rollback.
  sentinel_forwarder           = true
  sentinel_forwarder_layer_arn = "arn:aws:lambda:ca-central-1:283582579564:layer:aws-sentinel-connector-layer:270"
  sentinel_customer_id         = var.sentinel_customer_id
  sentinel_shared_key          = var.sentinel_shared_key

  sentinel_dce_endpoint = "https://dce-sentinel-forwarder-v2-153n.canadacentral-1.ingest.monitor.azure.com"
  sentinel_dcr_config = {
    AWSCloudWatchLog = {
      dcrImmutableId = "dcr-6eccfc9e7ef34cd293566d5073d551f6"
      streamName     = "Custom-AWSCloudWatchLog_v2_Input"
    }
  }
  sentinel_azure_client_id                 = "9fd2a8dc-1698-4291-a71f-19ddc3cef71f"
  sentinel_azure_tenant_id                 = "221ca1d3-b3f2-4346-8abc-88f802495c7d"
  sentinel_cognito_identity_pool_id        = aws_cognito_identity_pool.sentinel_forwarder_v2.id
  sentinel_cognito_developer_provider_name = aws_cognito_identity_pool.sentinel_forwarder_v2.developer_provider_name

  billing_tag_value = var.billing_code

  # Enabled to allow connection to DB only in staging
  enable_execute_command = var.env == "staging" ? true : false
}

resource "aws_cloudwatch_log_group" "ai_answers_group" {
  provider          = aws.core_services
  name              = "/aws/ecs/${var.product_name}-cluster"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_stream" "ai_answers_stream" {
  provider       = aws.core_services
  name           = "${var.product_name}-log-stream"
  log_group_name = aws_cloudwatch_log_group.ai_answers_group.name
}
