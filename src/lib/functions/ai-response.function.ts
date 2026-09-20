import {
  buildDynamicMessages,
  deepVariableReplacer,
  extractVariables,
  getByPath,
  getStreamingContent,
} from "./common.function";
import {
  AIPriorityConfig,
  Message,
  TYPE_PROVIDER,
} from "@/types";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import curl2Json from "@bany/curl-to-json";
import { shouldUsePluelyAPI } from "./pluely.api";
import { CHUNK_POLL_INTERVAL_MS } from "../chat-constants";
import { getResponseSettings, RESPONSE_LENGTHS, LANGUAGES } from "@/lib";
import { MARKDOWN_FORMATTING_INSTRUCTIONS } from "@/config/constants";

// In-memory cooldown tracking for circuit breaker: providerId -> expiration timestamp (ms)
const providerCooldowns = new Map<string, number>();
let roundRobinCounter = 0;

export function getProviderCooldown(providerId: string): number {
  if (!providerId) return 0;
  const expiresAt = providerCooldowns.get(providerId);
  if (!expiresAt) return 0;
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) {
    providerCooldowns.delete(providerId);
    return 0;
  }
  return remaining;
}

export function setProviderCooldown(
  providerId: string,
  durationMs: number = 60000
) {
  if (!providerId) return;
  providerCooldowns.set(providerId, Date.now() + durationMs);
}

export function clearProviderCooldown(providerId: string) {
  if (!providerId) return;
  providerCooldowns.delete(providerId);
}

function isErrorChunk(chunk: string): boolean {
  if (!chunk || typeof chunk !== "string") return false;
  return (
    chunk.startsWith("API request failed:") ||
    chunk.startsWith("Network error during API request:") ||
    chunk.startsWith("Pluely API Error:") ||
    chunk.startsWith("Failed to parse non-streaming response:") ||
    chunk.startsWith("Streaming not supported or response body missing") ||
    chunk.startsWith("Error reading stream:") ||
    chunk.startsWith("Error in fetchAIResponse:") ||
    chunk.startsWith("Missing required variable:") ||
    chunk.startsWith("Provider not provided")
  );
}

function buildEnhancedSystemPrompt(baseSystemPrompt?: string): string {
  const responseSettings = getResponseSettings();
  const prompts: string[] = [];

  if (baseSystemPrompt) {
    prompts.push(baseSystemPrompt);
  }

  const lengthOption = RESPONSE_LENGTHS.find(
    (l) => l.id === responseSettings.responseLength
  );
  if (lengthOption?.prompt?.trim()) {
    prompts.push(lengthOption.prompt);
  }

  const languageOption = LANGUAGES.find(
    (l) => l.id === responseSettings.language
  );
  if (languageOption?.prompt?.trim()) {
    prompts.push(languageOption.prompt);
  }

  // Add markdown formatting instructions
  prompts.push(MARKDOWN_FORMATTING_INSTRUCTIONS);

  return prompts.join(" ");
}

// Pluely AI streaming function
async function* fetchPluelyAIResponse(params: {
  systemPrompt?: string;
  userMessage: string;
  imagesBase64?: string[];
  history?: Message[];
  signal?: AbortSignal;
}): AsyncIterable<string> {
  try {
    const {
      systemPrompt,
      userMessage,
      imagesBase64 = [],
      history = [],
      signal,
    } = params;

    // Check if already aborted before starting
    if (signal?.aborted) {
      return;
    }

    // Convert history to the expected format
    let historyString: string | undefined;
    if (history.length > 0) {
      // Create a copy before reversing to avoid mutating the original array
      const formattedHistory = [...history].reverse().map((msg) => ({
        role: msg.role,
        content: [{ type: "text", text: msg.content }],
      }));
      historyString = JSON.stringify(formattedHistory);
    }

    // Handle images - can be string or array
    let imageBase64: any = undefined;
    if (imagesBase64.length > 0) {
      imageBase64 = imagesBase64.length === 1 ? imagesBase64[0] : imagesBase64;
    }

    // Set up streaming event listener
    let streamComplete = false;
    const streamChunks: string[] = [];

    const unlisten = await listen<string>("chat_stream_chunk", (event) => {
      streamChunks.push(event.payload);
    });

    const unlistenComplete = await listen("chat_stream_complete", () => {
      streamComplete = true;
    });

    try {
      if (signal?.aborted) {
        unlisten();
        unlistenComplete();
        return;
      }

      await invoke("chat_stream_response", {
        userMessage,
        systemPrompt,
        imageBase64,
        history: historyString,
      });

      let lastIndex = 0;
      while (!streamComplete) {
        if (signal?.aborted) {
          unlisten();
          unlistenComplete();
          return;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, CHUNK_POLL_INTERVAL_MS)
        );

        if (signal?.aborted) {
          unlisten();
          unlistenComplete();
          return;
        }

        for (let i = lastIndex; i < streamChunks.length; i++) {
          yield streamChunks[i];
        }
        lastIndex = streamChunks.length;
      }

      if (signal?.aborted) {
        unlisten();
        unlistenComplete();
        return;
      }

      for (let i = lastIndex; i < streamChunks.length; i++) {
        yield streamChunks[i];
      }
    } finally {
      unlisten();
      unlistenComplete();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    yield `Pluely API Error: ${errorMessage}`;
  }
}

