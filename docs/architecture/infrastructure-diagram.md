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
            
            VPCE[VPC Gateway Endpoint <br/> S3]:::new
        end
        
        S3[S3 Bucket <br/> 'product-env-storage']:::new
        Bedrock[Amazon Bedrock <br/> Foundation Models]:::model
        ECR[Elastic Container Registry]
        CW[CloudWatch Logs]
    end

    subgraph Azure_Cloud [Azure Cloud]
        AzFoundry[Azure AI Foundry <br/> OpenAI Models]:::model
    end
    
    subgraph External_Search [External Search Services]
        Google[Google Custom Search]:::search
        CanadaCA[Canada.ca Search]:::search
    end
    
    %% Traffic Flows
    ALB -->|Port 3000| ECS
    ECS -->|Mongoose| DocDB
    
    %% New Connections
    ECS -->|Port 6379| Redis
    ECS -->|HTTPS| VPCE
    VPCE -->|Private Route| S3
    ECS -->|AWS SDK| Bedrock
    ECS -->|HTTPS| AzFoundry
    ECS -->|HTTPS| Google
    ECS -->|HTTPS| CanadaCA
    
    %% Supporting Services
    ECS -.->|Pull Image| ECR
    ECS -.->|Logs| CW

    %% Legend / Styling
    classDef default fill:#f9f9f9,stroke:#333,stroke-width:1px;
    classDef new fill:#d4edda,stroke:#28a745,stroke-width:2px,color:#000;
    classDef model fill:#e1f5fe,stroke:#039be5,stroke-width:2px,color:#000;
    classDef search fill:#fff9c4,stroke:#fbc02d,stroke-width:2px,color:#000;
    
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
    *   **VPC Gateway Endpoint**: Enables private access from ECS to S3 without using the public internet.
    *   Includes a lifecycle rule to expire objects after 90 days.
4.  **Model Providers**:
    *   **Amazon Bedrock**: Accessed via AWS SDK/Role assumption for Foundation Models.
    *   **Azure AI Foundry**: Accessed via HTTPS using API keys for OpenAI Models.
5.  **External Search Services**:
    *   **Google Custom Search**: Provided through Google Cloud Search API for external web context.
    *   **Canada.ca Search**: Hits the Canada.ca search API for authoritative government content.
