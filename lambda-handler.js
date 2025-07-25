import serverlessExpress from "@vendia/serverless-express";
import app from "./server/server.js";

// Create the serverless express handler
let serverlessExpressInstance;

async function setup(event, context) {
  serverlessExpressInstance = serverlessExpress({ app });
  return serverlessExpressInstance(event, context);
}

// Lambda handler
export const handler = async (event, context) => {
  if (serverlessExpressInstance) {
    return serverlessExpressInstance(event, context);
  }
  return setup(event, context);
};
