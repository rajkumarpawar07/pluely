import { useState, useEffect } from "react";
import {
  Button,
  Label,
  Textarea,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components";
import {
  FileTextIcon,
  Trash2Icon,
  CheckIcon,
  XIcon,
  SparklesIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { SystemPrompt } from "@/types";
import { invoke } from "@tauri-apps/api/core";

interface ContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  contextContent: string;
  setContextContent: (content: string) => void;
  prompts?: SystemPrompt[];
  sessionPromptId?: number | null;
  onSelectSessionPrompt?: (promptId: number | null) => void;
  customSystemPrompt?: string;
  setCustomSystemPrompt?: (prompt: string) => void;
}

export const ContextModal = ({
  isOpen,
  onClose,
  contextContent,
  setContextContent,
  prompts = [],
  sessionPromptId = null,
  onSelectSessionPrompt,
}: ContextModalProps) => {
  const [localContext, setLocalContext] = useState(contextContent);

  useEffect(() => {
    setLocalContext(contextContent);
  }, [contextContent]);

  if (!isOpen) return null;

  const handleSave = () => {
    setContextContent(localContext);
    onClose();
  };

  const handleClear = () => {
    setLocalContext("");
    setContextContent("");
  };

  const wordCount = localContext.trim()
    ? localContext.trim().split(/\s+/).length
    : 0;

  const activePromptName =
    (sessionPromptId && prompts.find((p) => p.id === sessionPromptId)?.name) ||
    "Default AI Assistant (Minimal)";

  return (
    <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-md p-4 flex flex-col justify-between overflow-hidden animate-in fade-in duration-200">
      <div className="flex flex-col flex-1 min-h-0 space-y-2.5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 pb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <FileTextIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold">Session Context & System Prompt</h3>
              <p className="text-[10px] text-muted-foreground">
                Select your AI prompt and paste your resume / job description for this session
              </p>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={onClose}
          >
            <XIcon className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Session System Prompt Selector */}
        <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-medium flex items-center gap-1.5">
              <SparklesIcon className="w-3 h-3 text-primary" />
              <span>System Prompt for this Session</span>
            </Label>
            <button
              type="button"
              onClick={() => invoke("open_dashboard")}
              className="text-[10px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
              title="Create or manage system prompts in settings"
            >
              <ExternalLinkIcon className="w-2.5 h-2.5" />
              Manage in Settings
            </button>
          </div>

          <Select
            value={sessionPromptId ? sessionPromptId.toString() : "default"}
            onValueChange={(val) => {
              if (onSelectSessionPrompt) {
                onSelectSessionPrompt(val === "default" ? null : Number(val));
              }
            }}
          >
            <SelectTrigger className="h-7 text-xs w-full bg-background/50">
              <SelectValue placeholder="Choose a system prompt..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default" className="text-xs">
                Default AI Assistant (Minimal)
              </SelectItem>
              {prompts &&
                prompts.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()} className="text-xs">
                    {p.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Candidate Resume / Context Area */}
        <div className="flex-1 flex flex-col min-h-0 space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-medium flex items-center gap-1.5">
              <span>Candidate Resume, Projects & Target Role</span>
              {wordCount > 0 && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[9px] bg-primary/10 text-primary border-0">
                  {wordCount} words
                </Badge>
              )}
            </Label>
            <span className="text-[10px] text-muted-foreground/80 truncate max-w-[200px]" title={activePromptName}>
              Active: {activePromptName}
            </span>
          </div>

          <Textarea
            value={localContext}
            onChange={(e) => setLocalContext(e.target.value)}
            placeholder={"Paste your Resume, Job Description, Project Details, or Meeting Notes here...\n\nExample:\n- 5+ years building backend systems in TypeScript/Node & Go.\n- Designed and scaled event-driven microservices handling 20K req/sec.\n- Target Role: Senior Software Engineer at TechCorp."}
            className="flex-1 min-h-[140px] text-xs resize-none font-sans leading-relaxed"
          />
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between border-t border-border/50 pt-2.5 mt-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleClear}
          className="h-7 text-xs text-muted-foreground hover:text-red-500 gap-1"
        >
          <Trash2Icon className="w-3 h-3" />
          Clear
        </Button>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
            className="h-7 text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            className="h-7 text-xs gap-1"
          >
            <CheckIcon className="w-3 h-3" />
            Save & Apply
          </Button>
        </div>
      </div>
    </div>
  );
};
