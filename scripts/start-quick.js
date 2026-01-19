import 'dotenv/config';
import { MongoMemoryServer } from "mongodb-memory-server";
import { spawn } from "child_process";
import fs from 'fs';
import path from "path";
import { fileURLToPath } from "url";

// Get directory of this script
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function start() {
    console.log("Starting Quick Dev Environment...");

    // 1. Start In-Memory MongoDB
    console.log("Starting MongoDB Memory Server...");
    const mongod = await MongoMemoryServer.create({
        instance: {
            port: 27017 // Try default port, or random if busy
        }
    });
    const uri = mongod.getUri();
    console.log(`MongoDB Memory Server started at: ${uri}`);

    // 2. Run Seeding Script
    console.log("Seeding database...");
    await new Promise((resolve, reject) => {
        const seeder = spawn("node", ["seeds/seed.js"], {
            cwd: rootDir,
            stdio: "inherit",
            env: {
                ...process.env,
                MONGODB_URI: uri
            },
            shell: true
        });

        seeder.on("exit", (code) => {
            if (code === 0) {
                console.log("Database seeded successfully.");
                resolve();
            } else {
                console.error(`Seeding failed with code ${code}`);
                reject(new Error("Seeding failed"));
            }
        });
    });

    // 3. Start Backend and Frontend Concurrently
    console.log("Starting Backend and Frontend...");

    const backend = spawn("npm", ["run", "start-server"], {
        cwd: rootDir,
        env: {
            ...process.env,
            MONGODB_URI: uri,
            // Ensure backend knows where to look if it cares, but mostly MONGODB_URI is key
            PORT: "3001"
        },
        shell: true
    });

    const frontend = spawn("npm", ["start"], { // react-scripts start
        cwd: rootDir,
        env: {
            ...process.env,
            // React app needs to know where API is if it's not proxied by default
            // But package.json proxy "http://localhost:3001" handles this usually.
            PORT: "3000"
        },
        shell: true
    });

    // Pipe outputs
    backend.stdout.on('data', (data) => {
        process.stdout.write(`[BACKEND] ${data}`);
    });
    backend.stderr.on('data', (data) => {
        process.stderr.write(`[BACKEND ERROR] ${data}`);
    });

    frontend.stdout.on('data', (data) => {
        process.stdout.write(`[FRONTEND] ${data}`);
    });
    frontend.stderr.on('data', (data) => {
        process.stderr.write(`[FRONTEND ERROR] ${data}`);
    });

    // Handle exits
    const cleanup = async () => {
        console.log("Stopping servers...");
        backend.kill();
        frontend.kill();
        await mongod.stop();
        process.exit();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
}

start().catch(err => {
    console.error("Startup failed:", err);
    process.exit(1);
});
