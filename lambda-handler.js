import serverlessExpress from "aws-serverless-express";
import app from "./server-lambda.js";

console.log("Lambda handler initializing...");
const server = serverlessExpress.createServer(app);
console.log("Express server created for Lambda");

export const handler = (event, context) => {
  console.log("Lambda handler invoked:", {
    httpMethod: event.httpMethod,
    path: event.path,
    headers: event.headers,
  });

  try {
    return serverlessExpress.proxy(server, event, context, "PROMISE").promise;
  } catch (error) {
    console.error("Lambda handler error:", error);
    throw error;
  }
};
