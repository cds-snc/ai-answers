#!/bin/bash
set -euo pipefail

PR_NUMBER="$1"
FUNCTION_NAME="$2"
REGISTRY="$3"
IMAGE="$4"
ROLE_ARN="$5"

FULL_FUNCTION_NAME="${FUNCTION_NAME}-${PR_NUMBER}"
IMAGE_TAG="${PR_NUMBER}"

echo "Deploying AI Answers function: $FULL_FUNCTION_NAME"

# Fetch environment variables from SSM Parameter Store
echo "Fetching environment variables from SSM Parameter Store..."
# The parameter names to fetch
PARAMETER_NAMES1="docdb_uri azure_openai_api_key azure_openai_endpoint azure_openai_api_version canada_ca_search_uri canada_ca_search_api_key jwt_secret_key user_agent google_api_key"
PARAMETER_NAMES2="gc_notify_api_key google_search_engine_id"

# Fetch all parameters in two batches due to AWS limit of 10 per request
PARAMETERS_JSON1=$(aws ssm get-parameters --names $PARAMETER_NAMES1 --with-decryption --query 'Parameters' --output json)
PARAMETERS_JSON2=$(aws ssm get-parameters --names $PARAMETER_NAMES2 --with-decryption --query 'Parameters' --output json)
PARAMETERS_JSON=$(jq -s 'add' <(echo "$PARAMETERS_JSON1") <(echo "$PARAMETERS_JSON2"))

# Check for missing parameters
INVALID_PARAMS1=$(aws ssm get-parameters --names $PARAMETER_NAMES1 --with-decryption --query 'InvalidParameters' --output text)
INVALID_PARAMS2=$(aws ssm get-parameters --names $PARAMETER_NAMES2 --with-decryption --query 'InvalidParameters' --output text)
if ([ "$INVALID_PARAMS1" != "None" ] && [ -n "$INVALID_PARAMS1" ]) || ([ "$INVALID_PARAMS2" != "None" ] && [ -n "$INVALID_PARAMS2" ]); then
  echo "Error: Missing or invalid parameters: $INVALID_PARAMS1 $INVALID_PARAMS2"
  exit 1
fi

# Extract each parameter value using jq
DOCDB_URI=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="docdb_uri") | .Value')
AZURE_OPENAI_API_KEY=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="azure_openai_api_key") | .Value')
AZURE_OPENAI_ENDPOINT=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="azure_openai_endpoint") | .Value')
AZURE_OPENAI_API_VERSION=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="azure_openai_api_version") | .Value')
CANADA_CA_SEARCH_URI=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="canada_ca_search_uri") | .Value')
CANADA_CA_SEARCH_API_KEY=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="canada_ca_search_api_key") | .Value')
JWT_SECRET_KEY=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="jwt_secret_key") | .Value')
USER_AGENT=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="user_agent") | .Value')
GOOGLE_API_KEY=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="google_api_key") | .Value')
GC_NOTIFY_API_KEY=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="gc_notify_api_key") | .Value')
GOOGLE_SEARCH_ENGINE_ID=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="google_search_engine_id") | .Value')

# Validate that all required parameters were extracted
if [ -z "$DOCDB_URI" ] || [ -z "$AZURE_OPENAI_API_KEY" ] || [ -z "$AZURE_OPENAI_ENDPOINT" ] || [ -z "$JWT_SECRET_KEY" ]; then
  echo "Error: One or more required parameters are empty after extraction"
  echo "DOCDB_URI: ${DOCDB_URI:+SET}"
  echo "AZURE_OPENAI_API_KEY: ${AZURE_OPENAI_API_KEY:+SET}"
  echo "AZURE_OPENAI_ENDPOINT: ${AZURE_OPENAI_ENDPOINT:+SET}"
  echo "JWT_SECRET_KEY: ${JWT_SECRET_KEY:+SET}"
  exit 1
fi

