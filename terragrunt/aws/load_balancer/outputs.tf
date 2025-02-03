output "lb_arn" {
  description = "The ARN of the application load balancer"
  value       = aws_lb.main.arn
}


output "lb_dns_name" {
  description = "The DNS name of the application load balancer"
  value       = aws_lb.main.dns_name
}

output "https_listener_arn" {
  description = "The ARN of the HTTPS listener"
  value       = aws_lb_listener.https.arn
}


output "lb_zone_id" {
  description = "The canonical hosted zone ID of the load balancer"
  value       = aws_lb.main.zone_id
}