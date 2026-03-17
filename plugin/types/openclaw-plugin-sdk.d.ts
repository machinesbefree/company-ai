declare module "openclaw/plugin-sdk" {
  export type AnyAgentTool = {
    name: string;
    label?: string;
    description: string;
    parameters: unknown;
    execute: (
      toolCallId: string,
      params: any,
    ) => { content: Array<{ type: string; text: string }>; details?: unknown } | Promise<{
      content: Array<{ type: string; text: string }>;
      details?: unknown;
    }>;
  };

  export type PluginLogger = {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };

  export type OpenClawPluginToolContext = {
    config?: unknown;
    workspaceDir?: string;
    agentDir?: string;
    agentId?: string;
    sessionKey?: string;
    sessionId?: string;
    messageChannel?: string;
    agentAccountId?: string;
    requesterSenderId?: string;
    senderIsOwner?: boolean;
    sandboxed?: boolean;
  };

  export type OpenClawPluginToolFactory = (
    ctx: OpenClawPluginToolContext,
  ) => AnyAgentTool | AnyAgentTool[] | null | undefined;

  export type OpenClawPluginCliContext = {
    program: any;
    config: unknown;
    workspaceDir?: string;
    logger: PluginLogger;
  };

  export type OpenClawPluginServiceContext = {
    config: unknown;
    workspaceDir?: string;
    stateDir: string;
    logger: PluginLogger;
  };

  export type OpenClawPluginService = {
    id: string;
    start: (ctx: OpenClawPluginServiceContext) => void | Promise<void>;
    stop?: (ctx: OpenClawPluginServiceContext) => void | Promise<void>;
  };

  export type GatewayRequestHandlerOptions = {
    params: Record<string, unknown>;
    respond: (
      ok: boolean,
      payload?: unknown,
      error?: unknown,
      meta?: Record<string, unknown>,
    ) => void;
  };

  export type OpenClawPluginApi = {
    id: string;
    name: string;
    version?: string;
    description?: string;
    source: string;
    config: unknown;
    pluginConfig?: Record<string, unknown>;
    runtime: unknown;
    logger: PluginLogger;
    registerTool: (
      tool: AnyAgentTool | OpenClawPluginToolFactory,
      opts?: { optional?: boolean },
    ) => void;
    registerGatewayMethod: (
      method: string,
      handler: (opts: GatewayRequestHandlerOptions) => void | Promise<void>,
    ) => void;
    registerCli: (registrar: (ctx: OpenClawPluginCliContext) => void | Promise<void>, opts?: {
      commands?: string[];
    }) => void;
    registerService: (service: OpenClawPluginService) => void;
    on: (hookName: string, handler: (...args: any[]) => unknown, opts?: {
      priority?: number;
    }) => void;
  };

  export type OpenClawPluginDefinition = {
    id?: string;
    name?: string;
    description?: string;
    version?: string;
    register?: (api: OpenClawPluginApi) => void | Promise<void>;
  };
}
