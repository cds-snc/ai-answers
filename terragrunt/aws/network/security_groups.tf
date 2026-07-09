# 
# Security Groups for the VPC React Answers app 
#

# Define local variables for use in this module/file
locals {
  # The name of the Security Group, derived from the product name variable
  sg_app_name = "${var.product_name}_app_sg"
}

# Create a Security Group for the React Answers App
resource "aws_security_group" "app" {
  provider = aws.core_services
  # Use the SG name defined in the local variable
  name = local.sg_app_name

  # Short description for clarity in the AWS console
  description = "Security Group for the React Answers App"

  # ID of the VPC where this SG will be created
  vpc_id = module.ai_answers_vpc.vpc_id

  # Ensures Terraform removes associated rules upon SG destruction or modification
  revoke_rules_on_delete = true

  # Tags for cost allocation and identification
  tags = {
    CostCentre = var.billing_code
    Name       = local.sg_app_name
  }
}

# Create an egress rule to allow HTTPS traffic to the internet
resource "aws_security_group_rule" "app_egress_https" {
  # Brief description to identify the purpose of this rule
  description = "Allow HTTPS (TCP 443) egress to the internet"

  # Egress rule allows outbound traffic
  type = "egress"

  # The TCP port range (443 to 443) for HTTPS
  from_port = 443
  to_port   = 443
  protocol  = "tcp"

  # Public internet CIDR block
  cidr_blocks = ["0.0.0.0/0"]

  # Attach the rule to the SG created above
  security_group_id = aws_security_group.app.id
}