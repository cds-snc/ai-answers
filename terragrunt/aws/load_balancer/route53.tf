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

resource "aws_route53_record" "ai-answers-letsencrypt-bootstrap" {
  zone_id = var.hosted_zone_id
  name    = "_acme-challenge.ai-answers.alpha.canada.ca."
  type    = "TXT"
  ttl     = 60
  records = ["ucK5ahruXj2nYk07dr_UFK63d1jnkyr6lXXDPUMrSzk"]
}

resource "aws_route53_record" "ai-answers-akamai-domain-ownership" {
  zone_id = var.hosted_zone_id
  name    = "_akamai-host-challenge.ai-answers.alpha.canada.ca"
  type    = "TXT"
  ttl     = 60
  records = ["1WxKKGqmCDZaioNzps71yXa88kSG9alusI7yJsm1r-SV8GaIIlmGeAA"]
}

resource "aws_route53_record" "reponses-ai-akamai-domain-ownership" {
  zone_id = var.alternate_zone_id
  name    = "_akamai-host-challenge.reponses-ia.alpha.canada.ca"
  type    = "TXT"
  ttl     = 60
  records = ["Eb8m5M4DPFeHSxEovM7af7nlFAwTGiSewgRGFoGFsh5hpevDjoggTg"]
}

resource "aws_route53_record" "reponses-ai-letsencrypt-bootstrap" {
  zone_id = var.alternate_zone_id
  name    = "_acme-challenge.reponses-ia.alpha.canada.ca."
  type    = "TXT"
  ttl     = 60
  records = ["TATaSipM47YMfTeu-EeE8uI3kMwIM8qOCI9UVFrWqUE"]
}

