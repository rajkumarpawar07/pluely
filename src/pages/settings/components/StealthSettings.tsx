import { Switch, Label, Header, Badge } from "@/components";
import { useApp } from "@/contexts";
import {
  ShieldCheckIcon,
  EyeOffIcon,
  KeyboardIcon,
  InfoIcon,
  MonitorCheckIcon,
} from "lucide-react";

interface StealthSettingsProps {
  className?: string;
}

export const StealthSettings = ({ className }: StealthSettingsProps) => {
  const { customizable, toggleDiscreetScreenShare, toggleStealthKeystrokeMode } =
    useApp();

  const isDiscreetEnabled = customizable?.discreetScreenShare?.isEnabled ?? true;
  const isStealthKeystrokeEnabled =
    customizable?.stealthKeystrokeMode?.isEnabled ?? false;

  const handleDiscreetChange = async (checked: boolean) => {
    await toggleDiscreetScreenShare(checked);
  };

  const handleStealthKeystrokeChange = async (checked: boolean) => {
    await toggleStealthKeystrokeMode(checked);
  };

  return (
    <div id="stealth-and-privacy" className={`space-y-4 ${className || ""}`}>
      <Header
        title="Stealth and Privacy"
        description="Configure screen sharing discretion, recording shielding, and discreet keystroke handling"
        isMainTitle
      />

      <div className="space-y-4">
        {/* Discreet during screen shares */}
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3 transition-colors hover:border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mt-0.5">
                <ShieldCheckIcon className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-semibold">
                    Discreet during screen shares
                  </Label>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 h-4 font-normal ${
                      isDiscreetEnabled
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDiscreetEnabled ? "Protected (Invisible)" : "Visible"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                  The overlay is designed to stay out of the way when you&apos;re sharing your screen. Rather than announcing itself, it&apos;s built to blend in and avoid drawing attention during a screen share, video call, or recording — so you can reference Pluely&apos;s answers or run a Listen session without it becoming the focal point of what others see.
                </p>
                <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground/80">
                  <MonitorCheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                  <span>
                    Invisible on Zoom, Google Meet, Microsoft Teams, Slack, Discord & OBS Studio.
                  </span>
                </div>
              </div>
            </div>
            <Switch
              checked={isDiscreetEnabled}
              onCheckedChange={handleDiscreetChange}
              aria-label="Toggle discreet screen share mode"
            />
          </div>
        </div>

        {/* Windows stealth keystroke mode */}
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3 transition-colors hover:border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 mt-0.5">
                <KeyboardIcon className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-semibold">
                    Windows stealth keystroke mode
                  </Label>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 h-4 font-normal ${
                      isStealthKeystrokeEnabled
                        ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isStealthKeystrokeEnabled ? "Stealth Active" : "Standard"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                  On Windows, Pluely offers a stealth keystroke mode that adds an extra layer of discretion to how the overlay is triggered and used, for situations where you want the overlay&apos;s presence to be as unobtrusive as possible. Enable it from Pluely&apos;s settings if you regularly work in screen-shared environments on Windows.
                </p>
                <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground/80">
                  <EyeOffIcon className="w-3.5 h-3.5 text-sky-500" />
                  <span>
                    Preserves active editor focus and suppresses taskbar flashing while using hotkeys.
                  </span>
                </div>
              </div>
            </div>
            <Switch
              checked={isStealthKeystrokeEnabled}
              onCheckedChange={handleStealthKeystrokeChange}
              aria-label="Toggle Windows stealth keystroke mode"
            />
          </div>
        </div>

        {/* How it works */}
        <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <InfoIcon className="w-4 h-4 text-primary" />
            <span>How it works</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-1.5 pl-6 leading-relaxed">
            <p>
              1. Open Pluely&apos;s settings and look for the <strong className="text-foreground">Stealth and Privacy</strong> section.
            </p>
            <p>
              2. On Windows, enable <strong className="text-foreground">stealth keystroke mode</strong> if you frequently work in screen-shared settings.
            </p>
            <p>
              3. Screen share discretion works via native OS display affinity (<code className="text-[11px] px-1 rounded bg-muted font-mono">WDA_EXCLUDEFROMCAPTURE</code> on Windows), excluding Pluely from the desktop duplication and graphics capture pipeline so only you see it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
