import { OpenAIEmbeddings, AzureOpenAIEmbeddings } from "@langchain/openai";
import { getEmbeddingModelConfig } from "../config/ai-models.js";
import ServerLoggingService from "./ServerLoggingService.js";
import dotenv from "dotenv";
import { Embedding } from "../models/embedding.js";
import { SentenceEmbedding } from "../models/sentenceEmbedding.js";
import { Chat } from "../models/chat.js";
import { Interaction } from "../models/interaction.js";
import dbConnect from "../api/db/db-connect.js";
import mongoose from "mongoose";

dotenv.config();

class EmbeddingService {
  /**
   * Creates an embedding client using LangChain's OpenAIEmbeddings
   * @param {string} provider - The provider to use (openai or azure)
   * @param {string|null} modelName - Optional specific model name, otherwise default is used
   * @returns {OpenAIEmbeddings|null} The embedding client or null if creation failed
   */
  createEmbeddingClient(provider = "openai", modelName = null) {
    try {
      if (provider === "openai") {
        if (!process.env.OPENAI_API_KEY) {
          ServerLoggingService.error(
            "OpenAI API key not found",
            "embedding-service"
          );
          return null;
        }

        const modelConfig = getEmbeddingModelConfig("openai", modelName);

        return new OpenAIEmbeddings({
          openAIApiKey: process.env.OPENAI_API_KEY,
          modelName: modelConfig.name,
          dimensions: modelConfig.dimensions,
          timeout: modelConfig.timeoutMs,
          maxRetries: 3,
        });
      } else if (provider === "azure") {
        if (
          !process.env.AZURE_OPENAI_API_KEY ||
          !process.env.AZURE_OPENAI_ENDPOINT
        ) {
          ServerLoggingService.error(
            "Azure OpenAI credentials not found",
            "embedding-service"
          );
          return null;
        }

        const modelConfig =
          getEmbeddingModelConfig(provider, modelName) ||
          getEmbeddingModelConfig("openai", modelName);

        let instanceName = process.env.AZURE_OPENAI_ENDPOINT.replace(
          "https://",
          ""
        ).replace(".openai.azure.com/", "");

        const embeddings = new AzureOpenAIEmbeddings({
          azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
          azureOpenAIApiInstanceName: instanceName,
          azureOpenAIApiEmbeddingsDeploymentName: modelConfig.name,
          azureOpenAIApiVersion: "2024-02-01",
          dimensions: modelConfig.dimensions,
          timeout: modelConfig.timeoutMs,
          maxRetries: 3,
        });
        return embeddings;
      } else {
        throw new Error(`Unsupported embedding provider: ${provider}`);
      }
    } catch (error) {
      ServerLoggingService.error(
        `Error creating embedding client for ${provider}`,
        "embedding-service",
        error
      );
      return null;
    }
  }

  cleanTextForEmbedding(text) {
    return text
      .replace(/<s-\d+>|<\/s-\d+>/g, "") // remove <s-1>, </s-1>, etc.
      .replace(/\\n/g, " ") // replace \n with space
      .trim();
  }

  /**
   * Format a sequence of questions into a single labelled flow string
   * suitable for a questionsEmbedding query, e.g.:
   *  "Question 1: ...\nQuestion 2: ..."
   * @param {string[]} questions
   * @returns {string}
   */
  formatQuestionsForEmbedding(questions = []) {
    if (!Array.isArray(questions) || questions.length === 0) return '';
    const labeled = [];
    for (let i = 0; i < questions.length; i++) {
      const cleaned = this.cleanTextForEmbedding(String(questions[i] || ''));
      if (cleaned) labeled.push(`Question ${i + 1}: ${cleaned}`.trim());
    }
    return labeled.join("\n");
  }

