module "ai_answers" {
  source = "github.com/cds-snc/terraform-modules//ecs?ref=v10.2.2"

  # Cluster and service
  cluster_name = "ai-answers-cluster"
  service_name = "ai-answers-app-service"
  depends_on = [
    var.lb_listener,
    var.ecs_task_policy_attachment
  ]

  # Task/Container definition
  container_image            = "${var.ecr_repository_url}:latest"
  container_name             = "ai-answers"
  task_cpu                   = var.fargate_cpu
  task_memory                = var.fargate_memory
  container_port             = 3001
  container_host_port        = 3001
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
  task_name          = "ai-answers-task"
  task_exec_role_arn = var.iam_role_ai_answers_task_arn
  task_role_arn      = var.iam_role_ai_answers_task_arn


  # Scaling
  enable_autoscaling = true

  # Networking
  lb_target_group_arn = var.lb_target_group_arn
  security_group_ids  = [aws_security_group.ecs_tasks.id]
  subnet_ids          = var.vpc_private_subnet_ids

  # Forward logs to Sentinel
  sentinel_forwarder           = true
  sentinel_forwarder_layer_arn = "arn:aws:lambda:ca-central-1:283582579564:layer:aws-sentinel-connector-layer:100"

  billing_tag_value = var.billing_code
}


resource "aws_cloudwatch_log_stream" "ai_answers_stream" {
  name           = "ai-answers-log-stream"
  log_group_name = "/aws/ecs/ai-answers-cluster"
}