import { createContextAgent } from "../agents/AgentFactory.js";

async function main() {
  try {
    // Create the context agent for Azure
    const agent = await createContextAgent("azure", "test-chat-id");

    // Prepare a simple test message
    const messages = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello, can you confirm you are working?" },
    ];

    // Call the agent's invoke method
    const result = await agent.invoke({ messages });

    // Output the result
    console.log("LLM response:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error testing Azure context agent:", error);
    process.exit(1);
  }
}

main();
