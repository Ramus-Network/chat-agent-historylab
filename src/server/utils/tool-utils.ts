// utils/tool-utils.ts
// Utilities for processing and executing tool calls

import { formatDataStreamPart, type Message } from "@ai-sdk/ui-utils";
import {
  convertToCoreMessages,
  type DataStreamWriter,
  type ToolExecutionOptions,
  type ToolSet,
} from "ai";
import type { z } from "zod";
import { APPROVAL, logDebug, logInfo, logError } from "../../shared";

/**
 * Checks if a tool name is valid in the given object
 */
function isValidToolName<K extends PropertyKey, T extends object>(
  key: K,
  obj: T
): key is K & keyof T {
  return key in obj;
}

/**
 * Processes tool invocations where human input is required, executing tools when authorized.
 *
 * @param options - The function options
 * @param options.tools - Map of tool names to Tool instances that may expose execute functions
 * @param options.dataStream - Data stream for sending results back to the client
 * @param options.messages - Array of messages to process
 * @param executions - Map of tool names to execute functions
 * @returns Promise resolving to the processed messages
 */
export async function processToolCalls<
  Tools extends ToolSet,
  ExecutableTools extends {
    // biome-ignore lint/complexity/noBannedTypes: it's fine
    [Tool in keyof Tools as Tools[Tool] extends { execute: Function }
      ? never
      : Tool]: Tools[Tool];
  },
>({
  dataStream,
  messages,
  executions,
}: {
  tools: Tools; // used for type inference
  dataStream: DataStreamWriter;
  messages: Message[];
  executions: {
    [K in keyof Tools & keyof ExecutableTools]?: (
      args: z.infer<ExecutableTools[K]["parameters"]>,
      context: ToolExecutionOptions
    ) => Promise<unknown>;
  };
}): Promise<Message[]> {
  logDebug("processToolCalls", "Starting tool calls processing", { messagesCount: messages.length });
  
  const lastMessage = messages[messages.length - 1];
  const parts = lastMessage.parts;
  if (!parts) {
    logDebug("processToolCalls", "No parts found in last message");
    return messages;
  }

  const processedParts = await Promise.all(
    parts.map(async (part) => {
      // Only process tool invocations parts
      logDebug("processToolCalls", "Processing part", { part });
      if (part.type !== "tool-invocation") {
        logDebug("processToolCalls", "Skipping non-tool-invocation part", { partType: part.type });
        return part;
      }

      const { toolInvocation } = part;
      const toolName = toolInvocation.toolName;
      logInfo("processToolCalls", `Processing tool invocation for ${toolName}`, { state: toolInvocation.state });

      // Only continue if we have an execute function for the tool (meaning it requires confirmation) and it's in a 'result' state
      if (!(toolName in executions) || toolInvocation.state !== "result") {
        logDebug("processToolCalls", `Skipping tool ${toolName}`, { 
          hasExecution: toolName in executions,
          state: toolInvocation.state 
        });
        return part;
      }

      let result: unknown;

      if (toolInvocation.result === APPROVAL.YES) {
        logInfo("processToolCalls", `Executing approved tool: ${toolName}`);
        // Get the tool and check if the tool has an execute function.
        if (
          !isValidToolName(toolName, executions) ||
          toolInvocation.state !== "result"
        ) {
          logDebug("processToolCalls", "Invalid tool name or state", { toolName, state: toolInvocation.state });
          return part;
        }

        const toolInstance = executions[toolName];
        if (toolInstance) {
          logInfo("processToolCalls", `Executing approved tool ${toolName}`, { args: toolInvocation.args });
          result = await toolInstance(toolInvocation.args, {
            messages: convertToCoreMessages(messages),
            toolCallId: toolInvocation.toolCallId,
          });
          logInfo("processToolCalls", `Tool ${toolName} execution completed`, { result });
        } else {
          logInfo("processToolCalls", `No execute function found for tool ${toolName}`);
          result = "Error: No execute function found on tool";
        }
      } else if (toolInvocation.result === APPROVAL.NO) {
        logInfo("processToolCalls", `Tool execution denied by user: ${toolName}`);
        // Return a structured object indicating user rejection, not a generic error string.
        result = { 
          status: 'rejected_by_user', 
          toolName: toolName,
          message: 'User denied access to tool execution.' 
        };
      } else {
        logDebug("processToolCalls", "Unhandled tool response", { result: toolInvocation.result });
        // For any unhandled responses, return the original part.
        return part;
      }

      // Forward updated tool result to the client.
      logDebug("processToolCalls", "Sending tool result to client", { 
        toolCallId: toolInvocation.toolCallId,
        result 
      });
      dataStream.write(
        formatDataStreamPart("tool_result", {
          toolCallId: toolInvocation.toolCallId,
          result,
        })
      );

      // Return updated toolInvocation with the actual result.
      return {
        ...part,
        toolInvocation: {
          ...toolInvocation,
          result,
        },
      };
    })
  );

  // Finally return the processed messages
  logDebug("processToolCalls", "Tool calls processing completed", { processedPartsCount: processedParts.length });
  return [...messages.slice(0, -1), { ...lastMessage, parts: processedParts }];
} 