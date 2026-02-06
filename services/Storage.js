import { createStorage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";
import s3Driver from "unstorage/drivers/s3";

// Determine if we are in S3 mode (Production/Staging/PR Review) or FS mode (Local)
// Note: PR Review (Lambda) sets S3_BUCKET_NAME
const isS3 = !!process.env.S3_BUCKET_NAME;
const bucketName = process.env.S3_BUCKET_NAME;
const region = process.env.AWS_REGION || 'ca-central-1';

const storage = createStorage({
    driver: isS3
        ? s3Driver({
            bucket: bucketName,
            region: region,
            // Provide endpoint - use S3_ENDPOINT env var or construct AWS S3 endpoint
            endpoint: process.env.S3_ENDPOINT || `https://s3.${region}.amazonaws.com`,
            // In Lambda/EC2, credentials are automatically loaded from the role
            // In local with credentials, they are loaded from ~/.aws/credentials if using SDK,
            // but unstorage might need explicitly or environment variables AWS_ACCESS_KEY_ID / SECRET_ACCESS_KEY
        })
        : fsDriver({
            base: "./storage/chat-logs",
            ignore: ['.DS_Store', '.gitkeep']
        })
});

export default storage;
