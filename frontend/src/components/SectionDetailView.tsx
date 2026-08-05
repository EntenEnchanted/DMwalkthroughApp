import { useState } from "react";
import type { SectionDetail } from "../types";
import { toggleReveal } from "../api";
import { useCampaignId } from "../CampaignContext";
import { usePopup } from "../PopupContext";
import { renderDmText } from "../dmText";
import { hasBlocks, sectionCounts } from "../sectionCounts";
import {
  BackgroundBlock,
  ChecksBlock,
  ConditionalsBlock,
  FeaturesBlock,
  PromptsBlock,
  ReadAloudBlock,
  SceneBlock,
  TechniqueBlock,
} from "./SectionBlocks";

function PrepStrip({ section }: { section: SectionDetail }) {
  const c = sectionCounts(section);
  const parts: string[] = [];
  if (c.readAlouds) parts.push(`${c.readAlouds} read-aloud${c.readAlouds > 1 ? "s" : ""}`);
  if (c.checks) parts.push(`${c.checks} check${c.checks > 1 ? "s" : ""}`);
  if (c.prompts) parts.push(`${c.prompts} prompt${c.prompts > 1 ? "s" : ""}`);
  if (c.triggers) parts.push(`${c.triggers} trigger${c.triggers > 1 ? "s" : ""}`);
  if (c.branches) parts.push(`${c.branches} branch${c.branches > 1 ? "es" : ""}`);
  if (section.references.length) parts.push(`${section.references.length} creatures`);

  const variants = (section.conditionals ?? []).filter((v) => v.kind === "variant");

  if (parts.length === 0 && variants.length === 0) return null;

  return (
    <div className="prep-strip">
      {parts.length > 0 && <p className="prep-counts">{parts.join(" · ")}</p>}
      {variants.map((v) => (
        <p key={v.ordinal} className="prep-variant">
          <strong>{v.condition}</strong> → {v.effect}
        </p>
      ))}
    </div>
  );
}

export function SectionDetailView({
  section,
  runMode,
}: {
  section: SectionDetail;
  runMode: boolean;
}) {
  const campaignId = useCampaignId();
  const { openSection } = usePopup();
  const [reveals, setReveals] = useState(section.reveals);

  async function handleToggle(revealId: number, next: boolean) {
    setReveals((prev) => prev.map((r) => (r.id === revealId ? { ...r, revealed: next } : r)));
    await toggleReveal(campaignId, revealId, next);
  }

  const readAlouds = section.read_alouds ?? [];
  const conditionals = section.conditionals ?? [];
  const structured = hasBlocks(section);

  return (
    <article className="section-detail">
      <header className="section-detail-header">
        <p className="section-detail-path">{section.heading_path.join(" › ")}</p>
        <h2>
          <span className="type-badge">{section.type}</span>
          {section.heading}
        </h2>
      </header>

      <PrepStrip section={section} />

      {structured ? (
        <>
          {/* Ordered as a room is actually run. */}
          <SceneBlock items={readAlouds.filter((r) => r.source === "authored")} />
          <ReadAloudBlock items={readAlouds.filter((r) => r.source === "book")} />
          <PromptsBlock items={section.prompts ?? []} />
          <ConditionalsBlock items={conditionals} kind="trigger" />
          <ConditionalsBlock items={conditionals} kind="branch" />
          {/* Variants are resolved once, before play — the prep strip carries them. */}
          <ChecksBlock items={reveals} runMode={runMode} onToggle={handleToggle} />
          <FeaturesBlock items={section.features ?? []} />
          <TechniqueBlock items={section.technique ?? []} />
          <BackgroundBlock text={section.background_text ?? ""} />
        </>
      ) : (
        <>
          {/*
            Legacy path for modules not yet through the block classifier. Keeps
            LMoP fully usable while DoSI migrates first.
          */}
          {section.read_aloud_text && (
            <section className="block block-read-aloud">
              <h4 className="block-label">Read aloud</h4>
              <p className="read-aloud-text">{section.read_aloud_text}</p>
            </section>
          )}
          {section.dm_only_text && (
            <section className="block block-background">
              <h4 className="block-label">DM only</h4>
              <div className="legacy-dm-text">{renderDmText(section.dm_only_text)}</div>
            </section>
          )}
          <ChecksBlock items={reveals} runMode={runMode} onToggle={handleToggle} />
        </>
      )}

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
