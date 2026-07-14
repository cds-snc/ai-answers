import { Disk } from 'flydrive';
import { S3Driver } from 'flydrive/drivers/s3';
import { FSDriver } from 'flydrive/drivers/fs';
import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'node:path';

// Storage is imported by route modules before server.js reaches its dotenv call.
// Load the local environment here so the driver matches the configured runtime.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Determine if we are in S3 mode (Production/Staging/PR Review) or FS mode (Local)
const isS3 = !!process.env.S3_BUCKET_NAME;
const bucketName = process.env.S3_BUCKET_NAME;
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ca-central-1';

let storageService;

if (isS3) {
    // Lambda/Production: Use S3 with IAM role credentials
    // S3Client automatically uses IAM role credentials in Lambda
    const s3Client = new S3Client({ region });

    storageService = new Disk(new S3Driver({
        client: s3Client,
        bucket: bucketName,
        // Credentials are automatically handled by S3Client via:
        // - IAM roles (Lambda, EC2, ECS)
        // - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
        // - AWS credential files (~/.aws/credentials)
    }));
} else {
    // Local development: Use filesystem
    storageService = new Disk(new FSDriver({
        location: './storage/chat-logs',
        visibility: 'private'
    }));
}

export default storageService;
