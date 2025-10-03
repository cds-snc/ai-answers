import mongoose from 'mongoose';

const logsSchema = new mongoose.Schema({
    chatId: {
        type: String,
        required: false, // Optional since some logs might be system-wide
        index: true // Add an index to speed up queries by chatId
    },
    logLevel: {
        type: String,
        required: true,
        enum: ['info', 'warn', 'error', 'debug'],
        
    },
    message: {
        type: String,
        required: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed, // For additional structured data
        required: false
    }
}, { timestamps: true }); // This adds createdAt and updatedAt fields automatically



export const Logs = mongoose.models.Logs || mongoose.model('Logs', logsSchema);