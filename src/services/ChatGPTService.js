// src/ChatGPTService.js

import loadSystemPrompt from './systemPrompt.js';

const PORT = process.env.PORT || 3000; // Use a default value if PORT is not set

const API_URL = process.env.NODE_ENV === 'production' 
  ? '/api/claude'  // Vercel serverless function
  : `http://localhost:${PORT}/api/chatgpt`;  // Local development server endpoint

const ChatGPTService = {
  sendMessage: async (message, conversationHistory = [], lang = 'en') => {
    try {
      console.log(`🤖 ChatGPT Service: Processing message in ${lang.toUpperCase()}`);
      
      // Extract department from message if present
      const departmentMatch = message.match(/<department>(.*?)<\/department>/);
      const department = departmentMatch ? departmentMatch[1] : '';
      
      const SYSTEM_PROMPT = await loadSystemPrompt(lang, department);
      
      // Only change: check for evaluation and use empty array if true
      const finalHistory = message.includes('<evaluation>') ? [] : conversationHistory;

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          systemPrompt: SYSTEM_PROMPT,
          conversationHistory: finalHistory,  // Use the conditional history
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.content;
    } catch (error) {
      console.error('Error calling ChatGPT API:', error);
      throw error;
    }
  }
};

export default ChatGPTService;