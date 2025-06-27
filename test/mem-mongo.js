import { MongoMemoryServer } from "mongodb-memory-server";

async function start() {
  const mongod = await MongoMemoryServer.create({
    instance: { port: 27017 }
  });
  const uri = mongod.getUri();
  console.log("In-memory MongoDB started at:", uri);
  console.log("Press Ctrl+C to stop the database.");
  // Keep the process alive
  process.stdin.resume();
}

start().catch(console.error);