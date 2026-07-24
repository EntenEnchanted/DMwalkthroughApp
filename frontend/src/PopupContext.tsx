import { createContext, useContext, useState, type ReactNode } from "react";
import { StatBlockPopup } from "./components/StatBlockPopup";

interface PopupContextValue {
  openSection: (id: string) => void;
}

const PopupContext = createContext<PopupContextValue | null>(null);

export function usePopup(): PopupContextValue {
  const ctx = useContext(PopupContext);
  if (!ctx) throw new Error("usePopup must be used within PopupProvider");
  return ctx;
}

export function PopupProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <PopupContext.Provider value={{ openSection: setOpenId }}>
      {children}
      {openId && <StatBlockPopup sectionId={openId} onClose={() => setOpenId(null)} />}
    </PopupContext.Provider>
  );
}
