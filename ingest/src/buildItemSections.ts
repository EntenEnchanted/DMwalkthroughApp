export interface ItemSection {
  title: string;
  type: "item";
  chapter: string;
  headingPath: string[];
  dm_only_text: string;
  read_aloud_text: "";
  reveals: [];
  creature_references: [];
}

export function buildItemSections(itemNames: string[]): ItemSection[] {
  return itemNames.map((name) => ({
    title: name,
    type: "item" as const,
    chapter: "Appendix A: Magic Items",
    headingPath: ["Item Descriptions"],
    dm_only_text: `No mechanical description available in source material for "${name}" — needs manual entry.`,
    read_aloud_text: "" as const,
    reveals: [] as const,
    creature_references: [] as const,
  }));
}
