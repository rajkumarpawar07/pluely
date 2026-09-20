export interface TYPE_PROVIDER {
  id?: string;
  streaming?: boolean;
  responseContentPath?: string;
  isCustom?: boolean;
  curl: string;
}

export interface AIProviderPrioritySlot {
  provider: string;
  variables: Record<string, string>;
  enabled: boolean;
}

export type RoutingStrategy = "fallback" | "round-robin";

export interface AIPriorityConfig {
  strategy: RoutingStrategy;
  slots: [AIProviderPrioritySlot, AIProviderPrioritySlot, AIProviderPrioritySlot];
}
