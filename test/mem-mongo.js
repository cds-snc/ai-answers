import { MongoMemoryServer } from "mongodb-memory-server";
async function start() {
  const mongod = await MongoMemoryServer.create({
    instance: { port: 27017 }
  });
  const uri = mongod.getUri();
  console.log("In-memory MongoDB started at:", uri);

  console.log("Starting server on port:", port);

  // Detect Codespaces environment and set API URL accordingly
  let apiUrl;
  if (process.env.CODESPACE_NAME) {
    apiUrl = `https://${process.env.CODESPACE_NAME}-${port}.app.github.dev`;
  } else {
    apiUrl = `http://localhost:${port}`;
  }

  console.log("API URL:", apiUrl);

  // Only build if the build directory doesn't exist
  const buildPath = path.resolve(__dirname, "../build");
  if (!existsSync(buildPath)) {
    console.log("No build directory found. Building frontend...");
    try {
      await new Promise((resolve, reject) => {
        const build = spawn("npm", ["run", "build"], {
          stdio: "inherit",
          env: {
            ...process.env,
            REACT_APP_API_URL: `${apiUrl}`,
          },
          shell: true, // Fix for Windows
        });
        build.on("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Build failed with code ${code}`));
        });
      });
      console.log("Frontend build completed");
    } catch (error) {
      console.error("Frontend build failed:", error);
      process.exit(1);
    }
  } else {
    console.log("Build directory exists, skipping frontend build");
  }

  console.log("Starting server...");
  // Start backend (which will serve the frontend build)
  const backend = spawn("npm", ["run", "start-server"], {
    stdio: "inherit",
    env: {
      ...process.env,
      MONGODB_URI: uri,
      PORT: port,
      REACT_APP_API_URL: `${apiUrl}/api`,
    },
    shell: true, // Fix for Windows
  });

  backend.on("exit", (code) => {
    mongod.stop();
    process.exit(code);
  });
}

start().catch(console.error);