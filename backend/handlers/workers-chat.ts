/**
 * Workers-specific chat handler
 * Excludes Claude Code SDK functionality
 */

import { Context } from "hono";
import type { ChatRequest, StreamResponse } from "../../shared/types.ts";
import { globalRegistry as workersRegistry } from "../worker.ts";

export async function handleChatRequest(
  c: Context,
  requestAbortControllers: Map<string, AbortController>
): Promise<Response> {
  try {
    const request: ChatRequest = await c.req.json();
    const { message, requestId, availableAgents } = request;

    if (!message || !requestId) {
      return c.json({ error: "Missing required fields: message, requestId" }, 400);
    }

    // Check if should use orchestrator (multi-agent coordination)
    const shouldUseOrchestrator = shouldUseOrchestratorMode(message, availableAgents);

    if (shouldUseOrchestrator) {
      // Forward to multi-agent handler
      const { handleMultiAgentChatRequest } = await import("./workers-multi-agent.ts");
      return handleMultiAgentChatRequest(c, requestAbortControllers);
    }

    // Single agent chat using Anthropic or OpenAI provider
    const stream = executeSingleAgentChat(request, requestAbortControllers);

    // Set up streaming response
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const data = JSON.stringify(chunk) + "\n";
            controller.enqueue(encoder.encode(data));
          }
          controller.close();
        } catch (error) {
          console.error("[Workers Chat] Stream error:", error);
          controller.error(error);
        } finally {
          requestAbortControllers.delete(requestId);
        }
      },
      cancel() {
        requestAbortControllers.delete(requestId);
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("[Workers Chat] Error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

function shouldUseOrchestratorMode(
  message: string,
  availableAgents?: Array<{ id: string; name: string; description: string }>
): boolean {
  const orchestratorProvider = workersRegistry.getProviderForAgent("orchestrator");

  if (orchestratorProvider?.id !== "anthropic") {
    return false;
  }

  if (availableAgents && availableAgents.length > 0) {
    const mentionMatches = message.match(/@(\w+(?:-\w+)*)/g);
    return mentionMatches && mentionMatches.length > 1 ? true : false;
  }

  return false;
}

async function* executeSingleAgentChat(
  request: ChatRequest,
  requestAbortControllers: Map<string, AbortController>
): AsyncGenerator<StreamResponse> {
  const abortController = new AbortController();
  requestAbortControllers.set(request.requestId, abortController);

  try {
    // Use Anthropic provider for single agent chat
    const provider = workersRegistry.getProvider("anthropic");

    if (!provider) {
      yield {
        type: "error",
        content: "Anthropic provider not available",
        requestId: request.requestId,
        agentId: "system",
      };
      return;
    }

    // Execute chat with provider
    for await (const response of provider.executeChat(
      {
        message: request.message,
        sessionId: request.sessionId,
        requestId: request.requestId,
      },
      {
        debugMode: false,
        abortController,
      }
    )) {
      if (response.type === "text" && response.content) {
        yield {
          type: "text_delta",
          content: response.content,
          requestId: request.requestId,
          agentId: "anthropic",
        };
      } else if (response.type === "done") {
        yield {
          type: "done",
          content: "",
          requestId: request.requestId,
          agentId: "anthropic",
        };
      } else if (response.type === "error") {
        yield {
          type: "error",
          content: response.error || "Unknown error",
          requestId: request.requestId,
          agentId: "anthropic",
        };
      }
    }
  } finally {
    requestAbortControllers.delete(request.requestId);
  }
}
