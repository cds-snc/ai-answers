import { createStorage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";
import s3Driver from "unstorage-driver-aws-s3";

// Determine if we are in S3 mode (Production/Staging/PR Review) or FS mode (Local)
// Note: PR Review (Lambda) sets S3_BUCKET_NAME
const isS3 = !!process.env.S3_BUCKET_NAME;
const bucketName = process.env.S3_BUCKET_NAME;
const region = process.env.AWS_REGION || 'ca-central-1';

const storage = createStorage({
    driver: isS3
        ? s3Driver({
            bucket: bucketName,
            region: region
            // AWS SDK will automatically use IAM role credentials in Lambda/EC2
            // Or environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) if present
        })
        : fsDriver({
            base: "./storage/chat-logs",
            ignore: ['.DS_Store', '.gitkeep']
        })
});

export default storage;
