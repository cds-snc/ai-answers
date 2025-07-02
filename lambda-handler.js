import serverlessExpress from "@vendia/serverless-express";
import app from "./server-lambda.js";

console.log("Lambda handler initializing...");
console.log("Express server created for Lambda");

export const handler = serverlessExpress({ app });
