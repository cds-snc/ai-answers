
resource "aws_acm_certificate" "ai_answers" {
  domain_name               = var.domain
  subject_alternative_names = var.san
  validation_method         = "DNS"

  tags = {
    "CostCentre" = var.billing_code
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "ai_answers_certificate_validation" {
  zone_id = var.hosted_zone_id

  for_each = {
    for dvo in aws_acm_certificate.ai_answers.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  type            = each.value.type

  ttl = 60
}

resource "aws_acm_certificate_validation" "ai_answers" {
  certificate_arn         = aws_acm_certificate.ai_answers.arn
  validation_record_fqdns = [for record in aws_route53_record.ai_answers_certificate_validation : record.fqdn]
}
