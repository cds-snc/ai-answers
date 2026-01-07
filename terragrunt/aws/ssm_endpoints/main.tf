#
# VPC Endpoints for SSM (required for ECS Exec)
# These endpoints allow the SSM agent in Fargate containers to communicate
# with the SSM service without going through the public internet.
#

variable "vpc_id" {
  description = "The VPC ID to create endpoints in"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for the endpoints"
  type        = list(string)
}

variable "product_name" {
  description = "Product name for resource naming"
  type        = string
}

variable "billing_code" {
  description = "Billing code for cost tracking"
  type        = string
}

# Security group for VPC endpoints
resource "aws_security_group" "ssm_endpoints" {
  name        = "${var.product_name}-ssm-endpoints-sg"
  description = "Security group for SSM VPC endpoints"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
    description = "Allow HTTPS from VPC"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = {
    Name       = "${var.product_name}-ssm-endpoints-sg"
    CostCentre = var.billing_code
    Terraform  = true
  }
}

# SSM endpoint
resource "aws_vpc_endpoint" "ssm" {
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.ca-central-1.ssm"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_subnet_ids
  security_group_ids  = [aws_security_group.ssm_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name       = "${var.product_name}-ssm-endpoint"
    CostCentre = var.billing_code
    Terraform  = true
  }
}

# SSM Messages endpoint (required for Session Manager)
resource "aws_vpc_endpoint" "ssmmessages" {
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.ca-central-1.ssmmessages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_subnet_ids
  security_group_ids  = [aws_security_group.ssm_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name       = "${var.product_name}-ssmmessages-endpoint"
    CostCentre = var.billing_code
    Terraform  = true
  }
}

# EC2 Messages endpoint (required for SSM agent communication)
resource "aws_vpc_endpoint" "ec2messages" {
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.ca-central-1.ec2messages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_subnet_ids
  security_group_ids  = [aws_security_group.ssm_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name       = "${var.product_name}-ec2messages-endpoint"
    CostCentre = var.billing_code
    Terraform  = true
  }
}