  async createEmbedding(interaction, provider = "openai", modelName = null) {
    try {
      const populatedInteraction = await interaction.populate(
        "question answer"
      );

      if (!populatedInteraction.question || !populatedInteraction.answer) {
        throw new Error("Interaction must have both question and answer");
      }

      const chat = await Chat.findOne({
        interactions: { $elemMatch: { $eq: interaction._id } },
      }).populate({
        path: "interactions",
        populate: {
          path: "question answer",
        },
      });

      if (!chat) {
        throw new Error("Chat not found for this interaction");
      }

      // Find the current interaction index
      const currentInteractionIndex = chat.interactions.findIndex(
        (i) => i._id.toString() === interaction._id.toString()
      );

      if (currentInteractionIndex === -1) {
        throw new Error("Interaction not found in chat");
      }

      // Collect all previous questions with labels (excluding current)
      const labeledQuestions = [];
      let questionCounter = 1;

      // Handle previous questions (if any)
      for (let i = 0; i < currentInteractionIndex; i++) {
        const chatInteraction = chat.interactions[i];
        if (chatInteraction.question) {
          const cleanedQuestion = this.cleanTextForEmbedding(
            chatInteraction.question.englishQuestion ||
              chatInteraction.question.redactedQuestion
          );
          if (cleanedQuestion.trim()) {
            const labeledQuestion = `Question ${questionCounter}: ${cleanedQuestion}`;
            labeledQuestions.push(labeledQuestion);
            questionCounter++;
          }
        }
      }

      // Process current question
      const questionText = this.cleanTextForEmbedding(
        populatedInteraction.question.englishQuestion ||
          populatedInteraction.question.redactedQuestion
      );
      const answerText = this.cleanTextForEmbedding(
        populatedInteraction.answer.englishAnswer ||
          populatedInteraction.answer.content
      );

      // The current question/answer number is based on previous questions count + 1
      const currentQuestionNumber = questionCounter;
      const labeledQuestionText = `Question ${currentQuestionNumber}: ${questionText}`;
      const labeledAnswerText = answerText.trim()
        ? `Answer ${currentQuestionNumber}: ${answerText}`
        : "";

      // Process sentences
      const sentences = populatedInteraction.answer.sentences || [];
      const cleanedSentences = sentences
        .map((sentence, index) => {
          const cleaned = this.cleanTextForEmbedding(sentence);
          return cleaned.trim() ? `Sentence ${index + 1}: ${cleaned}` : null;
        })
        .filter(Boolean);

      // Create properly formatted texts for embedding
      const textsToEmbed = [
        labeledQuestionText.trim(), // For questionEmbedding
        labeledQuestions.length > 0
          ? [...labeledQuestions, labeledQuestionText].join("\n")
          : labeledQuestionText.trim(), // For questionsEmbedding - all previous questions + current question
        labeledAnswerText.trim(), // For answerEmbedding
        [...labeledQuestions, labeledQuestionText, labeledAnswerText]
          .filter((text) => text.trim())
          .join("\n"), // For questionsAnswerEmbedding with newlines
        ...cleanedSentences,
      ].filter((text) => text.trim());

      const embeddings = await this.embedDocuments(
        textsToEmbed,
        provider,
        modelName
      );

      const sentenceEmbeddings = embeddings.slice(
        4,
        4 + cleanedSentences.length
      );

      const embeddingDoc = {
        chatId: chat._id,
        interactionId: interaction._id,
        questionId: populatedInteraction.question._id,
        answerId: populatedInteraction.answer._id,
        questionEmbedding: embeddings[0],
        questionsEmbedding: embeddings[1],
        answerEmbedding: embeddings[2],
        questionsAnswerEmbedding: embeddings[3],
       
      };
      await dbConnect();
      const newEmbedding = await Embedding.create(embeddingDoc);

      if (sentenceEmbeddings.length > 0) {
        const sentenceEmbeddingDocs = sentenceEmbeddings.map(
          (embedding, index) => ({
            parentEmbeddingId: newEmbedding._id,
            sentenceIndex: index,
            embedding: embedding,
          })
        );
        await SentenceEmbedding.insertMany(sentenceEmbeddingDocs);
      }

      // Log embedding dimensions
      const dims = {
        questionEmbedding: embeddingDoc.questionEmbedding?.length,
        questionsEmbedding: embeddingDoc.questionsEmbedding?.length,
        answerEmbedding: embeddingDoc.answerEmbedding?.length,
        questionsAnswerEmbedding: embeddingDoc.questionsAnswerEmbedding?.length,
        sentenceEmbeddings: Array.isArray(sentenceEmbeddings)
          ? sentenceEmbeddings.map((e) => e?.length)
          : [],
      };
      ServerLoggingService.info(
        `Embedding successfully created and saved. Dimensions: ${JSON.stringify(dims)}`,
        "embedding-service"
      );

      return newEmbedding;
    } catch (error) {
      ServerLoggingService.error(
        "Error creating embeddings for interaction",
        "embedding-service",
        error
      );
      throw error;
    }
  }

  async embedDocuments(texts, provider = "openai", modelName = null) {
    const client = this.createEmbeddingClient(provider, modelName);
    if (!client) {
      throw new Error("Failed to create embedding client");
    }
    return await client.embedDocuments(texts);
  }

