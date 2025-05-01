// server.ts
// This file is maintained for backward compatibility
// The actual implementation has been moved to the server directory

// Re-export the server implementation
export { default } from "./server/index";
export { agentContext } from "./server/models/chat";
export { Chat } from "./server/models/chat";
export * from "./server/types";
