// shared.ts

// Approval string to be shared across frontend and backend
export const APPROVAL = {
  YES: "Yes, confirmed.",
  NO: "No, denied.",
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
    console.debug(`[DEBUG][${component}] ${message}`, data ? data : '');
  }
}

export function logInfo(component: string, message: string, data?: any) {
  console.info(`[INFO][${component}] ${message}`, data ? data : '');
}
