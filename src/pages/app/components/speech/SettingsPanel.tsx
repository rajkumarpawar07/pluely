import { useState } from "react";
import {
  Button,
  Label,
  Slider,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components";
import {
  ChevronDownIcon,
  SettingsIcon,
  RotateCcwIcon,
  ChevronUpIcon,
  FileTextIcon,
  ExternalLinkIcon,
  SparklesIcon,
} from "lucide-react";
import { VadConfig } from "@/hooks/useSystemAudio";
import { SystemPrompt } from "@/types";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";

// Sensitivity presets for simpler UX
const SENSITIVITY_PRESETS = {
  low: {
    sensitivity_rms: 0.015,
    noise_gate_threshold: 0.005,
    label: "Low",
    description: "Only picks up clear, loud speech",
  },
  normal: {
    sensitivity_rms: 0.012,
    noise_gate_threshold: 0.003,
    label: "Normal",
    description: "Balanced for typical conversations",
  },
  high: {
    sensitivity_rms: 0.008,
    noise_gate_threshold: 0.001,
    label: "High",
    description: "Sensitive to quiet speech and whispers",
  },
} as const;

type SensitivityPreset = keyof typeof SENSITIVITY_PRESETS;

interface SettingsPanelProps {
  // VAD Config
  vadConfig: VadConfig;
  onUpdateVadConfig: (config: VadConfig) => void;
  // Context settings
  contextContent: string;
  setContextContent?: (content: string) => void;
  // Session Prompt Selection
  prompts?: SystemPrompt[];
  sessionPromptId?: number | null;
  onSelectSessionPrompt?: (promptId: number | null) => void;
  onOpenContextModal?: () => void;
  useSystemPrompt?: boolean;
  setUseSystemPrompt?: (val: boolean) => void;
}

export const SettingsPanel = ({
  vadConfig,
  onUpdateVadConfig,
  contextContent,
  prompts = [],
  sessionPromptId = null,
  onSelectSessionPrompt,
  onOpenContextModal,
}: SettingsPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Determine current sensitivity preset based on values
  const getCurrentPreset = (): SensitivityPreset | "custom" => {
    for (const [key, preset] of Object.entries(SENSITIVITY_PRESETS)) {
      if (
        Math.abs(vadConfig.sensitivity_rms - preset.sensitivity_rms) < 0.001 &&
        Math.abs(vadConfig.noise_gate_threshold - preset.noise_gate_threshold) <
          0.001
      ) {
        return key as SensitivityPreset;
      }
    }
    return "custom";
  };

  const currentPreset = getCurrentPreset();

  const handlePresetChange = (preset: SensitivityPreset) => {
    const presetValues = SENSITIVITY_PRESETS[preset];
    onUpdateVadConfig({
      ...vadConfig,
      sensitivity_rms: presetValues.sensitivity_rms,
      noise_gate_threshold: presetValues.noise_gate_threshold,
    });
  };

  const handleResetDefaults = () => {
    const defaultConfig: VadConfig = {
      enabled: vadConfig.enabled, // Keep current mode
      hop_size: 1024,
      sensitivity_rms: 0.012,
      peak_threshold: 0.035,
      silence_chunks: 45,
      min_speech_chunks: 7,
      pre_speech_chunks: 12,
      noise_gate_threshold: 0.003,
      max_recording_duration_secs: 180,
    };
    onUpdateVadConfig(defaultConfig);
  };

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
      {/* Settings Header - Always visible */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Settings</span>
        </div>
        <ChevronDownIcon
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Settings Content */}
      {isOpen && (
        <div className="px-3 pb-3 space-y-4">
          {/* Recording Settings Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Recording
            </h4>

            {/* Sensitivity Presets - Only for VAD mode */}
            {vadConfig.enabled && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">
                  Speech Sensitivity
                </Label>
                <div className="flex gap-2">
                  {(
                    Object.entries(SENSITIVITY_PRESETS) as [
                      SensitivityPreset,
                      (typeof SENSITIVITY_PRESETS)[SensitivityPreset]
                    ][]
                  ).map(([key, preset]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handlePresetChange(key)}
                      className={cn(
                        "flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all border",
                        currentPreset === key
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-accent"
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {currentPreset === "custom"
                    ? "Custom sensitivity values"
                    : SENSITIVITY_PRESETS[currentPreset as SensitivityPreset]
                        .description}
                </p>
              </div>
            )}

            {/* Max Duration - Only for Manual mode */}
            {!vadConfig.enabled && (
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center justify-between">
                  <span>Max Recording Duration</span>
                  <span className="text-muted-foreground font-normal">
                    {Math.round(vadConfig.max_recording_duration_secs / 60)} min
                  </span>
                </Label>
                <Slider
                  value={[vadConfig.max_recording_duration_secs / 60]}
                  onValueChange={([value]) =>
                    onUpdateVadConfig({
                      ...vadConfig,
                      max_recording_duration_secs: Math.round(value * 60),
                    })
                  }
                  min={1}
                  max={3}
                  step={0.5}
                  className="w-full"
                />
              </div>
            )}
          </div>

          {/* Context & System Prompts Section */}
          <div className="space-y-3 pt-3 border-t border-border/50">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              AI Configuration
            </h4>

            {/* Session System Prompt Dropdown */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <SparklesIcon className="w-3 h-3 text-primary" />
                  <span>Session System Prompt</span>
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
                <SelectTrigger className="h-8 text-xs w-full bg-background/50">
                  <SelectValue placeholder="Select a system prompt..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default" className="text-xs font-medium">
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

            {/* Session Context (Resume & JD) */}
            <div className="p-2.5 rounded-lg border border-border/40 bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <FileTextIcon className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium">Session Context</span>
                </div>
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 text-[9px] bg-primary/10 text-primary border-0"
                >
                  {contextContent.trim()
                    ? `${contextContent.trim().split(/\s+/).length} words active`
                    : "Not set"}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Add your resume, target job description, or meeting notes to ground AI answers in your real experience.
              </p>
              {onOpenContextModal && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onOpenContextModal}
                  className="h-6 w-full text-[10px] gap-1 border-primary/30 hover:bg-primary/10 text-primary cursor-pointer"
                >
                  <FileTextIcon className="w-2.5 h-2.5" />
                  {contextContent.trim() ? "Edit Resume / Context" : "Add Resume / Context"}
                </Button>
              )}
            </div>
          </div>

          {/* Advanced Settings Toggle */}
          <div className="pt-3 border-t border-border/50">
            <button
              type="button"
              className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <span>Advanced Settings</span>
              {showAdvanced ? (
                <ChevronUpIcon className="w-3 h-3" />
              ) : (
                <ChevronDownIcon className="w-3 h-3" />
              )}
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-3">
                {/* VAD-specific advanced settings */}
                {vadConfig.enabled && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium flex items-center justify-between">
                        <span>Speech Sensitivity (Raw)</span>
                        <span className="text-muted-foreground font-normal">
                          {(vadConfig.sensitivity_rms * 1000).toFixed(1)}
                        </span>
                      </Label>
                      <Slider
                        value={[vadConfig.sensitivity_rms * 1000]}
                        onValueChange={([value]) =>
                          onUpdateVadConfig({
                            ...vadConfig,
                            sensitivity_rms: value / 1000,
                          })
                        }
                        min={1}
                        max={20}
                        step={0.5}
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium flex items-center justify-between">
                        <span>Silence Duration</span>
                        <span className="text-muted-foreground font-normal">
                          {(
                            (vadConfig.silence_chunks * vadConfig.hop_size) /
                            44100
                          ).toFixed(1)}
                          s
                        </span>
                      </Label>
                      <Slider
                        value={[vadConfig.silence_chunks]}
                        onValueChange={([value]) =>
                          onUpdateVadConfig({
                            ...vadConfig,
                            silence_chunks: Math.round(value),
                          })
                        }
                        min={20}
                        max={180}
                        step={5}
                        className="w-full"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        How long to wait after speech stops
                      </p>
                    </div>
                  </>
                )}

                {/* Noise gate - both modes */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium flex items-center justify-between">
                    <span>Noise Gate</span>
                    <span className="text-muted-foreground font-normal">
                      {(vadConfig.noise_gate_threshold * 1000).toFixed(1)}
                    </span>
                  </Label>
                  <Slider
                    value={[vadConfig.noise_gate_threshold * 1000]}
                    onValueChange={([value]) =>
                      onUpdateVadConfig({
                        ...vadConfig,
                        noise_gate_threshold: value / 1000,
                      })
                    }
                    min={0}
                    max={10}
                    step={0.1}
                    className="w-full"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Filters background noise
                  </p>
                </div>

                {/* Reset button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetDefaults}
                  className="w-full text-xs"
                >
                  <RotateCcwIcon className="w-3 h-3 mr-1.5" />
                  Reset to Defaults
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