  /**
   * Tests the embedding service with a sample string
   * @param {string} testString - The string to test embedding with
   * @param {string} provider - The provider to use (openai or azure)
   * @param {string|null} modelName - Optional specific model name
   * @returns {Object} Object containing success status and embedding results
   */
  async testEmbedding(
    testString = "This is a test string",
    provider = "openai",
    modelName = null
  ) {
    try {
      const client = this.createEmbeddingClient(provider, modelName);
      if (!client) {
        throw new Error("Failed to create embedding client");
      }

      const cleanedText = this.cleanTextForEmbedding(testString);
      const embedding = await client.embedQuery(cleanedText);

      return {
        success: true,
        provider,
        modelName: modelName || "default",
        embedding: embedding,
        dimensions: embedding.length,
        inputText: cleanedText,
      };
    } catch (error) {
      ServerLoggingService.error(
        "Error testing embedding service",
        "embedding-service",
        error
      );
      return {
        success: false,
        provider,
        modelName: modelName || "default",
        error: error.message,
        inputText: testString,
      };
    }
  }

  /**
   * Process interactions without embeddings for a specified duration.
   * @param {number} duration - Duration in seconds to process interactions.
   * @param {function} progressCallback - Callback to report progress.
   */
  async processEmbeddingForDuration(
    duration,
    skipExisting = true,
    lastProcessedId = null,
    provider = "openai"
  ) {
    const startTime = Date.now();
    let lastId = lastProcessedId;
    let processedCount = 0;

    try {
      await dbConnect();

      // If skipExisting is false and this is the first batch (no lastProcessedId), delete all existing embeddings
      if (!skipExisting && !lastProcessedId) {
        ServerLoggingService.info(
          "Regenerating all embeddings - deleting existing embeddings",
          "system"
        );

        // Delete all sentence embeddings first
        const deletedSentenceEmbeddings = await SentenceEmbedding.deleteMany({});
        ServerLoggingService.info(
          `Deleted ${deletedSentenceEmbeddings.deletedCount} sentence embeddings`,
          "system"
        );

        // Delete all embeddings
        const deletedCount = await Embedding.deleteMany({});
        ServerLoggingService.info(
          `Deleted ${deletedCount.deletedCount} embeddings`,
          "system"
        );

        // Clear embedding references in interactions
        await Interaction.updateMany(
          { autoEval: { $exists: true } },
          { $unset: { autoEval: "" } }
        );
        ServerLoggingService.info(
          "Cleared embedding references in interactions",
          "system"
        );
      }

      // Get all interaction IDs that already have embeddings
      const existingEmbeddingIds = (
        await Embedding.find({}, { interactionId: 1 })
      ).map((e) => e.interactionId.toString());

      // Find interactions that don't have embeddings
      const query = {
        _id: { $nin: existingEmbeddingIds },
      };

      // Add pagination using lastProcessedId if provided
      if (lastId) {
        query._id = { $gt: new mongoose.Types.ObjectId(lastId) };
      }

      const interactions = await Interaction.find(query)
        .sort({ _id: 1 })
        .limit(100) // Process in batches of 100
        .populate("question answer");

      const total = interactions.length;

      ServerLoggingService.info(
        `Found ${total} interactions without embeddings`,
        "embedding-service"
      );

      for (const interaction of interactions) {
        if ((Date.now() - startTime) / 1000 >= duration) {
          ServerLoggingService.info(
            `Processing duration limit (${duration}s) reached.`,
            "embedding-service"
          );
          break;
        }

        // Check if the interaction belongs to a chat
        const chatExists = await Chat.exists({ interactions: interaction._id });

        if (!chatExists) {
          ServerLoggingService.warn(
            `Skipping embedding for interaction ${interaction._id} as it does not belong to a chat.`,
            "embedding-service"
          );
          // Update lastId even if skipped, to ensure progress
          lastId = interaction._id.toString();
          // Add the skipped ID to our existing IDs list to prevent reprocessing attempts
          existingEmbeddingIds.push(interaction._id.toString());
          continue; // Skip to the next interaction
        }

        try {
          await this.createEmbedding(interaction, provider);
          processedCount++;
        } catch (error) {
          ServerLoggingService.error(
            `Error creating embedding for interaction ${interaction._id}`,
            "embedding-service",
            error
          );
          // Continue processing other interactions even if one fails
        } finally {
          // Always update lastId and add to existingEmbeddingIds regardless of success or failure
          lastId = interaction._id.toString();
          // Add the processed ID to our existing IDs list to prevent reprocessing
          existingEmbeddingIds.push(interaction._id.toString());
        }
      }

      // Calculate remaining count using the updated existingEmbeddingIds
      const remainingQuery = {
        _id: {
          $nin: existingEmbeddingIds,
          $gt: new mongoose.Types.ObjectId(
            lastId || "000000000000000000000000"
          ),
        },
      };

      return {
        completed: processedCount,
        total,
        remaining: await Interaction.countDocuments(remainingQuery),
        lastProcessedId: lastId,
        duration: Math.round((Date.now() - startTime) / 1000),
      };
    } catch (error) {
      ServerLoggingService.error(
        "Error processing interactions for duration",
        "embedding-service",
        error
      );
      throw error;
    }
  }
}

export default new EmbeddingService();
