# 
# VPC module for React answers
# 

# Use the terraform-modules/vpc module to create the VPC for the react answers app
module "ai_answers_vpc" {
  source            = "github.com/cds-snc/terraform-modules//vpc?ref=v11.4.1"
  name              = var.product_name
  billing_tag_value = var.billing_tag_value

  # Enable 2 aviablity zones for subnets as this is requirement for the DocumentDB database
  availability_zones = 2

  # Enables VPC flow logs and blocks ssh and rdp traffic
  enable_flow_log = true
  block_ssh       = true
  block_rdp       = true

  # uses single nat gateway if not in production 
  single_nat_gateway = var.env != "production"

  # allow HTTPS connections on part 443 in/out from the internet and allow a repsonse back to/from the internet
  allow_https_request_out          = true
  allow_https_request_out_response = true
  allow_https_request_in           = true
  allow_https_request_in_response  = true
}