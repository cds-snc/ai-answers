terraform {
  source = "../../../aws//load_balancer"
}

include {
  path = find_in_parent_folders("root.hcl")
}