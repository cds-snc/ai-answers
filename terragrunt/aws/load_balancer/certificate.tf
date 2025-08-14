
locals {
  # Only include alternate domain + wildcard in SANs in production
  expanded_sans = var.env == "production" && var.altdomain != "" ? concat(var.san, [var.altdomain, "*.${var.altdomain}"]) : var.san
}

resource "aws_acm_certificate" "ai_answers" {
  domain_name               = var.domain
  subject_alternative_names = local.expanded_sans
  validation_method         = "DNS"

  tags = merge(var.default_tags, {
    CostCentre = var.billing_code
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "ai_answers_certificate_validation" {
  for_each = {
    # Only validate alternate domain in production
    for dvo in aws_acm_certificate.ai_answers.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
      zone_id = (
        var.env == "production" && length(trimspace(var.altdomain)) > 0 && (
          dvo.domain_name == var.altdomain || dvo.domain_name == "*.${var.altdomain}"
        ) && length(trimspace(var.alternate_zone_id)) > 0
      ) ? var.alternate_zone_id : var.hosted_zone_id
    }
    if var.env == "production" || (dvo.domain_name != var.altdomain && dvo.domain_name != "*.${var.altdomain}")
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  type            = each.value.type
  zone_id         = each.value.zone_id
  ttl             = 60
}

resource "aws_acm_certificate_validation" "ai_answers" {
  certificate_arn         = aws_acm_certificate.ai_answers.arn
  validation_record_fqdns = [for record in aws_route53_record.ai_answers_certificate_validation : record.fqdn]
}
