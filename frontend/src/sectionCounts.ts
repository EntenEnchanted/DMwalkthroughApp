import type { SectionDetail } from "./types";

/**
 * True once a section has been through the block classifier. Modules ingested
 * before the block model (LMoP's 300 sections today) have none, and fall back
 * to the original inline-markup rendering rather than showing an empty page.
 */
export function hasBlocks(s: SectionDetail): boolean {
  return (
    (s.read_alouds?.length ?? 0) > 0 ||
    (s.background_text?.length ?? 0) > 0 ||
    (s.prompts?.length ?? 0) > 0 ||
    (s.technique?.length ?? 0) > 0 ||
    (s.conditionals?.length ?? 0) > 0 ||
    (s.features?.length ?? 0) > 0
  );
}

/** Counts shown on outline rows and in the prep strip. */
export function sectionCounts(s: SectionDetail) {
  const conditionals = s.conditionals ?? [];
  return {
    readAlouds: (s.read_alouds ?? []).filter((r) => r.source === "book").length,
    scene: (s.read_alouds ?? []).filter((r) => r.source === "authored").length,
    prompts: (s.prompts ?? []).length,
    triggers: conditionals.filter((c) => c.kind === "trigger").length,
    branches: conditionals.filter((c) => c.kind === "branch").length,
    variants: conditionals.filter((c) => c.kind === "variant").length,
    checks: s.reveals.length,
    features: (s.features ?? []).length,
    technique: (s.technique ?? []).length,
  };
}
