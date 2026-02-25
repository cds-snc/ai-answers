#
# Terraform code to create an Amazon DocumentDB cluster 
#

# Retrieve the username and password from the SSM parameter store
data "aws_ssm_parameter" "docdb_username" {
  name = var.docdb_username_name
}

data "aws_ssm_parameter" "docdb_password" {
  name = var.docdb_password_name
}

# Create a security group for the DocumentDB cluster
resource "aws_security_group" "ai-answers-docdb-sg" {
  name        = "${var.product_name}-example-docdb-sg"
  description = "Security group for DocumentDB for the AI Answers app"
  vpc_id      = var.vpc_id

  # Inbound rules (ingress): Allow traffic on the DocDB port (27017) from your VPC CIDR
  ingress {
    from_port   = 27017
    to_port     = 27017
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr_block]
  }

  # Outbound rules (egress): Allow all traffic outbound but only to destinations within the cidr block. 
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [var.vpc_cidr_block]
  }

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

# DocumentDB Subnet Group
resource "aws_docdb_subnet_group" "ai-answers-docdb-subnet-group" {
  name        = "${var.product_name}-example-docdb-subnet-group"
  description = "Subnet group for DocumentDB for the ${var.product_name} ${var.env} app"
  subnet_ids  = var.vpc_private_subnet_ids

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

# DocumentDB Cluster Parameter Group
resource "aws_docdb_cluster_parameter_group" "ai-answers-docdb-cluster-parameter-group" {
  name        = "${var.product_name}-docdb-cluster-parameter-group"
  family      = "docdb5.0" # Latest engine version
  description = "Parameter group for ${var.product_name} ${var.env} DocumentDB"

  # Parameter overrides. Enabled TLS encryption.
  parameter {
    name  = "tls"
    value = "enabled"
  }

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

# DocumentDB Cluster
resource "aws_docdb_cluster" "ai-answers-docdb-cluster" {
  cluster_identifier              = "${var.product_name}-docdb-cluster"
  engine                          = "docdb"
  engine_version                  = "5.0.0" # DocDB engine version
  master_username                 = data.aws_ssm_parameter.docdb_username.value
  master_password                 = data.aws_ssm_parameter.docdb_password.value
  db_subnet_group_name            = aws_docdb_subnet_group.ai-answers-docdb-subnet-group.name
  vpc_security_group_ids          = [aws_security_group.ai-answers-docdb-sg.id] # SG for the DocumentDB cluster
  storage_encrypted               = true
  apply_immediately               = true
  skip_final_snapshot             = true
  port                            = 27017
  db_cluster_parameter_group_name = aws_docdb_cluster_parameter_group.ai-answers-docdb-cluster-parameter-group.name

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

# DocumentDB Cluster Instance
resource "aws_docdb_cluster_instance" "ai-answers-docdb-instance" {
  count              = var.docdb_instance_count
  identifier         = "${var.product_name}-docdb-instance"
  cluster_identifier = aws_docdb_cluster.ai-answers-docdb-cluster.id
  instance_class     = "db.t3.medium" # Increased from db.t3.medium for higher throughput testing
  engine             = "docdb"
  apply_immediately  = true

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

# Create an ssm parameter to store the docdb uri
resource "aws_ssm_parameter" "docdb_uri" {
  name       = "docdb_uri"
  type       = "SecureString"
  value      = "mongodb://${data.aws_ssm_parameter.docdb_username.value}:${data.aws_ssm_parameter.docdb_password.value}@${aws_docdb_cluster.ai-answers-docdb-cluster.endpoint}:27017/?tls=true&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false"
  depends_on = [aws_docdb_cluster_instance.ai-answers-docdb-instance]
}

#
# DocumentDB v8 Cluster (Side-by-side migration)
#

# DocumentDB v8 Cluster Parameter Group
resource "aws_docdb_cluster_parameter_group" "ai-answers-docdb-v8-cluster-parameter-group" {
  name        = "${var.product_name}-docdb-v8-cluster-parameter-group"
  family      = "docdb8.0"
  description = "Parameter group for ${var.product_name} ${var.env} DocumentDB v8"

  parameter {
    name  = "tls"
    value = "enabled"
  }

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

# DocumentDB v8 Cluster
resource "aws_docdb_cluster" "ai-answers-docdb-v8-cluster" {
  cluster_identifier              = "${var.product_name}-docdb-v8-cluster"
  engine                          = "docdb"
  engine_version                  = "8.0.0"
  master_username                 = data.aws_ssm_parameter.docdb_username.value
  master_password                 = data.aws_ssm_parameter.docdb_password.value
  db_subnet_group_name            = aws_docdb_subnet_group.ai-answers-docdb-subnet-group.name
  vpc_security_group_ids          = [aws_security_group.ai-answers-docdb-sg.id]
  storage_encrypted               = true
  apply_immediately               = true
  skip_final_snapshot             = true
  port                            = 27017
  db_cluster_parameter_group_name = aws_docdb_cluster_parameter_group.ai-answers-docdb-v8-cluster-parameter-group.name

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

# DocumentDB v8 Cluster Instance
resource "aws_docdb_cluster_instance" "ai-answers-docdb-v8-instance" {
  count              = var.docdb_instance_count
  identifier         = "${var.product_name}-docdb-v8-instance"
  cluster_identifier = aws_docdb_cluster.ai-answers-docdb-v8-cluster.id
  instance_class     = "db.t3.medium"
  engine             = "docdb"
  apply_immediately  = true

  tags = {
    CostCentre = var.billing_code
    Terraform  = true
  }
}

# Create an ssm parameter to store the docdb v8 uri
resource "aws_ssm_parameter" "docdb_uri_v8" {
  name       = "docdb_uri_v8"
  type       = "SecureString"
  value      = "mongodb://${data.aws_ssm_parameter.docdb_username.value}:${data.aws_ssm_parameter.docdb_password.value}@${aws_docdb_cluster.ai-answers-docdb-v8-cluster.endpoint}:27017/?tls=true&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false"
  depends_on = [aws_docdb_cluster_instance.ai-answers-docdb-v8-instance]
}
