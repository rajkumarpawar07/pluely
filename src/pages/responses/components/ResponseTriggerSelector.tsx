import { Card, Header } from "@/components";
import { RESPONSE_TRIGGERS } from "@/lib/response-settings.constants";
import { updateResponseTrigger, getResponseSettings } from "@/lib/storage/response-settings.storage";
import { useState, useEffect } from "react";
import { CheckCircle2, ZapIcon, MessageSquareIcon, HandIcon } from "lucide-react";

export const ResponseTriggerSelector = () => {
  const [selectedTrigger, setSelectedTrigger] = useState<string>("auto_question");

  useEffect(() => {
    const settings = getResponseSettings();
    setSelectedTrigger(settings.responseTrigger || "auto_question");
  }, []);

  const handleTriggerChange = (triggerId: string) => {
    setSelectedTrigger(triggerId);
    updateResponseTrigger(triggerId);
  };

  const getIcon = (id: string) => {
    switch (id) {
      case "auto_question":
        return <MessageSquareIcon className="size-4 text-primary" />;
      case "auto_all":
        return <ZapIcon className="size-4 text-amber-500" />;
      case "manual_suggest":
        return <HandIcon className="size-4 text-blue-500" />;
      default:
        return <ZapIcon className="size-4 text-primary" />;
    }
  };

  return (
    <div className="space-y-4">
      <Header
        title="Automatic Responses (Listen Mode)"
        description="Choose when the AI should generate response suggestions during meetings. In manual mode, suggestions only fire when you tap Suggest or press Ctrl/Cmd + Enter."
        isMainTitle
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {RESPONSE_TRIGGERS.map((trigger) => (
          <Card
            key={trigger.id}
            className={`relative p-4 border lg:border-2 shadow-none cursor-pointer transition-all ${
              selectedTrigger === trigger.id
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
            onClick={() => handleTriggerChange(trigger.id)}
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                {getIcon(trigger.id)}
                <h3 className="text-sm lg:text-md font-semibold">
                  {trigger.name}
                </h3>
              </div>
              <p className="text-[10px] lg:text-xs text-muted-foreground">
                {trigger.description}
              </p>
            </div>
            {selectedTrigger === trigger.id && (
              <CheckCircle2 className="size-5 text-green-500 flex-shrink-0 absolute top-2 right-2" />
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};