# Get VPC configuration for Lambda
echo "Fetching VPC configuration for Lambda..."
VPC_ID="$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=ai-answers_vpc" --query 'Vpcs[0].VpcId')"
if [ "$VPC_ID" = "None" ] || [ -z "$VPC_ID" ]; then
  echo "Error: Could not find ai-answers VPC"
  exit 1
fi

# Get private subnet IDs
SUBNET_IDS_RAW="$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:Name,Values=*private*" --query 'Subnets[].SubnetId' --output text)"
# Convert tab-separated list to comma-separated list for Lambda
SUBNET_IDS=$(echo "$SUBNET_IDS_RAW" | tr '\t' ',')
if [ -z "$SUBNET_IDS" ]; then
  echo "Error: Could not find private subnets in VPC $VPC_ID"
  exit 1
fi

# Get the Lambda security group ID
LAMBDA_SG_ID=$(aws ec2 describe-security-groups --filters "Name=vpc-id,Values=$VPC_ID" "Name=group-name,Values=ai-answers-lambda-pr-review" --query 'SecurityGroups[0].GroupId' --output text)
if [ "$LAMBDA_SG_ID" = "None" ] || [ -z "$LAMBDA_SG_ID" ]; then
  echo "Warning: Lambda security group not found, Lambda will run without VPC configuration"
  VPC_CONFIG=""
else
  echo "Found VPC configuration (VPC and security group located)"
  VPC_CONFIG="--vpc-config SubnetIds=$SUBNET_IDS,SecurityGroupIds=$LAMBDA_SG_ID"
fi

# Function to check if Lambda function exists with retries
check_function_exists() {
  local function_name="$1"
  local max_attempts=5
  local attempt=1
  local wait_time=2
  
  while [ $attempt -le $max_attempts ]; do
    if aws lambda get-function --function-name "$function_name" > /dev/null 2>&1; then
      return 0  # Function exists
    fi
    
    if [ $attempt -lt $max_attempts ]; then
      echo "Function check attempt $attempt/$max_attempts - waiting ${wait_time}s for AWS consistency..."
      sleep $wait_time
      wait_time=$((wait_time * 2))  # Exponential backoff
    fi
    
    attempt=$((attempt + 1))
  done
  
  return 1  # Function does not exist after all attempts
}

# Check if the function already exists
if check_function_exists "$FULL_FUNCTION_NAME"; then
  echo "Function exists. Updating code and environment variables..."
  
  echo "Updating function code..."
  if ! aws lambda update-function-code \
    --function-name "$FULL_FUNCTION_NAME" \
    --image-uri "${REGISTRY}/${IMAGE}:${IMAGE_TAG}" > /dev/null 2>&1; then
    echo "Error: Failed to update function code"
    exit 1
  fi
  
  echo "Waiting for function to be ready for configuration update..."
  aws lambda wait function-updated --function-name "$FULL_FUNCTION_NAME" 2>/dev/null
    
  echo "Updating function configuration..."
  if ! aws lambda update-function-configuration \
    --function-name "$FULL_FUNCTION_NAME" \
    --timeout 300 \
    $VPC_CONFIG \
    --environment "Variables={NODE_ENV=production,PORT=3001,AWS_LAMBDA_EXEC_WRAPPER=/opt/extensions/lambda-adapter,RUST_LOG=info,READINESS_CHECK_PATH=/health,READINESS_CHECK_PORT=3001,READINESS_CHECK_PROTOCOL=http,READINESS_CHECK_MAX_WAIT=60,READINESS_CHECK_INTERVAL=1,DOCDB_URI=$DOCDB_URI,AZURE_OPENAI_API_KEY=$AZURE_OPENAI_API_KEY,AZURE_OPENAI_ENDPOINT=$AZURE_OPENAI_ENDPOINT,AZURE_OPENAI_API_VERSION=$AZURE_OPENAI_API_VERSION,CANADA_CA_SEARCH_URI=$CANADA_CA_SEARCH_URI,CANADA_CA_SEARCH_API_KEY=$CANADA_CA_SEARCH_API_KEY,JWT_SECRET_KEY=$JWT_SECRET_KEY,USER_AGENT=$USER_AGENT,GOOGLE_API_KEY=$GOOGLE_API_KEY,GC_NOTIFY_API_KEY=$GC_NOTIFY_API_KEY,GOOGLE_SEARCH_ENGINE_ID=$GOOGLE_SEARCH_ENGINE_ID}" > /dev/null 2>&1; then
    echo "Error: Failed to update function configuration"
    exit 1
  fi
