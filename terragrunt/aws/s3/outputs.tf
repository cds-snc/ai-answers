output "bucket_name" {
  value = aws_s3_bucket.storage.id
}

  value = aws_s3_bucket.storage.arn
}

output "s3_bucket_name_ssm_arn" {
  value = aws_ssm_parameter.s3_bucket_name.arn
}
