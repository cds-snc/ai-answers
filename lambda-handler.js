import { createServer, proxy } from "aws-serverless-express";
import app from "./server-lambda.js";

const server = createServer(app);

export const handler = (event, context) => {
  return proxy(server, event, context);
};
