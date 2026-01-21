#
# ElastiCache Redis cluster for AI Answers
# Using cache.t3.micro - cheapest option (~$12/month)
#

# Security group for Redis
resource "aws_security_group" "redis" {
  name        = "${var.product_name}-redis-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id

  # Inbound: Allow Redis port from VPC
  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr_block]
    description = "Allow Redis access from VPC"
  }

  # Outbound: Allow all within VPC
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [var.vpc_cidr_block]
  }

  tags = {
    Name       = "${var.product_name}-redis-sg"
    CostCentre = var.billing_code
    Terraform  = true
  }
}

# Subnet group for Redis (uses private subnets)
resource "aws_elasticache_subnet_group" "redis" {
  name        = "${var.product_name}-redis-subnet-group"
  description = "Subnet group for ${var.product_name} Redis"
  subnet_ids  = var.vpc_private_subnet_ids

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

# ElastiCache Redis cluster (single node, cheapest tier)
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.product_name}-redis"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.node_type
  num_cache_nodes      = 1
  port                 = 6379
  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]

  # No snapshots for cost savings (data is ephemeral anyway)
  snapshot_retention_limit = 0

  # Apply changes immediately in non-prod
  apply_immediately = var.env != "production"

  tags = {
    Name       = "${var.product_name}-redis"
    CostCentre = var.billing_code
    Terraform  = true
  }
}
