import { useEffect, useState, useCallback, useRef } from "react";
import { useWindowResize, useGlobalShortcuts, useSystemPrompts } from ".";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useApp } from "@/contexts";
import { fetchSTT, fetchAIResponse } from "@/lib/functions";
import {
  DEFAULT_QUICK_ACTIONS,
  DEFAULT_SYSTEM_PROMPT,
  STORAGE_KEYS,
} from "@/config";
import {
  safeLocalStorage,
  shouldUsePluelyAPI,
  generateConversationTitle,
  saveConversation,
  CONVERSATION_SAVE_DEBOUNCE_MS,
  generateConversationId,
  generateMessageId,
  getResponseSettings,
} from "@/lib";
import { Message } from "@/types/completion";

function isLikelyQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.endsWith("?")) return true;
  const lower = trimmed.toLowerCase();
  const questionStarters = [
    "what",
    "why",
    "how",
    "who",
    "where",
    "when",
    "which",
    "whose",
    "can you",
    "could you",
    "would you",
    "will you",
    "should you",
    "do you",
    "did you",
    "have you",
    "tell me",
    "explain",
    "describe",
    "is there",
    "are there",
    "is it",
    "are you",
  ];
  return questionStarters.some(
    (starter) => lower.startsWith(starter) || lower.includes(` ${starter} `)
  );
}

export type ResponseFormat = "auto" | "code_3tier" | "star" | "bullets" | "deep_dive";

export const FORMAT_PROMPTS: Record<Exclude<ResponseFormat, "auto">, string> = {
  code_3tier:
    "Structure the solution with a progressive 3-tier breakdown:\n" +
    "1. 🔴 **Brute Force Approach**: Naive approach logic, Time & Space Complexity (e.g. O(N²) or exponential), and code snippet explaining why it is inefficient.\n" +
    "2. 🟡 **Better Approach**: The optimization intuition (e.g. hash map, two pointers, binary search, sorting, DP), Time & Space Complexity, and code snippet.\n" +
    "3. 🟢 **Optimal Solution**: The most optimal algorithm, complete clean production-ready code with comments, Time & Space Complexity, and edge cases handled.",
  star:
    "Format the response thoroughly and comprehensively using the **STAR Method** (Situation, Task, Action, Result) for behavioral interview answers:\n" +
    "- **Situation**: Set the scene in detail — describe the company/team context, system scale, specific technical challenge, and what was at stake.\n" +
    "- **Task**: Clearly define the core objective, technical constraints, team roles, and your explicit ownership/responsibility.\n" +
    "- **Action**: Provide an in-depth, step-by-step breakdown of the concrete engineering and architectural actions you took, design decisions made, trade-offs evaluated, and how you navigated roadblocks or collaboration.\n" +
    "- **Result**: Detail the quantifiable business and engineering impact (e.g., % latency reduction, throughput scale, uptime, cost savings, user adoption), along with key learnings.\n" +
    "Deliver a complete, articulate, and compelling first-person narrative ready for the candidate to speak confidently with depth and substance. Avoid overly brief one-liners.",
  bullets:
    "Summarize the answer into 3 to 4 quick, high-impact spoken bullet points that the user can glance at and speak naturally to the interviewer.",
  deep_dive:
    "Provide an in-depth architectural and technical breakdown covering system design components, database choices, scalability bottlenecks, caching strategies, and trade-offs.",
};

export function buildEffectivePrompt(
  baseSystemPrompt?: string,
  context?: string,
  customPrompt?: string,
  forcedFormat?: ResponseFormat
): string {
  let prompt =
    (customPrompt && customPrompt.trim()) ||
    (baseSystemPrompt && baseSystemPrompt.trim()) ||
    DEFAULT_SYSTEM_PROMPT;

  if (context && context.trim()) {
    prompt += `\n\n=== CANDIDATE RESUME / MEETING BACKGROUND CONTEXT ===\n${context.trim()}\n=== INSTRUCTION ===\nWhen answering questions, seamlessly prioritize and reference the candidate's actual projects, background, and experience from the context above. Answer naturally in the first person as the candidate.`;
  }

  // Default system prompt remains minimal. Format instructions applied when format is requested.
  if (forcedFormat && forcedFormat !== "auto") {
    prompt += `\n\n=== RESPONSE FORMAT INSTRUCTION ===\n${FORMAT_PROMPTS[forcedFormat]}`;
  } else if (forcedFormat === "auto") {
    // Minimal guidance without restricting response length or hijacking prompt
    prompt += `\n\nFormat guidance: If answering a coding problem, provide brute force and optimal solutions with time/space complexity. If answering a behavioral question, provide a detailed, substantive STAR response with concrete technical details and metrics.`;
  }

  return prompt;
}

// VAD Configuration interface matching Rust
export interface VadConfig {
  enabled: boolean;
  hop_size: number;
  sensitivity_rms: number;
  peak_threshold: number;
  silence_chunks: number;
  min_speech_chunks: number;
  pre_speech_chunks: number;
  noise_gate_threshold: number;
  max_recording_duration_secs: number;
}

