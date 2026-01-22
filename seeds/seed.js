import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import dbConnect from '../api/db/db-connect.js';
import { User } from '../models/user.js';
import { Setting } from '../models/setting.js';
import { Chat } from '../models/chat.js';
import { Interaction } from '../models/interaction.js';
import { Question } from '../models/question.js';
import { Answer } from '../models/answer.js';
import { ExpertFeedback } from '../models/expertFeedback.js';
import { PublicFeedback } from '../models/publicFeedback.js';
import { Context } from '../models/context.js';
import { Eval } from '../models/eval.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env vars if ensuring we can connect (though usually passed by wrapper)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("Error: MONGODB_URI is not defined.");
    process.exit(1);
}

async function seed() {
    try {
        console.log(`Connecting to MongoDB at ${MONGODB_URI}...`);
        // Using dbConnect ensures all schemas are registered
        await dbConnect();
        console.log("Connected to MongoDB.");
        console.log("Registered models:", mongoose.modelNames());


        // Read data
        const dataPath = path.join(__dirname, 'data.json');
        const rawData = fs.readFileSync(dataPath, 'utf-8');
        const data = JSON.parse(rawData);

        // Clear existing data
        console.log("Clearing existing collections...");
        await User.deleteMany({});
        await Setting.deleteMany({});
        await Chat.deleteMany({});
        await Interaction.deleteMany({});
        await Question.deleteMany({});
        await Answer.deleteMany({});
        await ExpertFeedback.deleteMany({});
        await PublicFeedback.deleteMany({});
        await Context.deleteMany({});
        await Eval.deleteMany({});

        // transform users (hash password)
        console.log("Seeding Users...");
        for (const u of data.users) {
            // Manually hashing because we might be inserting raw or using new User()
            // If we use new User(u).save(), the pre-save hook will hash it.
            // Let's use the model to trigger validations and hooks.
            const user = new User(u);
            // The pre-save hook in models/user.js hashes the password
            await user.save();
        }

        // Settings
        console.log("Seeding Settings...");
        await Setting.insertMany(data.settings);

        // Chats & related
        console.log("Seeding Chat History...");
        await ExpertFeedback.insertMany(data.expertFeedbacks || []);
        await Question.insertMany(data.questions);
        await Answer.insertMany(data.answers);
        await Interaction.insertMany(data.interactions);
        await Chat.insertMany(data.chats);


        console.log("Seeding completed successfully.");
        process.exit(0);

    } catch (error) {
        console.error("Seeding failed:", error);
        process.exit(1);
    }
}

seed();
