# Infrastructure Diagram

This diagram represents the infrastructure state including the proposed Redis and S3 additions.

```mermaid
graph TD
    User((User)) -->|HTTPS| ALB
    
    subgraph AWS_Cloud [AWS Cloud]
        subgraph VPC [VPC]
            
            subgraph Public_Subnets [Public Subnets]
                ALB[Application Load Balancer]
            end
            
            subgraph Private_Subnets [Private Subnets]
                ECS[ECS Service <br/> Node.js App]
                
                subgraph Database [Database Security Group]
                    DocDB[(DocumentDB <br/> MongoDB Compatible)]
                end
                
                
                subgraph Redis_Infra [Redis Security Group]
                    Redis[(ElastiCache Redis <br/> Single Node t3.micro)]:::new
                end
            end
        end
        
        S3[S3 Bucket <br/> 'product-env-storage']:::new
        Bedrock[Amazon Bedrock <br/> Foundation Models]:::model
        ECR[Elastic Container Registry]
        CW[CloudWatch Logs]
    end

    subgraph Azure_Cloud [Azure Cloud]
        AzFoundry[Azure AI Foundry <br/> OpenAI Models]:::model
    end
    
    %% Traffic Flows
    ALB -->|Port 3000| ECS
    ECS -->|Mongoose| DocDB
    
    %% New Connections
    ECS -->|Port 6379| Redis
    ECS -->|HTTPS| S3
    ECS -->|AWS SDK| Bedrock
    ECS -->|HTTPS| AzFoundry
    
    %% Supporting Services
    ECS -.->|Pull Image| ECR
    ECS -.->|Logs| CW

    %% Legend / Styling
    classDef default fill:#f9f9f9,stroke:#333,stroke-width:1px;
    classDef new fill:#d4edda,stroke:#28a745,stroke-width:2px,color:#000;
    classDef model fill:#e1f5fe,stroke:#039be5,stroke-width:2px,color:#000;
    
    linkStyle default stroke:#333,stroke-width:1px;
```

### Components
1.  **Current Infrastructure**:
    *   **ECS & Load Balancer**: Standard web application setup.
    *   **DocumentDB**: The primary persistent store in the private subnet.
2.  **Redis**:
    *   Adds an **ElastiCache Redis Cluster** (Single Node, `cache.t3.micro`).
    *   Includes a dedicated **Security Group** and **Subnet Group** (in private subnets).
    *   Configured for cost savings (no snapshots).
3.  **S3 Storage**:
    *   Adds a private **S3 Bucket** named `{product}-{env}-storage`.
    *   configured with default server-side encryption (AES256) and public access blocking.
    *   Includes a lifecycle rule to expire objects after 90 days.
4.  **Model Providers**:
    *   **Amazon Bedrock**: Accessed via AWS SDK/Role assumption for Foundation Models.
    *   **Azure AI Foundry**: Accessed via HTTPS using API keys for OpenAI Models.
