// shared.ts

// Approval string to be shared across frontend and backend
export const APPROVAL = {
  YES: "approved",
  NO: "rejected",
} as const;

// Logging configuration
export const LOG_LEVEL = {
  DEBUG: "debug",
  INFO: "info",
} as const;

export type LogLevelType = typeof LOG_LEVEL[keyof typeof LOG_LEVEL];

// Current log level setting - change to DEBUG for verbose logging
export let CURRENT_LOG_LEVEL: LogLevelType = LOG_LEVEL.DEBUG;

// Helper function to set log level
export function setLogLevel(level: LogLevelType) {
  CURRENT_LOG_LEVEL = level;
}

// Logging utility functions
export function logDebug(component: string, message: string, data?: any) {
  if (CURRENT_LOG_LEVEL === LOG_LEVEL.DEBUG) {
    console.debug(`[DEBUG][${component}] ${message}`, data ? JSON.stringify(data) : '');
  }
}

export function logInfo(component: string, message: string, data?: any) {
  console.log(`[INFO][${component}] ${message}`, data ? JSON.stringify(data) : '');
}

export function logError(component: string, message: string, error: any, data?: any) {
  console.error(`[ERROR][${component}] ${message}`, { 
    error: error instanceof Error ? { message: error.message, stack: error.stack } : error, 
    data: data ? JSON.stringify(data) : undefined
  });
}
