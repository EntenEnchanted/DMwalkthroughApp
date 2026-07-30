import { createContext, useContext, type ReactNode } from "react";

const CampaignContext = createContext<string | null>(null);

export function useCampaignId(): string {
  const campaignId = useContext(CampaignContext);
  if (!campaignId) throw new Error("useCampaignId must be used within CampaignProvider");
  return campaignId;
}

export function CampaignProvider({ campaignId, children }: { campaignId: string; children: ReactNode }) {
  return <CampaignContext.Provider value={campaignId}>{children}</CampaignContext.Provider>;
}
