
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const LOGS_SCHEMA = new mongoose.Schema({
    chatId: String,
    logLevel: String,
    message: String,
    metadata: mongoose.Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now }
});

const Logs = mongoose.model('Logs', LOGS_SCHEMA);

async function checkLogs() {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dev-database';
    console.log('Connecting to', uri);
    await mongoose.connect(uri);

    const recentLogs = await Logs.find({})
        .sort({ createdAt: -1 })
        .limit(50);

    console.log(`RECENT LOGS: ${recentLogs.length} found`);
    recentLogs.forEach(log => {
        console.log(`[${log.createdAt.toISOString()}][${log.logLevel}][${log.chatId}] ${log.message}`);
        if (log.metadata) console.log('Metadata:', JSON.stringify(log.metadata, null, 2));
        console.log('---');
    });

    process.exit(0);
}

checkLogs().catch(err => {
    console.error(err);
    process.exit(1);
});