else
  echo "Function does not exist. Creating new Lambda function..."
  echo "Using image: ${REGISTRY}/${IMAGE}:${IMAGE_TAG}"
  echo "Using role: $ROLE_ARN"
  
  
  # Try to create the function and capture the error
  if ! aws lambda create-function \
    --function-name "$FULL_FUNCTION_NAME" \
    --package-type Image \
    --role "$ROLE_ARN" \
    --timeout 300 \
    --memory-size 1024 \
    $VPC_CONFIG \
    --code ImageUri="${REGISTRY}/${IMAGE}:${IMAGE_TAG}" \
    --environment "Variables={NODE_ENV=production,PORT=3001,AWS_LAMBDA_EXEC_WRAPPER=/opt/extensions/lambda-adapter,RUST_LOG=info,READINESS_CHECK_PATH=/health,READINESS_CHECK_PORT=3001,READINESS_CHECK_PROTOCOL=http,READINESS_CHECK_MAX_WAIT=60,READINESS_CHECK_INTERVAL=1,DOCDB_URI=$DOCDB_URI,AZURE_OPENAI_API_KEY=$AZURE_OPENAI_API_KEY,AZURE_OPENAI_ENDPOINT=$AZURE_OPENAI_ENDPOINT,AZURE_OPENAI_API_VERSION=$AZURE_OPENAI_API_VERSION,CANADA_CA_SEARCH_URI=$CANADA_CA_SEARCH_URI,CANADA_CA_SEARCH_API_KEY=$CANADA_CA_SEARCH_API_KEY,JWT_SECRET_KEY=$JWT_SECRET_KEY,USER_AGENT=$USER_AGENT,GOOGLE_API_KEY=$GOOGLE_API_KEY,GC_NOTIFY_API_KEY=$GC_NOTIFY_API_KEY,GOOGLE_SEARCH_ENGINE_ID=$GOOGLE_SEARCH_ENGINE_ID}" \
    --description "$GITHUB_REPOSITORY/pull/$PR_NUMBER - AI Answers PR Review Environment" > /dev/null 2>&1; then
    echo "Error: Failed to create Lambda function"
    exit 1
  fi
  

  echo "Waiting for function to become active..."
  if ! aws lambda wait function-active --function-name "$FULL_FUNCTION_NAME" 2>/dev/null; then
    echo "Error: Function failed to become active"
    exit 1
  fi

  echo "Setting up function URL permissions..."
  if ! aws lambda add-permission \
    --function-name "$FULL_FUNCTION_NAME" \
    --statement-id FunctionURLAllowPublicAccess \
    --action lambda:InvokeFunctionUrl \
    --principal "*" \
    --function-url-auth-type NONE > /dev/null 2>&1; then
    echo "Error: Failed to add function URL permissions"
    exit 1
  fi

  echo "Creating function URL configuration..."
  if ! aws lambda create-function-url-config \
    --function-name "$FULL_FUNCTION_NAME" \
    --auth-type NONE > /dev/null 2>&1; then
    echo "Error: Failed to create function URL configuration"
    exit 1
  fi

  echo "Setting up logs..."
  aws logs create-log-group --log-group-name /aws/lambda/"$FULL_FUNCTION_NAME" 2>/dev/null || true
  if ! aws logs put-retention-policy --log-group-name /aws/lambda/"$FULL_FUNCTION_NAME" --retention-in-days 7 > /dev/null 2>&1; then
    echo "Warning: Failed to set log retention policy"
  fi
fi

echo "Lambda function $FULL_FUNCTION_NAME deployed successfully"
