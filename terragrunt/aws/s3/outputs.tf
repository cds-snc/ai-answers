output "bucket_name" {
  value = aws_s3_bucket.storage.id
}

output "bucket_arn" {
  value = aws_s3_bucket.storage.arn
}
