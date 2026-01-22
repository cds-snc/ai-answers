resource "aws_s3_bucket" "storage" {
  bucket = "${var.product_name}-${var.env}-storage"

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "storage" {
  bucket = aws_s3_bucket.storage.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "storage" {
  bucket = aws_s3_bucket.storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration_v2" "storage" {
  bucket = aws_s3_bucket.storage.id

  rule {
    id     = "expire-all-objects-90-days"
    status = "Enabled"

    expiration {
      days = 90
    }
  }
}

#
# Network Integration (VPC Gateway Endpoint)
# Ensures traffic to S3 stays within the AWS network
#

data "aws_region" "current" {}

# Lookup route tables associated with the private subnets
data "aws_route_table" "private" {
  for_each = toset(var.vpc_private_subnet_ids)
  subnet_id = each.value
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id       = var.vpc_id
  service_name = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"

  # Attach to all route tables used by private subnets
  route_table_ids = distinct([for rt in data.aws_route_table.private : rt.route_table_id])

  tags = {
    Name       = "${var.product_name}-${var.env}-s3-endpoint"
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_ssm_parameter" "s3_bucket_name" {
  name  = "/${var.product_name}/${var.env}/s3_bucket_name"
  type  = "String"
  value = aws_s3_bucket.storage.id

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}
