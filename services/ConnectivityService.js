/**
 * ConnectivityService - Tests connectivity to all external services
 * Used by the admin connectivity dashboard to verify service health
 */
import mongoose from 'mongoose';
import { createClient } from 'redis';
import storageService from './Storage.js';
import { AzureOpenAI } from 'openai';
import { google } from 'googleapis';
import { SettingsService } from './SettingsService.js';

const CONNECTIVITY_TIMEOUT_MS = 10000;
const SIMULATION_KEYS = {
    database: 'connectivity.simulation.database',
    search: 'connectivity.simulation.search',
    llm: 'connectivity.simulation.llm',
};

async function withTimeout(promise, timeoutMs, label) {
    let timeout;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
            }),
        ]);
    } finally {
        clearTimeout(timeout);
    }
}

function isSimulationEnabled(key) {
    try {
        return SettingsService.toBoolean(SettingsService.get(key), false);
    } catch (_error) {
        return false;
    }
}

function simulatedFailure(service, startTime) {
    return {
        service,
        status: 'error',
        statusCode: 503,
        message: 'Simulated connection failure',
        latencyMs: Date.now() - startTime,
        configured: true,
        details: {
            simulated: true,
        }
    };
}

/**
 * Test DocumentDB/MongoDB connection
 */
async function testDocumentDB() {
    const startTime = Date.now();
    try {
        if (isSimulationEnabled(SIMULATION_KEYS.database)) {
            return simulatedFailure('DocumentDB', startTime);
        }

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

    if (isSimulationEnabled(SIMULATION_KEYS.llm)) {
        return simulatedFailure('Azure OpenAI', startTime);
    }

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

// Canada.ca/Coveo search is not currently available in this environment.
// Keep this probe disabled until the endpoint is ready, otherwise the
// connectivity dashboard reports a known unavailable dependency as an outage.
// async function testCanadaCaSearch() {
//     const startTime = Date.now();
//     const searchUri = process.env.CANADA_CA_SEARCH_URI;
//     const searchApiKey = process.env.CANADA_CA_SEARCH_API_KEY;
//
//     if (!searchUri || !searchApiKey) {
//         return {
//             service: 'Canada.ca search',
//             status: 'not_configured',
//             message: 'CANADA_CA_SEARCH_URI or CANADA_CA_SEARCH_API_KEY not set',
//             latencyMs: Date.now() - startTime,
//             configured: false
//         };
//     }
//
//     try {
//         const controller = new AbortController();
//         const timeout = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT_MS);
//         const response = await (async () => {
//             try {
//                 return await fetch(searchUri, {
//                     method: 'POST',
//                     signal: controller.signal,
//                     headers: {
//                         Authorization: `Bearer ${searchApiKey}`,
//                         'Content-Type': 'application/json',
//                         Accept: 'application/json',
//                     },
//                     body: JSON.stringify({
//                         q: 'passport',
//                         searchHub: 'canada-gouv-public-websites',
//                         originLevel3: '/en/sr/srb.html',
//                     }),
//                 });
//             } finally {
//                 clearTimeout(timeout);
//             }
//         })();
//
//         const responseText = await response.text();
//         if (!response.ok) {
//             throw new Error(`HTTP ${response.status}: ${response.statusText}`);
//         }
//
//         const body = JSON.parse(responseText);
//         const resultCount = Array.isArray(body?.results) ? body.results.length : 0;
//
//         return {
//             service: 'Canada.ca search',
//             status: 'connected',
//             message: 'Connection successful',
//             latencyMs: Date.now() - startTime,
//             configured: true,
//             details: {
//                 resultCount,
//                 endpoint: searchUri
//             }
//         };
//     } catch (error) {
//         return {
//             service: 'Canada.ca search',
//             status: 'error',
//             message: error.message,
//             latencyMs: Date.now() - startTime,
//             configured: true
//         };
//     }
// }

/**
 * Test Google Custom Search connection
 */
async function testGoogleSearch() {
    const startTime = Date.now();
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    const apiKey = process.env.GOOGLE_API_KEY;

    if (isSimulationEnabled(SIMULATION_KEYS.search)) {
        return simulatedFailure('Google search', startTime);
    }

    if (!searchEngineId || !apiKey) {
        return {
            service: 'Google search',
            status: 'not_configured',
            message: 'GOOGLE_SEARCH_ENGINE_ID or GOOGLE_API_KEY not set',
            latencyMs: Date.now() - startTime,
            configured: false
        };
    }

    try {
        const customsearch = google.customsearch('v1');
        const response = await withTimeout(
            customsearch.cse.list({
                cx: searchEngineId,
                key: apiKey,
                q: 'passport',
                lr: 'lang_en',
            }),
            CONNECTIVITY_TIMEOUT_MS,
            'Google search connectivity test'
        );

        const resultCount = Array.isArray(response?.data?.items) ? response.data.items.length : 0;

        return {
            service: 'Google search',
            status: 'connected',
            message: 'Connection successful',
            latencyMs: Date.now() - startTime,
            configured: true,
            details: {
                resultCount,
                searchEngineId
            }
        };
    } catch (error) {
        return {
            service: 'Google search',
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
        testGoogleSearch()
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
    testGoogleSearch,
    testAllConnections
};
