declare module "undici" {
  export class Agent {
    constructor(options?: {
      connect?: {
        lookup?: (
          hostname: string,
          options: unknown,
          callback: (err: Error | null, address: string, family: number) => void
        ) => void;
      };
    });
  }

  export function fetch(
    input: RequestInfo | URL,
    init?: RequestInit & { dispatcher?: Agent }
  ): Promise<Response>;
}

declare module "http-proxy-middleware" {
  import type * as http from "node:http";

  export interface ProxyMiddlewareOptions {
    target?: string;
    changeOrigin?: boolean;
    pathRewrite?:
      | Record<string, string>
      | ((path: string, req: http.IncomingMessage) => string);
    on?: {
      proxyReq?: (
        proxyReq: http.ClientRequest,
        req: http.IncomingMessage,
        res: http.ServerResponse
      ) => void;
      proxyRes?: (
        proxyRes: http.IncomingMessage,
        req: http.IncomingMessage,
        res: http.ServerResponse
      ) => void;
      error?: (
        err: Error,
        req: http.IncomingMessage,
        res: http.ServerResponse
      ) => void;
    };
    [key: string]: unknown;
  }

  export function createProxyMiddleware(
    options: ProxyMiddlewareOptions
  ): (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: (err?: unknown) => void
  ) => void;
}
