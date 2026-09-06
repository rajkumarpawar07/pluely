import { useEffect } from "react";
import { Loader2, XIcon, SparklesIcon, UserIcon, PlusIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  ScrollArea,
  Input as InputComponent,
  Markdown,
  CopyButton,
} from "@/components";
import { UseCompletionReturn } from "@/types";
import { cn } from "@/lib/utils";

export const Input = ({
  isPopoverOpen,
  isLoading,
  reset,
  input,
  setInput,
  handleKeyPress,
  handlePaste,
  currentConversationId,
  conversationHistory,
  startNewConversation,
  error,
  response,
  cancel,
  scrollAreaRef,
  inputRef,
  isHidden,
  keepEngaged,
}: UseCompletionReturn & { isHidden: boolean }) => {
  // Auto-scroll to bottom of conversation whenever content updates
  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [response, conversationHistory.length, isLoading, scrollAreaRef]);

  // Sort history chronologically (oldest at top, newest at bottom)
  const sortedHistory = [...conversationHistory].sort(
    (a, b) => a.timestamp - b.timestamp
  );

  const turnsCount = Math.ceil(sortedHistory.length / 2);

  return (
    <div className="relative flex-1">
      <Popover
        open={isPopoverOpen}
        onOpenChange={(open) => {
          if (!open && !isLoading && !keepEngaged) {
            reset();
          }
        }}
      >
        <PopoverTrigger asChild className="!border-none !bg-transparent">
          <div className="relative select-none">
            <InputComponent
              ref={inputRef}
              placeholder="Ask anything, or start Listen Mode..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              onPaste={handlePaste}
              disabled={isLoading || isHidden}
              className="pr-14 text-xs"
            />

            {/* Conversation active badge & new chat shortcut */}
            {currentConversationId &&
              conversationHistory.length > 0 &&
              !isLoading && (
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      startNewConversation();
                    }}
                    className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/70 rounded"
                    title="Start a new conversation"
                  >
                    <PlusIcon className="w-3 h-3" />
                    <span className="font-medium">New</span>
                  </Button>
                </div>
              )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
            )}
          </div>
        </PopoverTrigger>

        {/* Response Panel */}
        <PopoverContent
          align="end"
          side="bottom"
          className="w-screen p-0 border shadow-lg overflow-hidden border-border/50"
          sideOffset={8}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <SparklesIcon className="w-3.5 h-3.5 text-primary" />
                <h3 className="font-semibold text-xs select-none">
                  AI Assistant
                </h3>
              </div>
              {turnsCount > 0 && (
                <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">
                  {turnsCount} {turnsCount === 1 ? "turn" : "turns"}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 select-none">
              {/* Start New Conversation */}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (isLoading) cancel();
                  startNewConversation();
                  reset();
                }}
                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                title="Start a new conversation"
              >
                <PlusIcon className="w-3 h-3" />
                New Chat
              </Button>

              {/* Copy Latest Response */}
              {response && <CopyButton content={response} />}

              {/* Close Button */}
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  if (isLoading) cancel();
                  reset();
                }}
                title="Close"
              >
                <XIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Conversation Body */}
          <ScrollArea ref={scrollAreaRef} className="h-[calc(100vh-7rem)]">
            <div className="p-3.5 space-y-3">
              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive">
                  <strong>Error:</strong> {error}
                </div>
              )}

              {/* Chronological Message History */}
              {sortedHistory.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "p-3 rounded-xl text-sm transition-all",
                    message.role === "user"
                      ? "bg-primary/5 border border-primary/20 space-y-1"
                      : "bg-muted/30 border border-border/40 space-y-2"
                  )}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 font-semibold">
                      {message.role === "user" ? (
                        <>
                          <UserIcon className="w-3.5 h-3.5 text-sky-500" />
                          <span className="text-sky-500 uppercase tracking-wide text-[10px]">
                            You
                          </span>
                        </>
                      ) : (
                        <>
                          <SparklesIcon className="w-3.5 h-3.5 text-primary" />
                          <span className="text-primary uppercase tracking-wide text-[10px]">
                            Assistant
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {message.role === "assistant" && (
                        <CopyButton content={message.content} />
                      )}
                      <span className="text-[10px] text-muted-foreground/60">
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="prose prose-sm max-w-none dark:prose-invert text-xs leading-relaxed">
                    <Markdown>{message.content}</Markdown>
                  </div>
                </div>
              ))}

              {/* In-flight / Streaming Request */}
              {isLoading && (
                <>
                  {/* Current User Prompt (if not yet committed to history) */}
                  {input && (
                    <div className="p-3 rounded-xl text-sm bg-primary/5 border border-primary/20 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-500">
                        <UserIcon className="w-3.5 h-3.5" />
                        <span className="uppercase tracking-wide text-[10px]">
                          You
                        </span>
                      </div>
                      <p className="text-xs text-foreground leading-relaxed">
                        {input}
                      </p>
                    </div>
                  )}

                  {/* Streaming Assistant Card */}
                  <div className="p-3 rounded-xl text-sm bg-muted/30 border border-border/40 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                      <SparklesIcon className="w-3.5 h-3.5 animate-pulse" />
                      <span className="uppercase tracking-wide text-[10px]">
                        Assistant
                      </span>
                    </div>
                    {response ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert text-xs leading-relaxed">
                        <Markdown>{response}</Markdown>
                        <span className="inline-block w-1.5 h-3.5 bg-primary animate-pulse ml-1 align-middle" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 py-1.5 text-muted-foreground text-xs">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        <span>Generating response...</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Fallback Single Response (if history was empty and not loading) */}
              {!isLoading && sortedHistory.length === 0 && response && (
                <div className="p-3 rounded-xl text-sm bg-muted/30 border border-border/40 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 font-semibold text-primary">
                      <SparklesIcon className="w-3.5 h-3.5" />
                      <span className="uppercase tracking-wide text-[10px]">
                        Assistant
                      </span>
                    </div>
                    <CopyButton content={response} />
                  </div>
                  <div className="prose prose-sm max-w-none dark:prose-invert text-xs leading-relaxed">
                    <Markdown>{response}</Markdown>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
};
