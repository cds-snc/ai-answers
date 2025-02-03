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