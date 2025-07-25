import mongoose from 'mongoose';

const toolSchema = new mongoose.Schema({
    tool: {
        type: String,
        required: true
    },
    input: mongoose.Schema.Types.Mixed,
    output: mongoose.Schema.Types.Mixed,
    duration: Number,
    status: {
        type: String,
        enum: ['started', 'completed', 'error'],
        required: true
    },
    error: String
}, { timestamps: true }); 

export const Tool = mongoose.models.Tool || mongoose.model('Tool', toolSchema);