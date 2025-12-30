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
