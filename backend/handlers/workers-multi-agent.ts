/**
 * Workers-specific multi-agent chat handler
 * Uses only API-based providers (Anthropic, OpenAI)
 */

import { Context } from "hono";
import type { ChatRequest, StreamResponse } from "../../shared/types.ts";
import { globalRegistry as workersRegistry } from "../worker.ts";

export async function handleMultiAgentChatRequest(
  c: Context,
  requestAbortControllers: Map<string, AbortController>
): Promise<Response> {
  try {
    const request: ChatRequest = await c.req.json();
    const stream = executeMultiAgentChat(request, requestAbortControllers);

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
          console.error("[Workers Multi-Agent] Stream error:", error);
          controller.error(error);
        } finally {
          requestAbortControllers.delete(request.requestId);
        }
      },
      cancel() {
        requestAbortControllers.delete(request.requestId);
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
    console.error("[Workers Multi-Agent] Error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

async function* executeMultiAgentChat(
  request: ChatRequest,
  requestAbortControllers: Map<string, AbortController>
): AsyncGenerator<StreamResponse> {
  const abortController = new AbortController();
  requestAbortControllers.set(request.requestId, abortController);

  try {
    // Use orchestrator (Anthropic provider)
    const orchestrator = workersRegistry.getProviderForAgent("orchestrator");

    if (!orchestrator) {
      yield {
        type: "error",
        content: "Orchestrator not available",
        requestId: request.requestId,
        agentId: "system",
      };
      return;
    }

    // Build context from available agents
    let contextMessage = request.message;
    if (request.availableAgents && request.availableAgents.length > 0) {
      const agentsList = request.availableAgents
        .map((a) => `- @${a.id}: ${a.description}`)
        .join("\n");
      contextMessage = `Available agents:\n${agentsList}\n\nUser request:\n${request.message}`;
    }

    // Execute with orchestrator
    for await (const response of orchestrator.executeChat(
      {
        message: contextMessage,
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
          agentId: "orchestrator",
        };
      } else if (response.type === "done") {
        yield {
          type: "done",
          content: "",
          requestId: request.requestId,
          agentId: "orchestrator",
        };
      } else if (response.type === "error") {
        yield {
          type: "error",
          content: response.error || "Unknown error",
          requestId: request.requestId,
          agentId: "orchestrator",
        };
      }
    }
  } finally {
    requestAbortControllers.delete(request.requestId);
  }
}
