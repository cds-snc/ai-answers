/**
 * ConnectivityService - Tests connectivity to all external services
 * Used by the admin connectivity dashboard to verify service health
 */
import mongoose from 'mongoose';
import Redis from 'ioredis';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import { AzureOpenAI } from 'openai';
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

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
 * Test AWS Bedrock connection
 */
async function testBedrock() {
    const startTime = Date.now();
    const region = process.env.AWS_REGION || 'ca-central-1';
    const bedrockRoleArn = process.env.BEDROCK_ROLE_ARN;

    // Check if Bedrock is configured (either via role or direct access)
    if (!bedrockRoleArn && !process.env.AWS_LAMBDA_RUNTIME_API && !process.env.AWS_EXECUTION_ENV) {
        return {
            service: 'AWS Bedrock',
            status: 'not_configured',
            message: 'Not running in AWS or BEDROCK_ROLE_ARN not set',
            latencyMs: Date.now() - startTime,
            configured: false
        };
    }

    try {
        const client = new BedrockRuntimeClient({ region });

        // Try a minimal invoke to test connectivity
        // We use Claude with a minimal prompt
        const command = new InvokeModelCommand({
            modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: 'bedrock-2023-05-31',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'Hi' }]
            })
        });

        await client.send(command);

        return {
            service: 'AWS Bedrock',
            status: 'connected',
            message: 'Connection successful',
            latencyMs: Date.now() - startTime,
            configured: true,
            details: {
                region,
                testModel: 'anthropic.claude-3-haiku-20240307-v1:0'
            }
        };
    } catch (error) {
        // AccessDeniedException means we connected but don't have access
        if (error.name === 'AccessDeniedException') {
            return {
                service: 'AWS Bedrock',
                status: 'warning',
                message: 'Connected but access denied to test model',
                latencyMs: Date.now() - startTime,
                configured: true,
                details: { region }
            };
        }
        return {
            service: 'AWS Bedrock',
            status: 'error',
            message: error.message,
            latencyMs: Date.now() - startTime,
            configured: true
        };
    }
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
        testBedrock()
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
    testAllConnections
};
