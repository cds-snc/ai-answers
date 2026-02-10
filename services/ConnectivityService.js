/**
 * ConnectivityService - Tests connectivity to all external services
 * Used by the admin connectivity dashboard to verify service health
 */
import mongoose from 'mongoose';
import { createClient } from 'redis';
import storageService from './Storage.js';
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
        client = createClient({
            url: redisUrl,
            socket: {
                connectTimeout: 5000
            }
        });

        client.on('error', (err) => {/* ignore for test, caught in try/catch */ });

        await client.connect();

        // Test with PING
        const pong = await client.ping();

        // Test with SET/GET
        const testKey = `connectivity_test_${Date.now()}`;
        await client.set(testKey, 'test', { EX: 10 });
        const testValue = await client.get(testKey);
        await client.del(testKey);

        const info = await client.info('server');
        const versionMatch = info.match(/redis_version:([^\r\n]+)/);

        await client.disconnect();

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
            try { await client.disconnect(); } catch (e) { /* ignore */ }
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
 * Test S3 connection (via Storage service)
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
        const testKey = `connectivity_test_${Date.now()}.txt`;
        const testContent = `Test content for connectivity at ${new Date().toISOString()}`;

        // Test with put (PUT)
        await storageService.put(testKey, testContent);

        // Test with get (GET)
        const retrievedContent = await storageService.get(testKey);

        // Test with delete (DELETE)
        await storageService.delete(testKey);

        // Verify content match
        // Flydrive returns content as string
        const isContentMatch = retrievedContent === testContent;

        return {
            service: 'S3',
            status: isContentMatch ? 'connected' : 'error',
            message: isContentMatch
                ? `Full S3 Read/Write access verified for '${bucketName}'`
                : 'S3 PUT/GET succeeded but content did not match',
            latencyMs: Date.now() - startTime,
            configured: true,
            details: {
                region,
                bucketName,
                testKey,
                contentMatch: isContentMatch
            }
        };
    } catch (error) {
        return {
            service: 'S3',
            status: 'error',
            message: error.message,
            latencyMs: Date.now() - startTime,
            configured: true,
            details: {
                region,
                bucketName
            }
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
    const bedrockRegion = 'us-east-1';
    const bedrockRoleArn = process.env.BEDROCK_ROLE_ARN;

    if (!bedrockRoleArn) {
        return {
            service: 'Bedrock (Claude US)',
            status: 'not_configured',
            message: 'BEDROCK_ROLE_ARN not set',
            latencyMs: Date.now() - startTime,
            configured: false
        };
    }

    try {
        // Assume the cross-account role first
        const stsClient = new STSClient({ region: 'us-east-1' });
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
            modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
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
            service: 'Bedrock (Claude US)',
            status: 'connected',
            message: 'Connection successful with role assumption',
            latencyMs: Date.now() - startTime,
            configured: true,
            details: {
                region: bedrockRegion,
                roleArn: bedrockRoleArn,
                testModel: 'anthropic.claude-haiku-4-5-20251001-v1:0',
                responseText: outputText
            }
        };
    } catch (error) {
        return {
            service: 'Bedrock (Claude US)',
            status: 'error',
            message: error.message,
            latencyMs: Date.now() - startTime,
            configured: true,
            details: { region: bedrockRegion, roleArn: bedrockRoleArn }
        };
    }
}

/**
 * Test AWS Bedrock connection for Claude in Canada
 */
async function testBedrockClaudeCanada() {
    const startTime = Date.now();
    const bedrockRegion = 'ca-central-1';
    const bedrockRoleArn = process.env.BEDROCK_ROLE_ARN;

    if (!bedrockRoleArn) {
        return {
            service: 'Bedrock (Claude CA)',
            status: 'not_configured',
            message: 'BEDROCK_ROLE_ARN not set',
            latencyMs: Date.now() - startTime,
            configured: false
        };
    }

    try {
        // Assume the cross-account role first
        const stsClient = new STSClient({ region: 'ca-central-1' });
        const assumeRoleResponse = await stsClient.send(new AssumeRoleCommand({
            RoleArn: bedrockRoleArn,
            RoleSessionName: 'connectivity-test-claude-ca',
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
                messages: [{ role: 'user', content: 'Hello from Canada' }]
            })
        });

        const response = await client.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        const outputText = responseBody.content?.[0]?.text || 'No response text';

        return {
            service: 'Bedrock (Claude CA)',
            status: 'connected',
            message: 'Connection successful to Claude in Canada!',
            latencyMs: Date.now() - startTime,
            configured: true,
            details: {
                region: bedrockRegion,
                roleArn: bedrockRoleArn,
                testModel: 'anthropic.claude-haiku-4-5-20251001-v1:0',
                responseText: outputText
            }
        };
    } catch (error) {
        return {
            service: 'Bedrock (Claude CA)',
            status: 'error',
            message: error.message,
            latencyMs: Date.now() - startTime,
            configured: true,
            details: { region: bedrockRegion, roleArn: bedrockRoleArn }
        };
    }
}

/**
 * Test AWS Bedrock connection using Amazon Nova (No Marketplace dependency)
 */
async function testBedrockNova() {
    const startTime = Date.now();
    const bedrockRegion = 'ca-central-1'; // Use Canada Central
    const bedrockRoleArn = process.env.BEDROCK_ROLE_ARN;

    if (!bedrockRoleArn) {
        return {
            service: 'Bedrock (Nova)',
            status: 'not_configured',
            message: 'BEDROCK_ROLE_ARN not set',
            latencyMs: Date.now() - startTime,
            configured: false
        };
    }

    try {
        // Assume the cross-account role first
        const stsClient = new STSClient({ region: 'ca-central-1' });
        const assumeRoleResponse = await stsClient.send(new AssumeRoleCommand({
            RoleArn: bedrockRoleArn,
            RoleSessionName: 'connectivity-test-nova',
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

        // Amazon Nova Lite cross-region inference profile for Canada
        const modelId = 'ca.amazon.nova-lite-v1:0';

        const command = new InvokeModelCommand({
            modelId,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                inferenceConfig: {
                    max_new_tokens: 50
                },
                messages: [{ role: 'user', content: [{ text: 'Hello' }] }]
            })
        });

        const response = await client.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        const outputText = responseBody.output?.message?.content?.[0]?.text || 'No response text';

        return {
            service: 'Bedrock (Nova)',
            status: 'connected',
            message: 'Connection successful to Amazon Nova Lite!',
            latencyMs: Date.now() - startTime,
            configured: true,
            details: {
                region: bedrockRegion,
                roleArn: bedrockRoleArn,
                testModel: modelId,
                responseText: outputText
            }
        };
    } catch (error) {
        return {
            service: 'Bedrock (Nova)',
            status: 'error',
            message: error.message,
            latencyMs: Date.now() - startTime,
            configured: true,
            details: { region: bedrockRegion, roleArn: bedrockRoleArn }
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
        testBedrockClaudeCanada(),
        testBedrockNova()
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
    testBedrockClaudeCanada,
    testBedrockNova,
    testAllConnections
};
