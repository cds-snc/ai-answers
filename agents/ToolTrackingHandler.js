import { ConsoleCallbackHandler } from '@langchain/core/tracers/console';
import ServerLoggingService from '../services/ServerLoggingService.js';

/**
 * Custom callback handler to track tool usage in LangChain agents
 * Records tools used, their parameters, outputs, and any errors
 */
class ToolTrackingHandler extends ConsoleCallbackHandler {
    constructor(chatId) {
        super();
        this.toolCalls = [];
        this.chatId = chatId;
    }

    async handleToolStart(tool, input, runId, parentRunId, tags, metadata, runName) {
        try {
            await super.handleToolStart(tool, input);
            const toolName = runName || tool.name || tool.bound?.name || "Unknown Tool";
            this.toolCalls.push({
                tool: toolName,
                input: input,
                startTime: Date.now(),
                status: 'started',
                error: 'none'
            });
            ServerLoggingService.debug(`Tool execution started: ${this.chatId}`, this.chatId, { input });
        } catch (error) {
            ServerLoggingService.error(`Error in handleToolStart: ${error.message}`, this.chatId, error);
            // Don't throw, just log the error
        }
    }

    async handleToolEnd(output, runId) {
        try {
            await super.handleToolEnd(output, runId);
            const lastToolCall = this.toolCalls[this.toolCalls.length - 1];
            if (lastToolCall) {
                lastToolCall.output = output.content;
                lastToolCall.endTime = Date.now();
                lastToolCall.duration = lastToolCall.endTime - lastToolCall.startTime;
                lastToolCall.status = 'completed';
                ServerLoggingService.debug(`Tool execution completed: ${lastToolCall.tool}`, this.chatId, {
                    duration: lastToolCall.duration,
                    output: typeof output === 'object' ? JSON.stringify(output) : output
                });
            }
        } catch (error) {
            ServerLoggingService.error(`Error in handleToolEnd: ${error.message}`, this.chatId, error);
            // Don't throw, just log the error
        }
    }

    async handleToolError(error, runId) {
        try {
            await super.handleToolError(error, runId);
            const lastToolCall = this.toolCalls[this.toolCalls.length - 1];
            if (lastToolCall) {
                const errorMessage = error.message || String(error);
                lastToolCall.error = errorMessage;
                lastToolCall.endTime = Date.now();
                lastToolCall.duration = lastToolCall.endTime - lastToolCall.startTime;
                lastToolCall.status = 'error';
                ServerLoggingService.error(`Tool execution failed: ${lastToolCall.tool}`, this.chatId, errorMessage);
            }
        } catch (handlerError) {
            ServerLoggingService.error(`Error in handleToolError: ${handlerError.message}`, this.chatId, handlerError);
            // Don't throw, just log the error
        }
    }

    getToolUsageSummary() {
        return this.toolCalls.map(({ startTime, endTime, ...call }) => ({
            ...call,
            // Clean up output/error for summary to avoid circular references
            output: call.output ? String(call.output).substring(0, 500) : undefined,
            error: call.error ? String(call.error).substring(0, 500) : undefined
        }));
    }
}

export { ToolTrackingHandler };