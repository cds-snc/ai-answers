/**
 * ConnectivityService - Tests connectivity to all external services
 * Used by the admin connectivity dashboard to verify service health
 */
import mongoose from 'mongoose';
import Redis from 'ioredis';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import { AzureOpenAI } from 'openai';
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";

/**
 * Test DocumentDB/MongoDB connection
 */
async function testDocumentDB() {
    const startTime = Date.now();
    try {
        // Check if mongoose is connected
        if (mongoose.connection.readyState !== 1) {
            return {
                service: 'DocumentDB',
                status: 'error',
                message: 'Not connected',
                latencyMs: Date.now() - startTime,
                configured: true
            };
        }

        // Perform a simple ping
        await mongoose.connection.db.admin().ping();

        return {
            service: 'DocumentDB',
            status: 'connected',
            message: 'Connection successful',
            latencyMs: Date.now() - startTime,
            configured: true,
            details: {
                host: mongoose.connection.host,
                name: mongoose.connection.name,
                readyState: mongoose.connection.readyState
            }
        };
    } catch (error) {
        return {
            service: 'DocumentDB',
            status: 'error',
            message: error.message,
            latencyMs: Date.now() - startTime,
            configured: true
        };
    }
}

/**
 * Test Redis/ElastiCache connection
 */
async function testRedis() {
    const startTime = Date.now();
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
        return {
            service: 'Redis',
            status: 'not_configured',
            message: 'REDIS_URL environment variable not set',
            latencyMs: Date.now() - startTime,
            configured: false
        };
    }

    let client;
    try {
        client = new Redis(redisUrl, {
            connectTimeout: 5000,
            lazyConnect: true,
            maxRetriesPerRequest: 1
        });

        await client.connect();

        // Test with PING
        const pong = await client.ping();

        // Test with SET/GET
        const testKey = `connectivity_test_${Date.now()}`;
        await client.set(testKey, 'test', 'EX', 10);
        const testValue = await client.get(testKey);
        await client.del(testKey);

        const info = await client.info('server');
        const versionMatch = info.match(/redis_version:([^\r\n]+)/);

        await client.quit();

        return {
            service: 'Redis',
            status: 'connected',
            message: `PING returned: ${pong}`,
            latencyMs: Date.now() - startTime,
            configured: true,
            details: {
                version: versionMatch ? versionMatch[1] : 'unknown',
                testResult: testValue === 'test' ? 'SET/GET successful' : 'SET/GET failed'
            }
        };
    } catch (error) {
        if (client) {
            try { await client.quit(); } catch (e) { /* ignore */ }
        }
        return {
            service: 'Redis',
            status: 'error',
            message: error.message,
            latencyMs: Date.now() - startTime,
            configured: true
        };
    }
}

/**
 * Test S3 connection
 */
async function testS3() {
    const startTime = Date.now();
    const bucketName = process.env.S3_BUCKET_NAME;
    const region = process.env.AWS_REGION || 'ca-central-1';

    if (!bucketName) {
        return {
            service: 'S3',
            status: 'not_configured',
            message: 'S3_BUCKET_NAME environment variable not set',
            latencyMs: Date.now() - startTime,
            configured: false
        };
    }

    try {
        const client = new S3Client({ region });

        // List buckets to verify access
        const command = new ListBucketsCommand({});
        const response = await client.send(command);

        const bucketExists = response.Buckets?.some(b => b.Name === bucketName);

        return {
            service: 'S3',
            status: bucketExists ? 'connected' : 'warning',
            message: bucketExists
                ? `Bucket '${bucketName}' accessible`
                : `Connected but bucket '${bucketName}' not found in list`,
            latencyMs: Date.now() - startTime,
            configured: true,
            details: {
                region,
                bucketName,
                bucketsFound: response.Buckets?.length || 0
            }
        };
    } catch (error) {
        return {
            service: 'S3',
            status: 'error',
            message: error.message,
            latencyMs: Date.now() - startTime,
            configured: true
        };
    }
}

/**
 * Test Azure OpenAI connection
 */
async function testAzureOpenAI() {
    const startTime = Date.now();
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-06-01';

    if (!apiKey || !endpoint) {
        return {
            service: 'Azure OpenAI',
            status: 'not_configured',
            message: 'Azure OpenAI credentials not set',
            latencyMs: Date.now() - startTime,
            configured: false
        };
    }

    try {
        // Extract instance name from endpoint
        const instanceName = endpoint
            .replace('https://', '')
            .replace('.openai.azure.com/', '')
            .replace('.openai.azure.com', '');

        const client = new AzureOpenAI({
            apiKey,
            endpoint,
            apiVersion
        });

        // List available models to verify connection
        const models = await client.models.list();
        const modelList = [];
        for await (const model of models) {
            modelList.push(model.id);
        }

        return {
            service: 'Azure OpenAI',
            status: 'connected',
            message: 'Connection successful',
            latencyMs: Date.now() - startTime,
            configured: true,
            details: {
                instance: instanceName,
                apiVersion,
                modelsAvailable: modelList.length,
                models: modelList.slice(0, 5) // Show first 5 models
            }
        };
    } catch (error) {
        return {
            service: 'Azure OpenAI',
            status: 'error',
            message: error.message,
            latencyMs: Date.now() - startTime,
            configured: true
        };
    }
}

