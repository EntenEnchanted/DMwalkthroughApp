import type { Reveal, SectionDetail } from "../types";
import { renderDmText } from "../dmText";
import { hasBlocks } from "../sectionCounts";
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

/**
 * A section's content, in the order a room is actually run. Shared by the
 * Campaign detail pane and by SectionCard, so search results and the stat block
 * popup render the same way rather than falling back to a wall of prose.
 *
 * Sections from a module that has not been through the block classifier render
 * through the original inline-markup path instead.
 */
export function SectionBody({
  section,
  reveals,
  runMode,
  onToggle,
}: {
  section: SectionDetail;
  reveals: Reveal[];
  runMode: boolean;
  onToggle: (revealId: number, next: boolean) => void;
}) {
  const readAlouds = section.read_alouds ?? [];
  const conditionals = section.conditionals ?? [];

  if (!hasBlocks(section)) {
    return (
      <>
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
        <ChecksBlock items={reveals} runMode={runMode} onToggle={onToggle} />
      </>
    );
  }

  return (
    <>
      <SceneBlock items={readAlouds.filter((r) => r.source === "authored")} />
      <ReadAloudBlock items={readAlouds.filter((r) => r.source === "book")} />
      <PromptsBlock items={section.prompts ?? []} />
      <ConditionalsBlock items={conditionals} kind="trigger" />
      <ConditionalsBlock items={conditionals} kind="branch" />
      {/* Variants are resolved once, before play — the prep strip carries them. */}
      <ChecksBlock items={reveals} runMode={runMode} onToggle={onToggle} />
      <FeaturesBlock items={section.features ?? []} />
      <TechniqueBlock items={section.technique ?? []} />
      <BackgroundBlock text={section.background_text ?? ""} />
    </>
  );
}