// OPTIMIZED VAD defaults - matches backend exactly for perfect performance
const DEFAULT_VAD_CONFIG: VadConfig = {
  enabled: true,
  hop_size: 1024,
  sensitivity_rms: 0.012, // Much less sensitive - only real speech
  peak_threshold: 0.035, // Higher threshold - filters clicks/noise
  silence_chunks: 45, // ~1.0s of required silence
  min_speech_chunks: 7, // ~0.16s - captures short answers
  pre_speech_chunks: 12, // ~0.27s - enough to catch word start
  noise_gate_threshold: 0.003, // Stronger noise filtering
  max_recording_duration_secs: 180, // 3 minutes default
};

// Chat message interface (reusing from useCompletion)
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  speaker?: "you" | "meeting" | "system";
  content: string;
  image?: string;
  timestamp: number;
}

// Conversation interface (reusing from useCompletion)
export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}


export type useSystemAudioType = ReturnType<typeof useSystemAudio>;

export function useSystemAudio() {
  const { resizeWindow } = useWindowResize();
  const globalShortcuts = useGlobalShortcuts();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [lastTranscription, setLastTranscription] = useState<string>("");
  const [lastSpeaker, setLastSpeaker] =
    useState<"you" | "meeting" | "system">("meeting");
  const [lastAIResponse, setLastAIResponse] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [setupRequired, setSetupRequired] = useState<boolean>(false);
  const [quickActions, setQuickActions] = useState<string[]>([]);
  const [isManagingQuickActions, setIsManagingQuickActions] =
    useState<boolean>(false);
  const [showQuickActions, setShowQuickActions] = useState<boolean>(true);
  const [vadConfig, setVadConfig] = useState<VadConfig>(DEFAULT_VAD_CONFIG);
  const [recordingProgress, setRecordingProgress] = useState<number>(0); // For continuous mode
  const [isContinuousMode, setIsContinuousMode] = useState<boolean>(false);
  const [isRecordingInContinuousMode, setIsRecordingInContinuousMode] =
    useState<boolean>(false);

  const [conversation, setConversation] = useState<ChatConversation>({
    id: "",
    title: "",
    messages: [],
    createdAt: 0,
    updatedAt: 0,
  });

  // Context management states
  const [useSystemPrompt, setUseSystemPrompt] = useState<boolean>(true);
  const [contextContent, setContextContent] = useState<string>("");
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string>("");
  const [activeFormat, setActiveFormat] = useState<ResponseFormat>("auto");
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState<boolean>(false);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const isMicMutedRef = useRef<boolean>(false);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  const toggleMicMute = useCallback(() => {
    setIsMicMuted((prev) => !prev);
  }, []);

  const {
    selectedSttProvider,
    allSttProviders,
    selectedAIProvider,
    allAiProviders,
    systemPrompt,
    selectedAudioDevices,
  } = useApp();

  // Session-specific system prompt management
  const { prompts, refreshPrompts } = useSystemPrompts();
  const [sessionPromptId, setSessionPromptId] = useState<number | null>(() => {
    const stored = safeLocalStorage.getItem("session_selected_prompt_id");
    return stored ? Number(stored) : null;
  });

  const handleSelectSessionPrompt = useCallback((promptId: number | null) => {
    setSessionPromptId(promptId);
    if (promptId === null) {
      safeLocalStorage.removeItem("session_selected_prompt_id");
    } else {
      safeLocalStorage.setItem("session_selected_prompt_id", promptId.toString());
    }
  }, []);

  const getSessionSystemPrompt = useCallback(() => {
    if (sessionPromptId !== null && prompts.length > 0) {
      const found = prompts.find((p) => p.id === sessionPromptId);
      if (found) {
        return found.prompt;
      }
    }
    return systemPrompt || DEFAULT_SYSTEM_PROMPT;
  }, [sessionPromptId, prompts, systemPrompt]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Load context settings and VAD config from localStorage on mount
  useEffect(() => {
    const savedContext = safeLocalStorage.getItem(
      STORAGE_KEYS.SYSTEM_AUDIO_CONTEXT
    );
    if (savedContext) {
      try {
        const parsed = JSON.parse(savedContext);
        setUseSystemPrompt(parsed.useSystemPrompt ?? true);
        setContextContent(parsed.contextContent ?? "");
        setCustomSystemPrompt(parsed.customSystemPrompt ?? "");
      } catch (error) {
        console.error("Failed to load system audio context:", error);
      }
    }

    // Load VAD config
    const savedVadConfig = safeLocalStorage.getItem("vad_config");
    if (savedVadConfig) {
      try {
        const parsed = JSON.parse(savedVadConfig);
        setVadConfig(parsed);
      } catch (error) {
        console.error("Failed to load VAD config:", error);
      }
    }
  }, []);

  // Load quick actions from localStorage on mount
  useEffect(() => {
    const savedActions = safeLocalStorage.getItem(
      STORAGE_KEYS.SYSTEM_AUDIO_QUICK_ACTIONS
    );
    if (savedActions) {
      try {
        const parsed = JSON.parse(savedActions);
        setQuickActions(parsed);
      } catch (error) {
        console.error("Failed to load quick actions:", error);
        setQuickActions(DEFAULT_QUICK_ACTIONS);
      }
    } else {
      setQuickActions(DEFAULT_QUICK_ACTIONS);
    }
  }, []);

  // Handle continuous recording progress events AND error events
  useEffect(() => {
    let progressUnlisten: (() => void) | undefined;
    let startUnlisten: (() => void) | undefined;
    let stopUnlisten: (() => void) | undefined;
    let errorUnlisten: (() => void) | undefined;
    let discardedUnlisten: (() => void) | undefined;

    const setupContinuousListeners = async () => {
      try {
        // Progress updates (every second)
        progressUnlisten = await listen("recording-progress", (event) => {
          const seconds = event.payload as number;
          setRecordingProgress(seconds);
        });

        // Recording started
        startUnlisten = await listen("continuous-recording-start", () => {
          setRecordingProgress(0);
          setIsRecordingInContinuousMode(true);
        });

        // Recording stopped
        stopUnlisten = await listen("continuous-recording-stopped", () => {
          setRecordingProgress(0);
          setIsRecordingInContinuousMode(false);
        });

        // Audio encoding errors
        errorUnlisten = await listen("audio-encoding-error", (event) => {
          const errorMsg = event.payload as string;
          console.error("Audio encoding error:", errorMsg);
          setError(`Failed to process audio: ${errorMsg}`);
          setIsProcessing(false);
          setIsAIProcessing(false);
          setIsRecordingInContinuousMode(false);
        });

        // Speech discarded (too short)
        discardedUnlisten = await listen("speech-discarded", (event) => {
          const reason = event.payload as string;
          console.log("Speech discarded:", reason);
          // Don't show error - this is expected behavior
        });
      } catch (err) {
        console.error("Failed to setup continuous recording listeners:", err);
      }
    };

    setupContinuousListeners();

    return () => {
      if (progressUnlisten) progressUnlisten();
      if (startUnlisten) startUnlisten();
      if (stopUnlisten) stopUnlisten();
      if (errorUnlisten) errorUnlisten();
      if (discardedUnlisten) discardedUnlisten();
    };
  }, []);

  // Handle single speech detection event (both VAD and continuous modes)
  useEffect(() => {
    let speechUnlisten: (() => void) | undefined;

    const setupEventListener = async () => {
      try {
        speechUnlisten = await listen("speech-detected", async (event) => {
          try {
            if (!capturing) return;

            const payload = event.payload;
            let base64Audio = "";
            let source: "mic" | "speaker" = "speaker";

            if (typeof payload === "string") {
              base64Audio = payload;
              source = "speaker";
            } else if (payload && typeof payload === "object") {
              base64Audio = (payload as any).audio || "";
              source =
                ((payload as any).source as "mic" | "speaker") || "speaker";
            }

            if (source === "mic" && isMicMutedRef.current) {
              return;
            }

            if (!base64Audio) return;

            // Convert to blob
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const audioBlob = new Blob([bytes], { type: "audio/wav" });

            const usePluelyAPI = await shouldUsePluelyAPI();
            if (!selectedSttProvider.provider && !usePluelyAPI) {
              setError("No speech provider selected.");
              return;
            }

            const providerConfig = allSttProviders.find(
              (p) => p.id === selectedSttProvider.provider
            );

            if (!providerConfig && !usePluelyAPI) {
              setError("Speech provider config not found.");
              return;
            }

            setIsProcessing(true);

            // Add timeout wrapper for STT request (30 seconds)
            const sttPromise = fetchSTT({
              provider: providerConfig,
              selectedProvider: selectedSttProvider,
              audio: audioBlob,
            });

            const timeoutPromise = new Promise<string>((_, reject) => {
              setTimeout(
                () => reject(new Error("Speech transcription timed out (30s)")),
                30000
              );
            });

            try {
              const transcription = await Promise.race([
                sttPromise,
                timeoutPromise,
              ]);

              if (transcription.trim()) {
                const speakerType: "you" | "meeting" =
                  source === "mic" ? "you" : "meeting";
                setLastTranscription(transcription);
                setLastSpeaker(speakerType);
                setError("");

                const timestamp = Date.now();
                const userMessage: ChatMessage = {
                  id: generateMessageId("user", timestamp),
                  role: "user",
                  speaker: speakerType,
                  content: transcription,
                  timestamp,
                };

                const effectiveSystemPrompt = buildEffectivePrompt(
                  getSessionSystemPrompt(),
                  contextContent,
                  undefined,
                  activeFormat
                );

                if (source === "mic") {
                  // User's voice into the microphone:
                  // Save to conversation history so AI knows candidate context,
                  // but DO NOT auto-respond to candidate's own words!
                  setConversation((prev) => ({
                    ...prev,
                    messages: [userMessage, ...prev.messages],
                    updatedAt: timestamp,
                    title:
                      prev.title || generateConversationTitle(transcription),
                  }));
                } else {
                  // Meeting/interviewer's voice:
                  // Determine whether to trigger AI based on responseTrigger setting
                  const responseSettings = getResponseSettings();
                  const responseTrigger = responseSettings.responseTrigger;

                  const shouldRespond =
                    responseTrigger === "auto_all" ||
                    (responseTrigger === "auto_question" &&
                      isLikelyQuestion(transcription));

                  if (shouldRespond) {
                    // Assemble chronological history with speaker identifiers
                    const historyMessages = [
                      ...conversation.messages,
                      userMessage,
                    ]
                      .sort((a, b) => a.timestamp - b.timestamp)
                      .map((msg) => ({
                        role: msg.role,
                        content:
                          msg.speaker === "you"
                            ? `[You]: ${msg.content}`
                            : msg.speaker === "meeting"
                            ? `[Interviewer/Meeting]: ${msg.content}`
                            : msg.content,
                      }));

                    await processWithAI(
                      transcription,
                      effectiveSystemPrompt,
                      historyMessages,
                      "meeting"
                    );
                  } else {
                    // Record message in history without auto-responding
                    setConversation((prev) => ({
                      ...prev,
                      messages: [userMessage, ...prev.messages],
                      updatedAt: timestamp,
                      title:
                        prev.title || generateConversationTitle(transcription),
                    }));
                  }
                }
              } else {
                setError("Received empty transcription");
              }
            } catch (sttError: any) {
              console.error("STT Error:", sttError);
              setError(sttError.message || "Failed to transcribe audio");
              setIsPopoverOpen(true);
            }
          } catch (err) {
            setError("Failed to process speech");
          } finally {
            setIsProcessing(false);
          }
        });
      } catch (err) {
        setError("Failed to setup speech listener");
      }
    };

    setupEventListener();

    return () => {
      if (speechUnlisten) speechUnlisten();
    };
  }, [
    capturing,
    selectedSttProvider,
    allSttProviders,
    conversation.messages.length,
  ]);

  // Context management functions
  const saveContextSettings = useCallback(
    (usePrompt: boolean, content: string, customPrompt?: string) => {
      try {
        const contextSettings = {
          useSystemPrompt: usePrompt,
          contextContent: content,
          customSystemPrompt: customPrompt ?? "",
        };
        safeLocalStorage.setItem(
          STORAGE_KEYS.SYSTEM_AUDIO_CONTEXT,
          JSON.stringify(contextSettings)
        );
      } catch (error) {
        console.error("Failed to save context settings:", error);
      }
    },
    []
  );

  const updateUseSystemPrompt = useCallback(
    (value: boolean) => {
      setUseSystemPrompt(value);
      saveContextSettings(value, contextContent, customSystemPrompt);
    },
    [contextContent, customSystemPrompt, saveContextSettings]
  );

  const updateContextContent = useCallback(
    (content: string) => {
      setContextContent(content);
      saveContextSettings(useSystemPrompt, content, customSystemPrompt);
    },
    [useSystemPrompt, customSystemPrompt, saveContextSettings]
  );

  const updateCustomSystemPrompt = useCallback(
    (prompt: string) => {
      setCustomSystemPrompt(prompt);
      saveContextSettings(useSystemPrompt, contextContent, prompt);
    },
    [useSystemPrompt, contextContent, saveContextSettings]
  );

  // Quick actions management
  const saveQuickActions = useCallback((actions: string[]) => {
    try {
      safeLocalStorage.setItem(
        STORAGE_KEYS.SYSTEM_AUDIO_QUICK_ACTIONS,
        JSON.stringify(actions)
      );
    } catch (error) {
      console.error("Failed to save quick actions:", error);
    }
  }, []);

  const addQuickAction = useCallback(
    (action: string) => {
      if (action && !quickActions.includes(action)) {
        const newActions = [...quickActions, action];
        setQuickActions(newActions);
        saveQuickActions(newActions);
      }
    },
    [quickActions, saveQuickActions]
  );

  const removeQuickAction = useCallback(
    (action: string) => {
      const newActions = quickActions.filter((a) => a !== action);
      setQuickActions(newActions);
      saveQuickActions(newActions);
    },
    [quickActions, saveQuickActions]
  );

  const handleQuickActionClick = async (action: string) => {
    setError("");

    let chosenFormat: ResponseFormat = "auto";
    let promptToAction = action;
    if (action.includes("Code") || action.includes("Brute")) {
      chosenFormat = "code_3tier";
      promptToAction = "Please solve this coding problem with brute force, better, and optimal approaches.";
    } else if (action.includes("STAR")) {
      chosenFormat = "star";
      promptToAction = "Answer this question using the STAR method.";
    } else if (action.includes("Bullets") || action.includes("Speaking")) {
      chosenFormat = "bullets";
      promptToAction = "Give me 3-4 speaking bullet points to answer this.";
    } else if (action.includes("Deep Dive") || action.includes("Architecture")) {
      chosenFormat = "deep_dive";
      promptToAction = "Provide a deep dive architectural breakdown for this.";
    }
    setActiveFormat(chosenFormat);

    const effectiveSystemPrompt = buildEffectivePrompt(
      getSessionSystemPrompt(),
      contextContent,
      undefined,
      chosenFormat
    );

    // Include the most recent transcription in conversation history if it exists
    let updatedMessages = [...conversation.messages];

    if (lastTranscription && lastTranscription.trim()) {
      const lastMessage = updatedMessages[updatedMessages.length - 1];
      // Only add if it's not already the last message
      if (!lastMessage || lastMessage.content !== lastTranscription) {
        const timestamp = Date.now();
        const userMessage = {
          id: generateMessageId("user", timestamp),
          role: "user" as const,
          content: lastTranscription,
          timestamp,
        };
        updatedMessages.push(userMessage);

        // Update conversation state with the latest transcription
        setConversation((prev) => ({
          ...prev,
          messages: [userMessage, ...prev.messages],
          updatedAt: timestamp,
          title: prev.title || generateConversationTitle(lastTranscription),
        }));
      }
    }

    const previousMessages = updatedMessages.map((msg) => {
      return { role: msg.role, content: msg.content };
    });

    await processWithAI(promptToAction, effectiveSystemPrompt, previousMessages);
  };

  // Start continuous recording manually
  const startContinuousRecording = useCallback(async () => {
    try {
      setRecordingProgress(0);
      setError("");

      const inputDeviceId =
        selectedAudioDevices.input.id !== "default"
          ? selectedAudioDevices.input.id
          : null;
      const outputDeviceId =
        selectedAudioDevices.output.id !== "default"
          ? selectedAudioDevices.output.id
          : null;

      // Start a new continuous recording session
      await invoke<string>("start_system_audio_capture", {
        vadConfig: vadConfig,
        inputDeviceId: inputDeviceId,
        outputDeviceId: outputDeviceId,
      });
    } catch (err) {
      console.error("Failed to start continuous recording:", err);
      setError(`Failed to start recording: ${err}`);
    }
  }, [
    vadConfig,
    selectedAudioDevices.input.id,
    selectedAudioDevices.output.id,
  ]);

  // Ignore current recording (stop without transcription)
  const ignoreContinuousRecording = useCallback(async () => {
    try {
      if (!isContinuousMode || !isRecordingInContinuousMode) return;

      // Stop the capture without processing
      await invoke<string>("stop_system_audio_capture");

      // Reset states
      setRecordingProgress(0);
      setIsProcessing(false);
      setIsRecordingInContinuousMode(false);
    } catch (err) {
      console.error("Failed to ignore recording:", err);
      setError(`Failed to ignore recording: ${err}`);
    }
  }, [isContinuousMode, isRecordingInContinuousMode]);

  // AI Processing function
  const processWithAI = useCallback(
    async (
      transcription: string,
      prompt: string,
      previousMessages: Message[],
      speaker: "you" | "meeting" | "system" = "meeting",
      imagesBase64: string[] = []
    ) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      try {
        setIsAIProcessing(true);
        setLastAIResponse("");
        setError("");

        let fullResponse = "";

        const usePluelyAPI = await shouldUsePluelyAPI();
        if (!selectedAIProvider.provider && !usePluelyAPI) {
          setError("No AI provider selected.");
          return;
        }

        const provider = allAiProviders.find(
          (p) => p.id === selectedAIProvider.provider
        );
        if (!provider && !usePluelyAPI) {
          setError("AI provider config not found.");
          return;
        }

        try {
          for await (const chunk of fetchAIResponse({
            provider: usePluelyAPI ? undefined : provider,
            selectedProvider: selectedAIProvider,
            systemPrompt: prompt,
            history: previousMessages,
            userMessage: transcription,
            imagesBase64: imagesBase64,
          })) {
            fullResponse += chunk;
            setLastAIResponse((prev) => prev + chunk);
          }
        } catch (aiError: any) {
          setError(aiError.message || "Failed to get AI response");
        }

        if (fullResponse) {
          const timestamp = Date.now();
          setConversation((prev) => {
            const existingIndex = prev.messages.findIndex(
              (m) =>
                m.role === "user" &&
                (m.content === transcription ||
                  m.content.includes(transcription))
            );
            const assistantMsg: ChatMessage = {
              id: generateMessageId("assistant", timestamp),
              role: "assistant" as const,
              content: fullResponse,
              timestamp,
            };

            if (existingIndex >= 0) {
              const updatedMessages = [...prev.messages];
              updatedMessages.splice(existingIndex, 0, assistantMsg);
              return {
                ...prev,
                messages: updatedMessages,
                updatedAt: timestamp,
              };
            } else {
              const userMsg: ChatMessage = {
                id: generateMessageId("user", timestamp - 1),
                role: "user" as const,
                speaker,
                content: transcription,
                image: imagesBase64[0],
                timestamp: timestamp - 1,
              };
              return {
                ...prev,
                messages: [assistantMsg, userMsg, ...prev.messages],
                updatedAt: timestamp,
                title: prev.title || generateConversationTitle(transcription),
              };
            }
          });
        }
      } catch (err) {
        setError("Failed to get AI response");
      } finally {
        setIsAIProcessing(false);
        // No auto-restart - user manually controls when to start next recording
      }
    },
    [selectedAIProvider, allAiProviders]
  );

  // Manual trigger for suggesting AI response based on current speech/history
  const triggerSuggestion = useCallback(async () => {
    if (isAIProcessing) return;

    let targetText = lastTranscription;
    if (!targetText && conversation.messages.length > 0) {
      const latestUserMsg = conversation.messages.find(
        (m) => m.role === "user"
      );
      if (latestUserMsg) {
        targetText = latestUserMsg.content;
      }
    }

    if (!targetText || !targetText.trim()) {
      return;
    }

    const effectiveSystemPrompt = buildEffectivePrompt(
      getSessionSystemPrompt(),
      contextContent,
      undefined,
      activeFormat
    );

    const historyMessages = [...conversation.messages]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((msg) => ({
        role: msg.role,
        content:
          msg.speaker === "you"
            ? `[You]: ${msg.content}`
            : msg.speaker === "meeting"
            ? `[Interviewer/Meeting]: ${msg.content}`
            : msg.content,
      }));

    await processWithAI(
      targetText,
      effectiveSystemPrompt,
      historyMessages,
      "meeting"
    );
  }, [
    isAIProcessing,
    lastTranscription,
    conversation.messages,
    useSystemPrompt,
    systemPrompt,
    customSystemPrompt,
    contextContent,
    processWithAI,
  ]);

  // Capture screen and analyze with AI
  const captureAndAnalyzeScreen = useCallback(
    async (customQuestion?: string) => {
      if (isAIProcessing || isCapturingScreenshot) return;

      setIsCapturingScreenshot(true);
      setError("");

      try {
        // Check screen recording permission on macOS
        const platform = navigator.platform.toLowerCase();
        if (platform.includes("mac")) {
          const {
            checkScreenRecordingPermission,
            requestScreenRecordingPermission,
          } = await import("tauri-plugin-macos-permissions-api");

          const hasPermission = await checkScreenRecordingPermission();
          if (!hasPermission) {
            await requestScreenRecordingPermission();
            setIsCapturingScreenshot(false);
            return;
          }
        }

        const base64: string = await invoke("capture_to_base64");
        if (!base64) {
          setError("Failed to capture screen: empty image");
          setIsCapturingScreenshot(false);
          return;
        }

        const promptText =
          customQuestion ||
          (lastTranscription
            ? `Please refer to what is visible in the attached screen capture to answer: "${lastTranscription}"`
            : "Analyze what is shown on this screen. Provide the key answers, explanations, or code solution.");

        const timestamp = Date.now();
        const screenUserMsg: ChatMessage = {
          id: generateMessageId("user", timestamp),
          role: "user",
          speaker: "you",
          content: `📸 [Screen Capture]: ${promptText}`,
          image: base64,
          timestamp,
        };

        setLastTranscription(screenUserMsg.content);
        setLastSpeaker("you");

        const effectiveSystemPrompt = buildEffectivePrompt(
          getSessionSystemPrompt(),
          contextContent,
          undefined,
          activeFormat
        );

        const historyMessages = [...conversation.messages]
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((msg) => ({
            role: msg.role,
            content:
              msg.speaker === "you"
                ? `[You]: ${msg.content}`
                : msg.speaker === "meeting"
                ? `[Interviewer/Meeting]: ${msg.content}`
                : msg.content,
          }));

        setConversation((prev) => ({
          ...prev,
          messages: [screenUserMsg, ...prev.messages],
          updatedAt: timestamp,
          title: prev.title || "Screen Capture Analysis",
        }));

        await processWithAI(
          promptText,
          effectiveSystemPrompt,
          historyMessages,
          "you",
          [base64]
        );
      } catch (err: any) {
        console.error("Failed to capture screen:", err);
        setError(err?.message || "Failed to capture screen");
      } finally {
        setIsCapturingScreenshot(false);
      }
    },
    [
      isAIProcessing,
      isCapturingScreenshot,
      lastTranscription,
      useSystemPrompt,
      systemPrompt,
      customSystemPrompt,
      contextContent,
      conversation.messages,
      processWithAI,
    ]
  );

  // Regenerate with specific format (3-Tier Code, STAR, Bullets, Deep Dive)
  const regenerateWithFormat = useCallback(
    async (format: ResponseFormat) => {
      setActiveFormat(format);
      if (isAIProcessing) return;

      let targetText = lastTranscription;
      if (!targetText && conversation.messages.length > 0) {
        const latestUserMsg = conversation.messages.find(
          (m) => m.role === "user"
        );
        if (latestUserMsg) {
          targetText = latestUserMsg.content;
        }
      }

      if (!targetText || !targetText.trim()) {
        return;
      }

      const effectiveSystemPrompt = buildEffectivePrompt(
        getSessionSystemPrompt(),
        contextContent,
        undefined,
        format
      );

      const historyMessages = [...conversation.messages]
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((msg) => ({
          role: msg.role,
          content:
            msg.speaker === "you"
              ? `[You]: ${msg.content}`
              : msg.speaker === "meeting"
              ? `[Interviewer/Meeting]: ${msg.content}`
              : msg.content,
        }));

      await processWithAI(
        targetText,
        effectiveSystemPrompt,
        historyMessages,
        "meeting"
      );
    },
    [
      isAIProcessing,
      lastTranscription,
      conversation.messages,
      useSystemPrompt,
      systemPrompt,
      customSystemPrompt,
      contextContent,
      processWithAI,
    ]
  );

  // Export full diarized meeting transcript & notes as Markdown
  const exportMeetingNotes = useCallback(() => {
    if (conversation.messages.length === 0) return "";

    const dateStr = new Date(
      conversation.createdAt || Date.now()
    ).toLocaleString();
    let markdown = `# Meeting / Interview Session - ${dateStr}\n\n`;

    if (contextContent?.trim()) {
      markdown += `## Candidate Resume & Background Context\n${contextContent.trim()}\n\n---\n\n`;
    }

    markdown += `## Transcript & AI Q&A History\n\n`;

    const chronological = [...conversation.messages].sort(
      (a, b) => a.timestamp - b.timestamp
    );
    for (const msg of chronological) {
      const speaker =
        msg.role === "user"
          ? msg.speaker === "you"
            ? "Candidate (You)"
            : "Meeting / Interviewer"
          : "AI Assistant";
      const time = new Date(msg.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      markdown += `### **${speaker}** (${time})\n\n${msg.content}\n\n`;
    }

    return markdown;
  }, [conversation, contextContent]);

  // Register global shortcut for suggest response
  useEffect(() => {
    globalShortcuts.registerSuggestCallback(() => {
      triggerSuggestion();
    });
  }, [globalShortcuts, triggerSuggestion]);

  // Also listen for suggest-triggered event directly
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      unlisten = await listen("suggest-triggered", () => {
        triggerSuggestion();
      });
    };
    setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, [triggerSuggestion]);

  const startCapture = useCallback(async () => {
    try {
      setError("");

      const hasAccess = await invoke<boolean>("check_system_audio_access");
      if (!hasAccess) {
        setSetupRequired(true);
        setIsPopoverOpen(true);
        return;
      }

      const isContinuous = !vadConfig.enabled;

      // Set up conversation
      const conversationId = generateConversationId("sysaudio");
      setConversation({
        id: conversationId,
        title: "",
        messages: [],
        createdAt: 0,
        updatedAt: 0,
      });

      setCapturing(true);
      setIsPopoverOpen(true);
      setIsContinuousMode(isContinuous);
      setRecordingProgress(0);

      // If continuous mode
      if (isContinuous) {
        setIsRecordingInContinuousMode(false);
        return;
      }

      // VAD mode: Start recording immediately
      // Stop any existing capture
      await invoke<string>("stop_system_audio_capture");

      const inputDeviceId =
        selectedAudioDevices.input.id !== "default"
          ? selectedAudioDevices.input.id
          : null;
      const outputDeviceId =
        selectedAudioDevices.output.id !== "default"
          ? selectedAudioDevices.output.id
          : null;

      // Start capture with VAD config
      await invoke<string>("start_system_audio_capture", {
        vadConfig: vadConfig,
        inputDeviceId: inputDeviceId,
        outputDeviceId: outputDeviceId,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setIsPopoverOpen(true);
    }
  }, [
    vadConfig,
    selectedAudioDevices.input.id,
    selectedAudioDevices.output.id,
  ]);

  const stopCapture = useCallback(async () => {
    try {
      // Abort any ongoing AI requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Stop the audio capture
      await invoke<string>("stop_system_audio_capture");

      // Reset ALL states
      setCapturing(false);
      setIsProcessing(false);
      setIsAIProcessing(false);
      setIsContinuousMode(false);
      setIsRecordingInContinuousMode(false);
      setRecordingProgress(0);
      setLastTranscription("");
      setLastAIResponse("");
      setError("");
      setIsPopoverOpen(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to stop capture: ${errorMessage}`);
      console.error("Stop capture error:", err);
    }
  }, []);

  // Manual stop for continuous recording
  const manualStopAndSend = useCallback(async () => {
    try {
      if (!isContinuousMode) {
        console.warn("Not in continuous mode");
        return;
      }

      // Show processing state immediately
      setIsProcessing(true);

      // Trigger manual stop event
      await invoke("manual_stop_continuous");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to manually stop: ${errorMessage}`);
      setIsProcessing(false); // Clear processing state on error
      console.error("Manual stop error:", err);
    }
  }, [isContinuousMode]);

  const handleSetup = useCallback(async () => {
    try {
      const platform = navigator.platform.toLowerCase();

      if (platform.includes("mac") || platform.includes("win")) {
        await invoke("request_system_audio_access");
      }

      // Delay to give the user time to grant permissions in the system dialog.
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const hasAccess = await invoke<boolean>("check_system_audio_access");
      if (hasAccess) {
        setSetupRequired(false);
        await startCapture();
      } else {
        setSetupRequired(true);
        setError("Permission not granted. Please try the manual steps.");
      }
    } catch (err) {
      setError("Failed to request access. Please try the manual steps below.");
      setSetupRequired(true);
    }
  }, [startCapture]);

  useEffect(() => {
    const shouldOpenPopover =
      capturing ||
      setupRequired ||
      isAIProcessing ||
      !!lastAIResponse ||
      !!error;
    setIsPopoverOpen(shouldOpenPopover);
    resizeWindow(shouldOpenPopover);
  }, [
    capturing,
    setupRequired,
    isAIProcessing,
    lastAIResponse,
    error,
    resizeWindow,
  ]);

  useEffect(() => {
    globalShortcuts.registerSystemAudioCallback(async () => {
      if (capturing) {
        await stopCapture();
      } else {
        await startCapture();
      }
    });
  }, [startCapture, stopCapture]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      invoke("stop_system_audio_capture").catch(() => {});
    };
  }, []);

  // Debounced save to prevent race conditions and improve performance
  useEffect(() => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Only debounce if there are messages to save
    if (
      !conversation.id ||
      conversation.updatedAt === 0 ||
      conversation.messages.length === 0
    ) {
      return;
    }

    // Debounce saves (only save 500ms after last change)
    saveTimeoutRef.current = setTimeout(async () => {
      // Don't save if already saving (prevent concurrent saves)
      if (isSavingRef.current) {
        return;
      }

      try {
        isSavingRef.current = true;
        await saveConversation(conversation);
      } catch (error) {
        console.error("Failed to save system audio conversation:", error);
      } finally {
        isSavingRef.current = false;
      }
    }, CONVERSATION_SAVE_DEBOUNCE_MS);

    // Cleanup on unmount or dependency change
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    conversation.messages.length,
    conversation.title,
    conversation.id,
    conversation.updatedAt,
  ]);

  const startNewConversation = useCallback(() => {
    setConversation({
      id: generateConversationId("sysaudio"),
      title: "",
      messages: [],
      createdAt: 0,
      updatedAt: 0,
    });
    setLastTranscription("");
    setLastSpeaker("meeting");
    setLastAIResponse("");
    setError("");
    setSetupRequired(false);
    setIsProcessing(false);
    setIsAIProcessing(false);
    setIsPopoverOpen(false);
    setUseSystemPrompt(true);
  }, []);

  // Update VAD configuration
  const updateVadConfiguration = useCallback(async (config: VadConfig) => {
    try {
      setVadConfig(config);
      safeLocalStorage.setItem("vad_config", JSON.stringify(config));
      await invoke("update_vad_config", { config });
    } catch (error) {
      console.error("Failed to update VAD config:", error);
    }
  }, []);

  useEffect(() => {
    if (capturing) {
      setIsContinuousMode(!vadConfig.enabled);

      if (!vadConfig.enabled) {
        setIsRecordingInContinuousMode(false);
      }
    }
  }, [vadConfig.enabled, capturing]);

  // Keyboard arrow key support for scrolling (local shortcut)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPopoverOpen) return;

      const scrollElement = scrollAreaRef.current?.querySelector(
        "[data-radix-scroll-area-viewport]"
      ) as HTMLElement;

      if (!scrollElement) return;

      const scrollAmount = 100; // pixels to scroll

      if (e.key === "ArrowDown") {
        e.preventDefault();
        scrollElement.scrollBy({ top: scrollAmount, behavior: "smooth" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        scrollElement.scrollBy({ top: -scrollAmount, behavior: "smooth" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPopoverOpen]);

  // Keyboard shortcuts for continuous mode recording (local shortcuts)
  useEffect(() => {
    const handleRecordingShortcuts = (e: KeyboardEvent) => {
      if (!isPopoverOpen || !isContinuousMode) return;
      if (isProcessing || isAIProcessing) return;

      // Enter: Start recording (when not recording) or Stop & Send (when recording)
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (!isRecordingInContinuousMode) {
          startContinuousRecording();
        } else {
          manualStopAndSend();
        }
      }

      // Escape: Ignore recording (when recording)
      if (e.key === "Escape" && isRecordingInContinuousMode) {
        e.preventDefault();
        ignoreContinuousRecording();
      }

      // Space: Start recording (when not recording) - only if not typing in input
      if (
        e.key === " " &&
        !isRecordingInContinuousMode &&
        !e.metaKey &&
        !e.ctrlKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        startContinuousRecording();
      }
    };

    window.addEventListener("keydown", handleRecordingShortcuts);
    return () =>
      window.removeEventListener("keydown", handleRecordingShortcuts);
  }, [
    isPopoverOpen,
    isContinuousMode,
    isRecordingInContinuousMode,
    isProcessing,
    isAIProcessing,
    startContinuousRecording,
    manualStopAndSend,
    ignoreContinuousRecording,
  ]);

  return {
    capturing,
    isProcessing,
    isAIProcessing,
    lastTranscription,
    lastSpeaker,
    lastAIResponse,
    error,
    setupRequired,
    startCapture,
    stopCapture,
    handleSetup,
    isPopoverOpen,
    setIsPopoverOpen,
    triggerSuggestion,
    // Conversation management
    conversation,
    setConversation,
    // AI processing
    processWithAI,
    // Context management
    useSystemPrompt,
    setUseSystemPrompt: updateUseSystemPrompt,
    contextContent,
    setContextContent: updateContextContent,
    customSystemPrompt,
    setCustomSystemPrompt: updateCustomSystemPrompt,
    // Screenshot capture & vision analysis
    captureAndAnalyzeScreen,
    isCapturingScreenshot,
    // Mic Mute toggle
    isMicMuted,
    toggleMicMute,
    // System Prompts & Session Prompt Selection
    prompts,
    refreshPrompts,
    sessionPromptId,
    setSessionPromptId: handleSelectSessionPrompt,
    // Format regeneration & notes export
    activeFormat,
    setActiveFormat,
    regenerateWithFormat,
    exportMeetingNotes,
    startNewConversation,
    // Window resize
    resizeWindow,
    quickActions,
    addQuickAction,
    removeQuickAction,
    isManagingQuickActions,
    setIsManagingQuickActions,
    showQuickActions,
    setShowQuickActions,
    handleQuickActionClick,
    // VAD configuration
    vadConfig,
    updateVadConfiguration,
    // Continuous recording
    isContinuousMode,
    isRecordingInContinuousMode,
    recordingProgress,
    manualStopAndSend,
    startContinuousRecording,
    ignoreContinuousRecording,
    // Scroll area ref for keyboard navigation
    scrollAreaRef,
  };
}