async function* executeSingleProvider(params: {
  provider: TYPE_PROVIDER;
  selectedProvider: {
    provider: string;
    variables: Record<string, string>;
  };
  systemPrompt?: string;
  history?: Message[];
  userMessage: string;
  imagesBase64?: string[];
  signal?: AbortSignal;
}): AsyncIterable<string> {
  const {
    provider,
    selectedProvider,
    systemPrompt,
    history = [],
    userMessage,
    imagesBase64 = [],
    signal,
  } = params;

  if (signal?.aborted) return;

  let curlJson;
  try {
    curlJson = curl2Json(provider.curl);
  } catch (error) {
    throw new Error(
      `Failed to parse curl: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }

  const extractedVariables = extractVariables(provider.curl);
  const requiredVars = extractedVariables.filter(
    ({ key }) => key !== "SYSTEM_PROMPT" && key !== "TEXT" && key !== "IMAGE"
  );
  for (const { key } of requiredVars) {
    if (
      !selectedProvider.variables?.[key] ||
      selectedProvider.variables[key].trim() === ""
    ) {
      throw new Error(
        `Missing required variable: ${key}. Please configure it in settings.`
      );
    }
  }

  if (!userMessage) {
    throw new Error("User message is required");
  }
  if (imagesBase64.length > 0 && !provider.curl.includes("{{IMAGE}}")) {
    throw new Error(
      `Provider ${provider?.id ?? "unknown"} does not support image input`
    );
  }

  let bodyObj: any = curlJson.data
    ? JSON.parse(JSON.stringify(curlJson.data))
    : {};
  const messagesKey = Object.keys(bodyObj).find((key) =>
    ["messages", "contents", "conversation", "history"].includes(key)
  );

  if (messagesKey && Array.isArray(bodyObj[messagesKey])) {
    const finalMessages = buildDynamicMessages(
      bodyObj[messagesKey],
      history,
      userMessage,
      imagesBase64
    );
    bodyObj[messagesKey] = finalMessages;
  }

  const allVariables = {
    ...Object.fromEntries(
      Object.entries(selectedProvider.variables).map(([key, value]) => [
        key.toUpperCase(),
        value,
      ])
    ),
    SYSTEM_PROMPT: systemPrompt || "",
  };

  bodyObj = deepVariableReplacer(bodyObj, allVariables);
  let url = deepVariableReplacer(curlJson.url || "", allVariables);

  const headers = deepVariableReplacer(curlJson.header || {}, allVariables);
  headers["Content-Type"] = "application/json";

  if (provider?.streaming) {
    if (typeof bodyObj === "object" && bodyObj !== null) {
      const streamKey = Object.keys(bodyObj).find(
        (k) => k.toLowerCase() === "stream"
      );
      if (streamKey) {
        bodyObj[streamKey] = true;
      } else {
        bodyObj.stream = true;
      }
    }
  }

  const fetchFunction = tauriFetch;

  let response;
  try {
    response = await fetchFunction(url, {
      method: curlJson.method || "POST",
      headers,
      body: curlJson.method === "GET" ? undefined : JSON.stringify(bodyObj),
      signal,
    });
  } catch (fetchError) {
    if (
      signal?.aborted ||
      (fetchError instanceof Error && fetchError.name === "AbortError")
    ) {
      return;
    }
    yield `Network error during API request: ${
      fetchError instanceof Error ? fetchError.message : "Unknown error"
    }`;
    return;
  }

  if (!response.ok) {
    let errorText = "";
    try {
      errorText = await response.text();
    } catch {}
    yield `API request failed: ${response.status} ${response.statusText}${
      errorText ? ` - ${errorText}` : ""
    }`;
    return;
  }

  if (!provider?.streaming) {
    let json;
    try {
      json = await response.json();
    } catch (parseError) {
      yield `Failed to parse non-streaming response: ${
        parseError instanceof Error ? parseError.message : "Unknown error"
      }`;
      return;
    }
    const content = getByPath(json, provider?.responseContentPath || "") || "";
    yield content;
    return;
  }

  if (!response.body) {
    yield "Streaming not supported or response body missing";
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal?.aborted) {
      reader.cancel();
      return;
    }

    let readResult;
    try {
      readResult = await reader.read();
    } catch (readError) {
      if (
        signal?.aborted ||
        (readError instanceof Error && readError.name === "AbortError")
      ) {
        return;
      }
      yield `Error reading stream: ${
        readError instanceof Error ? readError.message : "Unknown error"
      }`;
      return;
    }
    const { done, value } = readResult;
    if (done) break;

    if (signal?.aborted) {
      reader.cancel();
      return;
    }

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("data:")) {
        const trimmed = line.substring(5).trim();
        if (!trimmed || trimmed === "[DONE]") continue;
        try {
          const parsed = JSON.parse(trimmed);
          const delta = getStreamingContent(
            parsed,
            provider?.responseContentPath || ""
          );
          if (delta) {
            yield delta;
          }
        } catch (e) {
          // Ignore parsing errors for partial chunks
        }
      }
    }
  }
}

export interface FetchAIResponseParams {
  provider?: TYPE_PROVIDER | undefined;
  selectedProvider?: {
    provider: string;
    variables: Record<string, string>;
  };
  priorityConfig?: AIPriorityConfig;
  allAiProviders?: TYPE_PROVIDER[];
  systemPrompt?: string;
  history?: Message[];
  userMessage: string;
  imagesBase64?: string[];
  signal?: AbortSignal;
}

export async function* fetchAIResponse(
  params: FetchAIResponseParams
): AsyncIterable<string> {
  const {
    provider,
    selectedProvider,
    priorityConfig,
    allAiProviders = [],
    systemPrompt,
    history = [],
    userMessage,
    imagesBase64 = [],
    signal,
  } = params;

  if (signal?.aborted) return;

  const enhancedSystemPrompt = buildEnhancedSystemPrompt(systemPrompt);

  const usePluelyAPI = await shouldUsePluelyAPI();
  if (usePluelyAPI) {
    yield* fetchPluelyAIResponse({
      systemPrompt: enhancedSystemPrompt,
      userMessage,
      imagesBase64,
      history,
      signal,
    });
    return;
  }

  // Build candidate slots based on priority config or legacy selectedProvider
  interface SlotCandidate {
    provider: string;
    variables: Record<string, string>;
    priorityIndex: number;
  }

  let slotsToTry: SlotCandidate[] = [];

  if (priorityConfig && Array.isArray(priorityConfig.slots)) {
    priorityConfig.slots.forEach((slot, idx) => {
      if (slot && slot.provider && (idx === 0 || slot.enabled)) {
        slotsToTry.push({
          provider: slot.provider,
          variables: slot.variables || {},
          priorityIndex: idx,
        });
      }
    });
  }

  if (slotsToTry.length === 0 && selectedProvider?.provider) {
    slotsToTry.push({
      provider: selectedProvider.provider,
      variables: selectedProvider.variables || {},
      priorityIndex: 0,
    });
  }

  if (slotsToTry.length === 0) {
    yield "No AI provider configured. Please configure an AI provider in Dev Space.";
    return;
  }

  const strategy = priorityConfig?.strategy || "fallback";

  if (strategy === "round-robin" && slotsToTry.length > 1) {
    const startIdx = roundRobinCounter % slotsToTry.length;
    roundRobinCounter++;
    slotsToTry = [
      ...slotsToTry.slice(startIdx),
      ...slotsToTry.slice(0, startIdx),
    ];
  } else {
    // Priority Fallback mode:
    // If Slot 0 is in cooldown but a fallback slot is healthy, try the healthy fallback first!
    const slot0Cooldown = getProviderCooldown(slotsToTry[0].provider);
    if (slot0Cooldown > 0 && slotsToTry.length > 1) {
      const healthyIdx = slotsToTry.findIndex(
        (s) => getProviderCooldown(s.provider) === 0
      );
      if (healthyIdx > 0) {
        const healthySlot = slotsToTry[healthyIdx];
        slotsToTry = [
          healthySlot,
          ...slotsToTry.filter((_, idx) => idx !== healthyIdx),
        ];
      }
    }
  }

  const errors: string[] = [];

  for (let i = 0; i < slotsToTry.length; i++) {
    const slot = slotsToTry[i];
    if (signal?.aborted) return;

    const targetProvider =
      allAiProviders.find((p) => p.id === slot.provider) ||
      (provider?.id === slot.provider ? provider : undefined);

    if (!targetProvider) {
      errors.push(
        `Priority ${slot.priorityIndex + 1} (${slot.provider}): Provider definition not found`
      );
      continue;
    }

    // Skip provider if images attached and provider does not support images
    if (imagesBase64.length > 0 && !targetProvider.curl.includes("{{IMAGE}}")) {
      if (i < slotsToTry.length - 1) {
        console.warn(
          `[AI Fallback] ${slot.provider} does not support images, trying next priority provider...`
        );
        continue;
      }
    }

    try {
      const generator = executeSingleProvider({
        provider: targetProvider,
        selectedProvider: slot,
        systemPrompt: enhancedSystemPrompt,
        history,
        userMessage,
        imagesBase64,
        signal,
      });

      const iterator = generator[Symbol.asyncIterator]();
      const firstResult = await iterator.next();

      if (firstResult.done) {
        continue;
      }

      const firstChunk = firstResult.value;

      if (isErrorChunk(firstChunk)) {
        const isRateLimitOrQuota =
          firstChunk.includes("429") ||
          firstChunk.toLowerCase().includes("rate limit") ||
          firstChunk.includes("FreeTierError") ||
          firstChunk.includes("403") ||
          firstChunk.toLowerCase().includes("quota");

        setProviderCooldown(slot.provider, isRateLimitOrQuota ? 60000 : 30000);
        errors.push(
          `Priority ${slot.priorityIndex + 1} (${slot.provider}): ${firstChunk.replace(
            /^API request failed:\s*/,
            ""
          )}`
        );

        console.warn(
          `[AI Fallback] Priority ${slot.priorityIndex + 1} (${slot.provider}) failed: ${firstChunk}. Falling back to next provider...`
        );
        continue;
      }

      // Success! Clear cooldown
      clearProviderCooldown(slot.provider);

      if (i > 0) {
        console.info(
          `[AI Fallback] Successfully answered using Priority ${slot.priorityIndex + 1} (${slot.provider})`
        );
      }

      yield firstChunk;

      while (true) {
        if (signal?.aborted) return;
        const nextResult = await iterator.next();
        if (nextResult.done) break;
        yield nextResult.value;
      }

      return;
    } catch (err) {
      if (signal?.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      setProviderCooldown(slot.provider, 30000);
      errors.push(
        `Priority ${slot.priorityIndex + 1} (${slot.provider}): ${msg}`
      );
      console.warn(
        `[AI Fallback] Priority ${slot.priorityIndex + 1} (${slot.provider}) threw error: ${msg}. Trying next...`
      );
      continue;
    }
  }

  if (errors.length > 0) {
    yield (
      `All configured AI providers failed:\n` +
      errors.map((e) => `• ${e}`).join("\n")
    );
  } else {
    yield "AI request failed: No response received from any provider.";
  }
}

export const fetchAIResponseWithFallback = fetchAIResponse;
