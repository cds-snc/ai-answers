resource "aws_route53_record" "ai_answers" {
  zone_id = var.hosted_zone_id
  name    = var.hosted_zone_name
  type    = "A"

  alias {
    name                   = aws_lb.ai_answers.dns_name
    zone_id                = aws_lb.ai_answers.zone_id
    evaluate_target_health = false
  }
}

# Alternate domain A record (production only when alternate_zone_id provided)
resource "aws_route53_record" "ai_answers_alt" {
  zone_id = var.alternate_zone_id
  # Use apex of alternate zone. Route53 apex record 'name' can be the zone's domain or '@'. We supply domain for clarity.
  name = var.altdomain
  type = "A"

  alias {
    name                   = aws_lb.ai_answers.dns_name
    zone_id                = aws_lb.ai_answers.zone_id
    evaluate_target_health = false
  }
}