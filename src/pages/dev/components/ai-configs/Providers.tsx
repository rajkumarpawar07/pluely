import { Button, Header, Input, Selection, TextInput } from "@/components";
import { Badge, Switch } from "@/components/ui";
import { DEFAULT_PROVIDER_MODELS } from "@/config/constants";
import { AIProviderPrioritySlot, AIPriorityConfig, UseSettingsReturn } from "@/types";
import curl2Json, { ResultJSON } from "@bany/curl-to-json";
import { extractVariables, getProviderCooldown, clearProviderCooldown } from "@/lib";
import { AlertCircle, KeyIcon, RefreshCw, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";

export const Providers = ({
  allAiProviders,
  selectedAIProvider,
  onSetSelectedAIProvider,
  aiPriorityConfig,
  onSetAIPriorityConfig,
  onSetPrioritySlot,
}: UseSettingsReturn) => {
  const [activeSlotIdx, setActiveSlotIdx] = useState<number>(0);
  const [, setCooldownTrigger] = useState(0);

  // Active configuration with safe defaults
  const config: AIPriorityConfig = aiPriorityConfig && aiPriorityConfig.slots ? aiPriorityConfig : {
    strategy: "fallback",
    slots: [
      {
        provider: selectedAIProvider?.provider || "",
        variables: selectedAIProvider?.variables || {},
        enabled: true,
      },
      { provider: "", variables: {}, enabled: true },
      { provider: "", variables: {}, enabled: true },
    ],
  };

  const currentSlot: AIProviderPrioritySlot = config.slots[activeSlotIdx] || {
    provider: "",
    variables: {},
    enabled: true,
  };

  const currentProvider = allAiProviders?.find(
    (p) => p?.id === currentSlot?.provider
  );

  const [localParsedCurl, setLocalParsedCurl] = useState<ResultJSON | null>(null);

  useEffect(() => {
    if (currentProvider?.curl) {
      try {
        const json = curl2Json(currentProvider.curl);
        setLocalParsedCurl(json as ResultJSON);
      } catch {
        setLocalParsedCurl(null);
      }
    } else {
      setLocalParsedCurl(null);
    }
  }, [currentProvider?.curl]);

  // Extract variables for the current provider
  const extractedVars = currentProvider?.curl
    ? extractVariables(currentProvider.curl)
    : [];

  const apiKeyVar = extractedVars.find((v) => v.key === "api_key");

  const getApiKeyValue = () => {
    if (!apiKeyVar || !currentSlot.variables) return "";
    return currentSlot.variables[apiKeyVar.key] || "";
  };

  const isApiKeyEmpty = () => {
    return !getApiKeyValue().trim();
  };

  const handleUpdateSlotVariables = (updatedVars: Record<string, string>) => {
    onSetPrioritySlot(activeSlotIdx, {
      variables: updatedVars,
      enabled: true,
    });
    if (activeSlotIdx === 0) {
      onSetSelectedAIProvider({
        provider: currentSlot.provider,
        variables: updatedVars,
      });
    }
  };

  const handleProviderSelect = (newProviderId: string) => {
    const defaultModel = DEFAULT_PROVIDER_MODELS[newProviderId] || "";
    const newVars: Record<string, string> = {
      ...(currentSlot.variables || {}),
    };
    if (defaultModel && !newVars.model) {
      newVars.model = defaultModel;
    }

    onSetPrioritySlot(activeSlotIdx, {
      provider: newProviderId,
      variables: newVars,
      enabled: true,
    });
    if (activeSlotIdx === 0) {
      onSetSelectedAIProvider({
        provider: newProviderId,
        variables: newVars,
      });
    }
  };

  const cooldownRemaining = currentSlot.provider
    ? getProviderCooldown(currentSlot.provider)
    : 0;

  return (
    <div className="space-y-4">
      {/* Header & Routing Strategy */}
      <div className="space-y-2">
        <Header
          title="AI Provider Priority & Failover"
          description="Configure your primary and fallback AI providers. If your primary provider hits a rate limit or quota error, Pluely will automatically jump to your fallback provider."
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-border/50 bg-muted/20">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Multi-Provider Mode
            </div>
            <div className="text-xs text-muted-foreground">
              {config.strategy === "fallback"
                ? "Priority Fallback: Always uses 1st Priority until rate-limited/failed, then switches to 2nd & 3rd."
                : "Round-Robin: Rotates requests across all enabled providers to spread API usage."}
            </div>
          </div>
          <div className="flex rounded-lg border border-border/60 p-0.5 bg-background text-xs shrink-0 self-start sm:self-auto">
            <button
              type="button"
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                config.strategy === "fallback"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() =>
                onSetAIPriorityConfig({ ...config, strategy: "fallback" })
              }
            >
              Priority Fallback
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                config.strategy === "round-robin"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() =>
                onSetAIPriorityConfig({ ...config, strategy: "round-robin" })
              }
            >
              Round Robin
            </button>
          </div>
        </div>
      </div>

      {/* Priority Slots Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {[0, 1, 2].map((idx) => {
          const slot = config.slots[idx];
          const isSelected = activeSlotIdx === idx;
          const slotProvider = allAiProviders?.find(
            (p) => p.id === slot?.provider
          );
          const hasProvider = Boolean(slot?.provider);
          const isEnabled = idx === 0 || (hasProvider && slot?.enabled !== false);
          const cooldown = slot?.provider ? getProviderCooldown(slot.provider) : 0;
          const configuredModel =
            slot?.variables?.model ||
            (slot?.provider ? DEFAULT_PROVIDER_MODELS[slot.provider] : "") ||
            "";

          return (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveSlotIdx(idx)}
              className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all relative ${
                isSelected
                  ? "border-primary bg-primary/5 shadow-xs ring-1 ring-primary/30"
                  : "border-border/60 hover:border-border bg-card/50 hover:bg-card"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {idx === 0
                    ? "1st Priority"
                    : idx === 1
                    ? "2nd Priority"
                    : "3rd Priority"}
                </span>
                <Badge
                  variant={
                    idx === 0
                      ? "default"
                      : isEnabled && hasProvider
                      ? "secondary"
                      : "outline"
                  }
                  className="text-[10px] px-1.5 py-0"
                >
                  {idx === 0
                    ? "Primary"
                    : !hasProvider
                    ? "Unset"
                    : isEnabled
                    ? "Active Fallback"
                    : "Disabled"}
                </Badge>
              </div>

              <div className="text-sm font-semibold truncate w-full">
                {hasProvider
                  ? slotProvider?.isCustom
                    ? slotProvider.id || "Custom Provider"
                    : slotProvider?.id || slot?.provider
                  : "Not configured"}
              </div>

              {hasProvider && configuredModel && (
                <div className="text-[11px] text-muted-foreground truncate w-full mt-0.5 font-mono">
                  {configuredModel}
                </div>
              )}

              {cooldown > 0 && (
                <div className="text-[11px] text-amber-500 font-medium flex items-center gap-1 mt-1">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>Cooldown ({Math.ceil(cooldown / 1000)}s)</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Priority Slot Configuration Panel */}
      <div className="p-4 rounded-xl border border-border/70 bg-card/40 space-y-4">
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div>
            <div className="text-sm font-semibold flex items-center gap-2">
              <span>
                {activeSlotIdx === 0
                  ? "1st Priority (Primary Provider)"
                  : activeSlotIdx === 1
                  ? "2nd Priority (Secondary Fallback)"
                  : "3rd Priority (Tertiary Fallback)"}
              </span>
              {activeSlotIdx === 0 && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  Default Active
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeSlotIdx === 0
                ? "This provider will be tried first for all queries."
                : `Used automatically if ${
                    activeSlotIdx === 1 ? "1st" : "1st and 2nd"
                  } priority encounters an error or rate limit.`}
            </p>
          </div>

          {activeSlotIdx > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {currentSlot.enabled !== false ? "Active" : "Disabled"}
              </span>
              <Switch
                checked={currentSlot.enabled !== false}
                onCheckedChange={(checked) => {
                  onSetPrioritySlot(activeSlotIdx, { enabled: checked });
                }}
              />
            </div>
          )}
        </div>

        {/* Cooldown Alert Banner */}
        {cooldownRemaining > 0 && (
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                This provider recently hit a rate limit or error. Cooling down
                for {Math.ceil(cooldownRemaining / 1000)}s before retry.
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2 gap-1"
              onClick={() => {
                if (currentSlot.provider) {
                  clearProviderCooldown(currentSlot.provider);
                  setCooldownTrigger((t) => t + 1);
                }
              }}
            >
              <RefreshCw className="h-3 w-3" />
              Reset
            </Button>
          </div>
        )}

        {/* Provider Dropdown */}
        <div className="space-y-1.5">
          <Header
            title="Provider Service"
            description={`Select the AI provider service to use for Priority ${
              activeSlotIdx + 1
            }.`}
          />
          <Selection
            selected={currentSlot.provider}
            options={allAiProviders?.map((provider) => {
              const json = curl2Json(provider?.curl);
              return {
                label: provider?.isCustom
                  ? json?.url || "Custom Provider"
                  : provider?.id || "Custom Provider",
                value: provider?.id || "Custom Provider",
                isCustom: provider?.isCustom,
              };
            })}
            placeholder={`Choose provider for Priority ${activeSlotIdx + 1}`}
            onChange={(value) => handleProviderSelect(value)}
          />
        </div>

        {localParsedCurl ? (
          <Header
            title={`Method: ${
              localParsedCurl?.method || "Invalid"
            }, Endpoint: ${localParsedCurl?.url || "Invalid"}`}
            description="API requests will be routed to this endpoint with your configured credentials."
          />
        ) : null}

        {/* API Key Input */}
        {apiKeyVar ? (
          <div className="space-y-1.5">
            <Header
              title="API Key"
              description={`Enter your ${
                currentProvider?.isCustom
                  ? "Custom Provider"
                  : currentSlot.provider
              } API key. Stored securely on your device.`}
            />

            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="**********"
                value={getApiKeyValue()}
                onChange={(value) => {
                  const val =
                    typeof value === "string" ? value : value.target.value;
                  handleUpdateSlotVariables({
                    ...currentSlot.variables,
                    [apiKeyVar.key]: val,
                  });
                }}
                className="flex-1 h-11 border-1 border-input/50 focus:border-primary/50 transition-colors"
              />
              {isApiKeyEmpty() ? (
                <Button
                  size="icon"
                  className="shrink-0 h-11 w-11"
                  title="Submit API Key"
                  disabled={isApiKeyEmpty()}
                >
                  <KeyIcon className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    handleUpdateSlotVariables({
                      ...currentSlot.variables,
                      [apiKeyVar.key]: "",
                    });
                  }}
                  size="icon"
                  variant="destructive"
                  className="shrink-0 h-11 w-11"
                  title="Remove API Key"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {/* Additional Extracted Variables (Model, etc.) */}
        <div className="space-y-3 pt-1">
          {extractedVars
            .filter((v) => v.key !== "api_key")
            .map((variable) => {
              const varVal = currentSlot.variables?.[variable.key] || "";

              return (
                <div className="space-y-1" key={variable.key}>
                  <Header
                    title={variable.value || ""}
                    description={`Set your preferred ${variable.key.replace(
                      /_/g,
                      " "
                    )} for Priority ${activeSlotIdx + 1} (${
                      currentSlot.provider
                    }).`}
                  />
                  <TextInput
                    placeholder={`e.g. model identifier for ${currentSlot.provider}`}
                    value={varVal}
                    onChange={(value) => {
                      handleUpdateSlotVariables({
                        ...currentSlot.variables,
                        [variable.key]: value,
                      });
                    }}
                  />
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
