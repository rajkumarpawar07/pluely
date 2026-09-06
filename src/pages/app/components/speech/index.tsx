import { useState, useEffect } from "react";
import {
  Button,
  Popover,
  PopoverTrigger,
  PopoverContent,
  ScrollArea,
} from "@/components";
import {
  HeadphonesIcon,
  AlertCircleIcon,
  LoaderIcon,
  AudioLinesIcon,
  CameraIcon,
  PlusIcon,
  XIcon,
  FileTextIcon,
  MicIcon,
  MicOffIcon,
  DownloadIcon,
  CheckIcon,
} from "lucide-react";
import { ResultsSection } from "./ResultsSection";
import { SettingsPanel } from "./SettingsPanel";
import { PermissionFlow } from "./PermissionFlow";
import { QuickActions } from "./QuickActions";
import { Warning } from "./Warning";
import { ContextModal } from "./ContextModal";
import { useSystemAudioType } from "@/hooks";
import { useApp } from "@/contexts";
import { cn } from "@/lib/utils";

export const SystemAudio = (props: useSystemAudioType) => {
  const {
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
    isPopoverOpen,
    setIsPopoverOpen,
    triggerSuggestion,
    contextContent,
    setContextContent,
    captureAndAnalyzeScreen,
    isCapturingScreenshot,
    isMicMuted,
    toggleMicMute,
    activeFormat,
    prompts,
    sessionPromptId,
    setSessionPromptId,
    regenerateWithFormat,
    exportMeetingNotes,
    startNewConversation,
    conversation,
    resizeWindow,
    quickActions,
    addQuickAction,
    removeQuickAction,
    isManagingQuickActions,
    setIsManagingQuickActions,
    showQuickActions,
    setShowQuickActions,
    handleQuickActionClick,
    vadConfig,
    updateVadConfiguration,
    scrollAreaRef,
  } = props;

  const { hasActiveLicense, supportsImages } = useApp();

  // View mode toggle
  const [conversationMode, setConversationMode] = useState(false);
  // Context modal toggle
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  // Copied notes status
  const [copiedExport, setCopiedExport] = useState(false);

  const handleExportNotes = () => {
    const notes = exportMeetingNotes?.();
    if (notes) {
      navigator.clipboard.writeText(notes);
      setCopiedExport(true);
      setTimeout(() => setCopiedExport(false), 2000);
    }
  };

  const isVadMode = vadConfig.enabled;
  const hasResponse = lastAIResponse || isAIProcessing;

  // Keyboard shortcut for Cmd+K to toggle view mode and Cmd+Enter to suggest response
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPopoverOpen) return;

      // Cmd+K or Ctrl+K to toggle view mode
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setConversationMode((prev) => !prev);
      }

      // Cmd+Enter or Ctrl+Enter to suggest response
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        triggerSuggestion();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPopoverOpen, triggerSuggestion]);

  const handleToggleCapture = async () => {
    if (capturing) {
      await stopCapture();
    } else {
      await startCapture();
    }
  };

  const getButtonIcon = () => {
    if (setupRequired) return <AlertCircleIcon className="text-orange-500" />;
    if (error && !setupRequired)
      return <AlertCircleIcon className="text-red-500" />;
    if (isProcessing) return <LoaderIcon className="animate-spin" />;
    if (capturing)
      return <AudioLinesIcon className="text-green-500 animate-pulse" />;
    return <HeadphonesIcon />;
  };

  const getButtonTitle = () => {
    if (setupRequired) return "Setup required - Click for instructions";
    if (error && !setupRequired) return `Error: ${error}`;
    if (isProcessing) return "Transcribing audio...";
    if (capturing) return "Stop Listen Mode (Meetings & Mic)";
    return "Start Listen Mode (Meetings & Mic)";
  };

  return (
    <Popover
      open={isPopoverOpen}
      onOpenChange={(open) => {
        if (capturing && !open) {
          return;
        }
        setIsPopoverOpen(open);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="icon"
          title={getButtonTitle()}
          onClick={handleToggleCapture}
          className={cn(
            capturing && "bg-green-50 hover:bg-green-100",
            error && "bg-red-100 hover:bg-red-200"
          )}
        >
          {getButtonIcon()}
        </Button>
      </PopoverTrigger>

      {(capturing || setupRequired || error) && (
        <PopoverContent
          align="end"
          side="bottom"
          className="select-none w-screen p-0 border shadow-lg overflow-hidden border-input/50"
          sideOffset={8}
        >
          <div className="relative flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
            {/* Context & System Prompt Modal Overlay */}
            <ContextModal
              isOpen={isContextModalOpen}
              onClose={() => setIsContextModalOpen(false)}
              contextContent={contextContent}
              setContextContent={setContextContent}
              prompts={prompts}
              sessionPromptId={sessionPromptId}
              onSelectSessionPrompt={setSessionPromptId}
            />

            {/* Header - Streamlined, clean, Cluely-style */}
            <div className="flex-shrink-0 p-2.5 px-3 border-b border-border/50 bg-background/80 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-2">
                {/* Live Status indicator */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Live Audio</span>
                  </div>
                  {contextContent && (
                    <button
                      type="button"
                      onClick={() => setIsContextModalOpen(true)}
                      className="text-[10px] text-muted-foreground hidden sm:inline-flex items-center gap-1 bg-muted/60 hover:bg-muted px-2 py-0.5 rounded border border-border/40 transition-colors cursor-pointer"
                      title="Click to view or edit session context"
                    >
                      <FileTextIcon className="w-2.5 h-2.5 text-primary" />
                      <span>Context Active</span>
                    </button>
                  )}
                </div>

                {/* Header Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Stealth Mic Mute Button */}
                  {!setupRequired && (
                    <Button
                      size="sm"
                      variant={isMicMuted ? "destructive" : "outline"}
                      onClick={toggleMicMute}
                      className={cn(
                        "h-6 text-[10px] gap-1 px-2 font-medium transition-all",
                        isMicMuted
                          ? "bg-red-500/15 text-red-500 border border-red-500/30 hover:bg-red-500/25"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      title={
                        isMicMuted
                          ? "Unmute your microphone"
                          : "Mute your microphone (meeting audio still captured)"
                      }
                    >
                      {isMicMuted ? (
                        <>
                          <MicOffIcon className="w-3 h-3 text-red-500" />
                          Muted
                        </>
                      ) : (
                        <>
                          <MicIcon className="w-3 h-3" />
                          Mic
                        </>
                      )}
                    </Button>
                  )}

                  {/* Context / System Prompt Button */}
                  {!setupRequired && (
                    <Button
                      size="sm"
                      variant={contextContent ? "default" : "outline"}
                      onClick={() => setIsContextModalOpen(true)}
                      className={cn(
                        "h-6 text-[10px] gap-1 px-2 font-medium transition-all",
                        contextContent
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                      )}
                      title="Set resume, job description, or meeting context"
                    >
                      <FileTextIcon className="w-3 h-3" />
                      Context
                      {contextContent && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
                      )}
                    </Button>
                  )}

                  {/* Screenshot & AI Vision Button */}
                  {hasActiveLicense && !setupRequired && supportsImages && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => captureAndAnalyzeScreen?.()}
                      disabled={isCapturingScreenshot || isAIProcessing}
                      className="h-6 text-[10px] gap-1 px-2 hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                      title="Capture screen & analyze with AI"
                    >
                      {isCapturingScreenshot ? (
                        <LoaderIcon className="w-3 h-3 animate-spin text-primary" />
                      ) : (
                        <CameraIcon className="w-3 h-3" />
                      )}
                      Screenshot
                    </Button>
                  )}

                  {/* Export Meeting Notes Button */}
                  {conversation.messages.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleExportNotes}
                      className="h-6 text-[10px] gap-1 px-2 text-muted-foreground hover:text-foreground"
                      title="Copy full meeting transcript & solutions to clipboard"
                    >
                      {copiedExport ? (
                        <CheckIcon className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <DownloadIcon className="w-3 h-3" />
                      )}
                      {copiedExport ? "Copied!" : "Export"}
                    </Button>
                  )}

                  {/* New Conversation Button */}
                  {!setupRequired && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={startNewConversation}
                      className="h-6 text-[10px] gap-1 px-2"
                      title="Start a new conversation"
                    >
                      <PlusIcon className="w-3 h-3" />
                      New
                    </Button>
                  )}

                  {/* Close Button */}
                  {!capturing && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title="Close"
                      onClick={() => {
                        setIsPopoverOpen(false);
                        resizeWindow(false);
                      }}
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0" ref={scrollAreaRef}>
              <div className="p-2.5 space-y-2.5">
                {/* Error Display */}
                {error && !setupRequired && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800/40">
                    <AlertCircleIcon className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-medium text-red-800 dark:text-red-400">
                        Error
                      </p>
                      <p className="text-[10px] text-red-700 dark:text-red-300">{error}</p>
                    </div>
                  </div>
                )}

                {/* Setup Required - Permission Flow */}
                {setupRequired ? (
                  <PermissionFlow
                    onPermissionGranted={() => {
                      startCapture();
                    }}
                    onPermissionDenied={() => {
                      // Keep showing setup instructions
                    }}
                  />
                ) : (
                  <>
                    {/* AI Response & Speaker Diarization */}
                    <ResultsSection
                      lastTranscription={lastTranscription}
                      lastSpeaker={lastSpeaker}
                      lastAIResponse={lastAIResponse}
                      isAIProcessing={isAIProcessing}
                      conversation={conversation}
                      conversationMode={conversationMode}
                      setConversationMode={setConversationMode}
                      onSuggest={triggerSuggestion}
                      onRegenerateFormat={regenerateWithFormat}
                      activeFormat={activeFormat}
                    />

                    {/* Sensitivity & Device Settings */}
                    <SettingsPanel
                      vadConfig={vadConfig}
                      onUpdateVadConfig={updateVadConfiguration}
                      contextContent={contextContent}
                      setContextContent={setContextContent}
                      prompts={prompts}
                      sessionPromptId={sessionPromptId}
                      onSelectSessionPrompt={setSessionPromptId}
                      onOpenContextModal={() => setIsContextModalOpen(true)}
                    />

                    {/* Shortcuts info */}
                    <Warning isVadMode={isVadMode} />
                  </>
                )}
              </div>
            </ScrollArea>

            {/* Quick Actions */}
            {!setupRequired && hasResponse && (
              <div className="flex-shrink-0 border-t border-border/50 p-2">
                <QuickActions
                  actions={quickActions}
                  onActionClick={handleQuickActionClick}
                  onAddAction={addQuickAction}
                  onRemoveAction={removeQuickAction}
                  isManaging={isManagingQuickActions}
                  setIsManaging={setIsManagingQuickActions}
                  show={showQuickActions}
                  setShow={setShowQuickActions}
                />
              </div>
            )}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
};
