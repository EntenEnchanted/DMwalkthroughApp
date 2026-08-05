import { useState } from "react";
import type { SectionDetail } from "../types";
import { toggleReveal } from "../api";
import { useCampaignId } from "../CampaignContext";
import { usePopup } from "../PopupContext";
import { sectionCounts, variantApplies } from "../sectionCounts";
import { SectionBody } from "./SectionBody";

function PrepStrip({ section, partyLevel }: { section: SectionDetail; partyLevel: number | null }) {
  const c = sectionCounts(section);
  const parts: string[] = [];
  if (c.readAlouds) parts.push(`${c.readAlouds} read-aloud${c.readAlouds > 1 ? "s" : ""}`);
  if (c.checks) parts.push(`${c.checks} check${c.checks > 1 ? "s" : ""}`);
  if (c.prompts) parts.push(`${c.prompts} prompt${c.prompts > 1 ? "s" : ""}`);
  if (c.triggers) parts.push(`${c.triggers} trigger${c.triggers > 1 ? "s" : ""}`);
  if (c.branches) parts.push(`${c.branches} branch${c.branches > 1 ? "es" : ""}`);
  if (section.references.length) parts.push(`${section.references.length} creatures`);

  const allVariants = (section.conditionals ?? []).filter((v) => v.kind === "variant");
  const variants = allVariants.filter((v) => variantApplies(v.condition, partyLevel));
  const hidden = allVariants.length - variants.length;

  if (parts.length === 0 && variants.length === 0 && hidden === 0) return null;

  return (
    <div className="prep-strip">
      {parts.length > 0 && <p className="prep-counts">{parts.join(" · ")}</p>}
      {variants.map((v) => (
        <p key={v.ordinal} className="prep-variant">
          <strong>{v.condition}</strong> → {v.effect}
        </p>
      ))}
      {hidden > 0 && (
        <p className="prep-hidden-note">
          {hidden} variant{hidden > 1 ? "s" : ""} for another party level hidden
        </p>
      )}
    </div>
  );
}

export function SectionDetailView({
  section,
  runMode,
  partyLevel,
}: {
  section: SectionDetail;
  runMode: boolean;
  partyLevel: number | null;
}) {
  const campaignId = useCampaignId();
  const { openSection } = usePopup();
  const [reveals, setReveals] = useState(section.reveals);

  async function handleToggle(revealId: number, next: boolean) {
    setReveals((prev) => prev.map((r) => (r.id === revealId ? { ...r, revealed: next } : r)));
    await toggleReveal(campaignId, revealId, next);
  }

  return (
    <article className="section-detail">
      <header className="section-detail-header">
        <p className="section-detail-path">{section.heading_path.join(" › ")}</p>
        <h2>
          <span className="type-badge">{section.type}</span>
          {section.heading}
        </h2>
      </header>

      <PrepStrip section={section} partyLevel={partyLevel} />

      <SectionBody section={section} reveals={reveals} runMode={runMode} onToggle={handleToggle} />

      {section.references.length > 0 && (
        <section className="block block-refs">
          <h4 className="block-label">Creatures here</h4>
          <div className="ref-chip-row">
            {section.references.map((ref) => (
              <button key={ref.id} className="ref-chip" onClick={() => openSection(ref.id)}>
                {ref.heading}
              </button>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
