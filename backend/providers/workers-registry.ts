/**
 * Workers-specific Provider Registry
 * Excludes ClaudeCodeProvider which requires Node.js file system APIs
 */

import type { AgentProvider } from "./types.ts";
import { OpenAIProvider } from "./openai.ts";
import { AnthropicProvider } from "./anthropic.ts";

export interface AgentConfiguration {
  id: string;
  name: string;
  description: string;
  provider: string; // "openai" | "anthropic"
  apiEndpoint?: string;
  workingDirectory?: string;
  isOrchestrator?: boolean;
  config?: {
    apiKey?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

export class WorkersProviderRegistry {
  private providers = new Map<string, AgentProvider>();
  private agentConfigs = new Map<string, AgentConfiguration>();
  private initialized = false;

  isInitialized(): boolean {
    return this.initialized;
  }

  markAsInitialized(): void {
    this.initialized = true;
  }

  registerProvider(provider: AgentProvider): void {
    this.providers.set(provider.id, provider);
  }

  registerAgent(config: AgentConfiguration): void {
    this.agentConfigs.set(config.id, config);
  }

  getProvider(providerId: string): AgentProvider | undefined {
    return this.providers.get(providerId);
  }

  getAgent(agentId: string): AgentConfiguration | undefined {
    return this.agentConfigs.get(agentId);
  }

  getAllAgents(): AgentConfiguration[] {
    return Array.from(this.agentConfigs.values());
  }

  getProviderForAgent(agentId: string): AgentProvider | undefined {
    const config = this.getAgent(agentId);
    if (!config) return undefined;
    return this.getProvider(config.provider);
  }

  /**
   * Initialize Workers-compatible providers only
   */
  initializeProviders(options: {
    openaiApiKey?: string;
    anthropicApiKey?: string;
  }): void {
    if (options.openaiApiKey) {
      const openaiProvider = new OpenAIProvider(options.openaiApiKey);
      this.registerProvider(openaiProvider);
    }

    if (options.anthropicApiKey) {
      const anthropicProvider = new AnthropicProvider(options.anthropicApiKey);
      this.registerProvider(anthropicProvider);
    }
  }

  /**
   * Create default agent configurations for Workers
   */
  createDefaultAgents(): void {
    // UX Designer agent (OpenAI)
    if (this.getProvider("openai")) {
      this.registerAgent({
        id: "ux-designer",
        name: "UX Designer",
        description: "OpenAI-powered UX designer for analyzing interfaces and providing design feedback",
        provider: "openai",
        config: {
          temperature: 0.7,
          maxTokens: 2000,
        },
      });
    }

    // Orchestrator agent (Anthropic)
    if (this.getProvider("anthropic")) {
      this.registerAgent({
        id: "orchestrator",
        name: "Orchestrator",
        description: "Coordinates multi-agent workflows and manages task delegation",
        provider: "anthropic",
        isOrchestrator: true,
        config: {
          temperature: 0.7,
          maxTokens: 4000,
        },
      });
    }
  }
}
