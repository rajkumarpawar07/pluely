import { ChatConversation } from "@/types";
import { Markdown, Switch, CopyButton, Button } from "@/components";
import {
  BotIcon,
  HeadphonesIcon,
  MicIcon,
  Loader2,
  SparklesIcon,
  Code2Icon,
  StarIcon,
  ListIcon,
  LayersIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ResponseFormat } from "@/hooks/useSystemAudio";

type Props = {
  lastTranscription: string;
  lastSpeaker?: "you" | "meeting" | "system";
  lastAIResponse: string;
  isAIProcessing: boolean;
  conversation: ChatConversation;
  conversationMode: boolean;
  setConversationMode: (mode: boolean) => void;
  onSuggest?: () => void;
  onRegenerateFormat?: (format: ResponseFormat) => void;
  activeFormat?: ResponseFormat;
};

export const ResultsSection = ({
  lastTranscription,
  lastSpeaker = "meeting",
  lastAIResponse,
  isAIProcessing,
  conversation,
  conversationMode,
  setConversationMode,
  onSuggest,
  onRegenerateFormat,
  activeFormat = "auto",
}: Props) => {
  const hasResponse = lastAIResponse || isAIProcessing;
  const hasHistory = conversation.messages.length > 2;

  if (!hasResponse && !lastTranscription) {
    return null;
  }

  const isMac = navigator.platform.toLowerCase().includes("mac");
  const modKey = isMac ? "⌘" : "Ctrl";

  const getSpeakerLabel = (speaker?: "you" | "meeting" | "system") => {
    switch (speaker) {
      case "you":
        return "You";
      case "meeting":
        return "Meeting";
      case "system":
      default:
        return "System";
    }
  };

  const getSpeakerIcon = (speaker?: "you" | "meeting" | "system") => {
    switch (speaker) {
      case "you":
        return <MicIcon className="w-3 h-3 text-sky-500" />;
      case "meeting":
        return <HeadphonesIcon className="w-3 h-3 text-indigo-500" />;
      case "system":
      default:
        return <HeadphonesIcon className="w-3 h-3 text-primary" />;
    }
  };

  const latestScreenMsg = conversation.messages.find(
    (m) => m.role === "user" && m.image
  );
  const showLatestImage =
    lastTranscription?.includes("[Screen Capture]") && latestScreenMsg?.image;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
      {/* Header with toggle & actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <SparklesIcon className="w-3.5 h-3.5 text-primary" />
          <h4 className="text-xs font-medium">
            {conversationMode ? "Conversation" : "AI Response"}
          </h4>
        </div>
        <div className="flex items-center gap-2 select-none">
          {onSuggest && lastTranscription && (
            <Button
              size="sm"
              variant="outline"
              onClick={onSuggest}
              disabled={isAIProcessing}
              className="h-5 px-2 text-[10px] gap-1 font-medium bg-background/80 hover:bg-primary/10 border-primary/30 text-primary"
              title={`Generate AI suggestion (${modKey}+Enter)`}
            >
              <SparklesIcon className="w-2.5 h-2.5" />
              Suggest
              <span className="text-[8px] opacity-60 ml-0.5">{modKey}↵</span>
            </Button>
          )}
          <span className="text-[9px] text-muted-foreground/50 bg-muted/50 px-1 rounded">
            {modKey}+K
          </span>
          <Switch
            checked={conversationMode}
            onCheckedChange={setConversationMode}
            className="scale-75"
          />
          {lastAIResponse && <CopyButton content={lastAIResponse} />}
        </div>
      </div>

      {/* Response Format Chips: Auto, 3-Tier Code, STAR, Bullets, Deep Dive */}
      {onRegenerateFormat && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-border/40">
          <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mr-0.5">
            Format:
          </span>
          <button
            type="button"
            onClick={() => onRegenerateFormat("auto")}
            disabled={isAIProcessing}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer disabled:opacity-50",
              activeFormat === "auto" || !activeFormat
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            )}
            title="Intelligent Auto-Detection: The AI dynamically selects 3-Tier Code, STAR, Deep Dive, or Bullets based on what the interviewer asks"
          >
            <SparklesIcon className="w-2.5 h-2.5" />
            Auto (AI Picks)
          </button>
          <button
            type="button"
            onClick={() => onRegenerateFormat("code_3tier")}
            disabled={isAIProcessing}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-all cursor-pointer disabled:opacity-50",
              activeFormat === "code_3tier"
                ? "bg-emerald-500 text-white font-semibold border-emerald-600 shadow-xs"
                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
            )}
            title="3-Tier Solution: Brute Force -> Better -> Optimal"
          >
            <Code2Icon className="w-2.5 h-2.5" />
            Code (Brute ➔ Optimal)
          </button>
          <button
            type="button"
            onClick={() => onRegenerateFormat("star")}
            disabled={isAIProcessing}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-all cursor-pointer disabled:opacity-50",
              activeFormat === "star"
                ? "bg-amber-500 text-white font-semibold border-amber-600 shadow-xs"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
            )}
            title="STAR Method: Situation, Task, Action, Result"
          >
            <StarIcon className="w-2.5 h-2.5" />
            STAR
          </button>
          <button
            type="button"
            onClick={() => onRegenerateFormat("bullets")}
            disabled={isAIProcessing}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-all cursor-pointer disabled:opacity-50",
              activeFormat === "bullets"
                ? "bg-sky-500 text-white font-semibold border-sky-600 shadow-xs"
                : "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20 hover:bg-sky-500/20"
            )}
            title="3-4 high-impact speaking points"
          >
            <ListIcon className="w-2.5 h-2.5" />
            Bullets
          </button>
          <button
            type="button"
            onClick={() => onRegenerateFormat("deep_dive")}
            disabled={isAIProcessing}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-all cursor-pointer disabled:opacity-50",
              activeFormat === "deep_dive"
                ? "bg-purple-500 text-white font-semibold border-purple-600 shadow-xs"
                : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 hover:bg-purple-500/20"
            )}
            title="Comprehensive architecture & system design deep dive"
          >
            <LayersIcon className="w-2.5 h-2.5" />
            Deep Dive
          </button>
        </div>
      )}

      {/* RESPONSE MODE: Speaker transcript, then AI response */}
      {!conversationMode && (
        <div className="space-y-2">
          {/* Speaker Input */}
          {lastTranscription && (
            <div className="text-[11px] text-muted-foreground bg-background/40 p-2 rounded border border-border/30 space-y-1.5">
              <div className="flex items-start gap-1.5">
                <span className="flex items-center gap-1 font-semibold flex-shrink-0">
                  {getSpeakerIcon(lastSpeaker)}
                  <span
                    className={cn(
                      lastSpeaker === "you"
                        ? "text-sky-500 font-semibold"
                        : "text-indigo-500 font-semibold"
                    )}
                  >
                    {getSpeakerLabel(lastSpeaker)}:
                  </span>
                </span>
                <p className="flex-1 leading-snug">{lastTranscription}</p>
              </div>
              {showLatestImage && (
                <div className="mt-1 overflow-hidden rounded border border-border/40 bg-black/20 max-w-xs">
                  <img
                    src={`data:image/png;base64,${latestScreenMsg.image}`}
                    alt="Screen capture"
                    className="max-h-36 w-auto object-contain rounded"
                  />
                </div>
              )}
            </div>
          )}

          {/* AI Response */}
          {hasResponse && (
            <div>
              {isAIProcessing && !lastAIResponse ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">
                    Generating response...
                  </span>
                </div>
              ) : (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <Markdown>{lastAIResponse}</Markdown>
                  {isAIProcessing && (
                    <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1 align-middle" />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CONVERSATION MODE: Speaker Input first, then AI Response, then history */}
      {conversationMode && (
        <div className="space-y-2">
          {/* Speaker Input - First */}
          {lastTranscription && (
            <div
              className={cn(
                "rounded-md border-l-2 p-2.5",
                lastSpeaker === "you"
                  ? "border-sky-500 bg-sky-500/5"
                  : "border-indigo-500 bg-indigo-500/5"
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                {getSpeakerIcon(lastSpeaker)}
                <span
                  className={cn(
                    "text-[9px] font-medium uppercase tracking-wide",
                    lastSpeaker === "you" ? "text-sky-500" : "text-indigo-500"
                  )}
                >
                  {getSpeakerLabel(lastSpeaker)}
                </span>
              </div>
              <p className="text-sm">{lastTranscription}</p>
              {showLatestImage && (
                <div className="mt-1.5 overflow-hidden rounded border border-border/40 bg-black/20 max-w-xs">
                  <img
                    src={`data:image/png;base64,${latestScreenMsg.image}`}
                    alt="Screen capture"
                    className="max-h-36 w-auto object-contain rounded"
                  />
                </div>
              )}
            </div>
          )}

          {/* AI Response - Second */}
          {hasResponse && (
            <div className="rounded-md bg-background/50 p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <BotIcon className="h-3 w-3 text-muted-foreground" />
                <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">
                  AI
                </span>
              </div>
              {isAIProcessing && !lastAIResponse ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    Generating...
                  </span>
                </div>
              ) : (
                <div className="prose prose-sm max-w-none dark:prose-invert text-sm">
                  <Markdown>{lastAIResponse}</Markdown>
                  {isAIProcessing && (
                    <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1 align-middle" />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Previous Messages */}
          {hasHistory && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">
                Previous Turns
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {conversation.messages
                  .slice(2)
                  .sort((a, b) => a.timestamp - b.timestamp)
                  .map((message, index) => {
                    const speakerLabel =
                      message.role === "user"
                        ? getSpeakerLabel(message.speaker)
                        : "AI";
                    const isUser = message.role === "user";
                    const isYou = message.speaker === "you";

                    return (
                      <div
                        key={message.id || index}
                        className={cn(
                          "p-2 rounded-md text-[11px]",
                          isUser
                            ? isYou
                              ? "bg-sky-500/5 border-l-2 border-sky-400/40"
                              : "bg-indigo-500/5 border-l-2 border-indigo-400/40"
                            : "bg-background/50"
                        )}
                      >
                        <div className="flex items-center gap-1 text-[8px] font-medium text-muted-foreground uppercase">
                          {isUser ? (
                            getSpeakerIcon(message.speaker)
                          ) : (
                            <BotIcon className="w-2.5 h-2.5 text-muted-foreground" />
                          )}
                          <span>{speakerLabel}</span>
                        </div>
                        <div className="text-muted-foreground leading-relaxed mt-0.5">
                          <Markdown>{message.content}</Markdown>
                        </div>
                        {message.image && (
                          <div className="mt-1.5 overflow-hidden rounded border border-border/40 bg-black/20 max-w-xs">
                            <img
                              src={`data:image/png;base64,${message.image}`}
                              alt="Screen capture"
                              className="max-h-28 w-auto object-contain rounded"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