/**
 * Test AWS Bedrock connection (with role assumption)
 */
/**
 * Test AWS Bedrock connection (with role assumption)
 */
async function testBedrockWithRole() {
    const startTime = Date.now();
    const bedrockRegion = process.env.BEDROCK_REGION || 'ca-central-1';
    const bedrockRoleArn = process.env.BEDROCK_ROLE_ARN;

    if (!bedrockRoleArn) {
        return {
            service: 'Bedrock (with role)',
            status: 'not_configured',
            message: 'BEDROCK_ROLE_ARN not set',
            latencyMs: Date.now() - startTime,
            configured: false
        };
    }

    try {
        // Assume the cross-account role first
        const stsClient = new STSClient({ region: process.env.AWS_REGION || 'ca-central-1' });
        const assumeRoleResponse = await stsClient.send(new AssumeRoleCommand({
            RoleArn: bedrockRoleArn,
            RoleSessionName: 'connectivity-test',
            DurationSeconds: 900
        }));

        const credentials = {
            accessKeyId: assumeRoleResponse.Credentials.AccessKeyId,
            secretAccessKey: assumeRoleResponse.Credentials.SecretAccessKey,
            sessionToken: assumeRoleResponse.Credentials.SessionToken
        };

        const client = new BedrockRuntimeClient({
            region: bedrockRegion,
            credentials
        });

        const command = new InvokeModelCommand({
            modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: 'bedrock-2023-05-31',
                max_tokens: 50,
                messages: [{ role: 'user', content: 'Hello' }]
            })
        });

        const response = await client.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        const outputText = responseBody.content?.[0]?.text || 'No response text';

        return {
            service: 'Bedrock (with role)',
            status: 'connected',
            message: 'Connection successful with role assumption',
            latencyMs: Date.now() - startTime,
            configured: true,
            details: {
                region: bedrockRegion,
                roleArn: bedrockRoleArn,
                testModel: 'anthropic.claude-3-haiku-20240307-v1:0',
                responseText: outputText
            }
        };
    } catch (error) {
        return {
            service: 'Bedrock (with role)',
            status: 'error',
            message: error.message,
            latencyMs: Date.now() - startTime,
            configured: true,
            details: { region: bedrockRegion, roleArn: bedrockRoleArn }
        };
    }
}

/**
 * Test AWS Bedrock connection (Canada Central probe)
 */
async function testBedrockCanada() {
    const startTime = Date.now();
    const bedrockRegion = 'ca-central-1';

    try {
        // Use default ECS credentials (this assumes the ECS task works or we have permission in this region)
        // Note: Unless permissions are added for ca-central-1 in the future, this might fail access or model not found.
        const client = new BedrockRuntimeClient({ region: bedrockRegion });

        // We use a model that MIGHT exist there eventually, or check listFoundationModels if preferred.
        // For now, let's try invoking the same model to see if it's there.
        const command = new InvokeModelCommand({
            modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: 'bedrock-2023-05-31',
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Hello' }]
            })
        });

        await client.send(command);

        return {
            service: 'Bedrock (Canada)',
            status: 'connected',
            message: 'Connection successful to Canada Central',
            latencyMs: Date.now() - startTime,
            configured: true,
            details: {
                region: bedrockRegion,
                note: 'Model available in Canada!'
            }
        };
    } catch (error) {
        // Differentiate between "AccessDenied" (permissions) and "ResourceNotFound" (model missing)
        let status = 'error';
        let message = error.message;

        if (error.name === 'ResourceNotFoundException') {
            status = 'warning';
            message = 'Model not yet available in Canada Central';
        } else if (error.name === 'AccessDeniedException') {
            status = 'warning';
            message = 'Access Denied (expected if not configured)';
        }

        return {
            service: 'Bedrock (Canada)',
            status: status,
            message: message,
            latencyMs: Date.now() - startTime,
            configured: true,
            details: { region: bedrockRegion }
        };
    }
}

// Wrapper for backward compatibility
async function testBedrock() {
    return testBedrockWithRole();
}

/**
 * Run all connectivity tests
 */
async function testAllConnections() {
    const results = await Promise.all([
        testDocumentDB(),
        testRedis(),
        testS3(),
        testAzureOpenAI(),
        testBedrockWithRole(),
        testBedrockCanada()
    ]);

    return {
        timestamp: new Date().toISOString(),
        services: results,
        summary: {
            total: results.length,
            connected: results.filter(r => r.status === 'connected').length,
            errors: results.filter(r => r.status === 'error').length,
            notConfigured: results.filter(r => r.status === 'not_configured').length,
            warnings: results.filter(r => r.status === 'warning').length
        }
    };
}

export {
    testDocumentDB,
    testRedis,
    testS3,
    testAzureOpenAI,
    testBedrock,
    testBedrockWithRole,
    testBedrockCanada,
    testAllConnections
};
