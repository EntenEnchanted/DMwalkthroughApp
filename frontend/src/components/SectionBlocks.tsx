import type { Conditional, Feature, Prompt, ReadAloud, Reveal, Technique } from "../types";

/**
 * The typed content blocks of a section, in the order a room is actually run.
 *
 * Colour lives on each block's label and left border, never on the body text:
 * once content is structurally separated, the structure carries the meaning and
 * colour only needs to be a quiet accent. The loud inline highlighting this
 * replaces existed because everything used to be one undifferentiated paragraph.
 */

function BlockShell({
  tone,
  label,
  count,
  children,
}: {
  tone: string;
  label: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className={`block block-${tone}`}>
      <h4 className="block-label">
        {label}
        {count !== undefined && count > 1 && <span className="block-count">{count}</span>}
      </h4>
      {children}
    </section>
  );
}

/** Authored scene-setting. Never the book's words — marked so it can't be mistaken for them. */
export function SceneBlock({ items }: { items: ReadAloud[] }) {
  if (items.length === 0) return null;
  return (
    <BlockShell tone="scene" label="Scene" count={items.length}>
      {items.map((r) => (
        <div key={r.ordinal} className="block-entry">
          {r.cue && <p className="block-cue">{r.cue}</p>}
          <p className="read-aloud-text">{r.text}</p>
        </div>
      ))}
      <p className="block-footnote">Written for this app — not from the adventure text.</p>
    </BlockShell>
  );
}

/** The adventure's own boxed text, read verbatim. */
export function ReadAloudBlock({ items }: { items: ReadAloud[] }) {
  if (items.length === 0) return null;
  return (
    <BlockShell tone="read-aloud" label="Read aloud" count={items.length}>
      {items.map((r) => (
        <div key={r.ordinal} className="block-entry">
          {r.cue && <p className="block-cue">{r.cue}</p>}
          <p className="read-aloud-text">{r.text}</p>
        </div>
      ))}
    </BlockShell>
  );
}

/** Things to ask the players, or get them to do. Strictly player-facing. */
export function PromptsBlock({ items }: { items: Prompt[] }) {
  if (items.length === 0) return null;
  return (
    <BlockShell tone="prompt" label="Ask / do" count={items.length}>
      <ul className="block-list">
        {items.map((p) => (
          <li key={p.ordinal}>{p.text}</li>
        ))}
      </ul>
    </BlockShell>
  );
}

const CONDITIONAL_LABELS: Record<Conditional["kind"], { label: string; hint: string }> = {
  trigger: { label: "If… then", hint: "Fires from something the party does here" },
  branch: { label: "Depends on", hint: "Depends on what happened before this scene" },
  variant: { label: "Party variants", hint: "Resolve these before the session" },
};

export function ConditionalsBlock({ items, kind }: { items: Conditional[]; kind: Conditional["kind"] }) {
  const matching = items.filter((c) => c.kind === kind);
  if (matching.length === 0) return null;
  const { label, hint } = CONDITIONAL_LABELS[kind];
  return (
    <BlockShell tone={`cond-${kind}`} label={label} count={matching.length}>
      <p className="block-hint">{hint}</p>
      <ul className="cond-list">
        {matching.map((c) => (
          <li key={c.ordinal}>
            <span className="cond-condition">{c.condition}</span>
            <span className="cond-arrow" aria-hidden="true">
              →
            </span>
            <span className="cond-effect">{c.effect}</span>
          </li>
        ))}
      </ul>
    </BlockShell>
  );
}

/**
 * Skill checks. A null `dc` means no roll is needed at all — asking an NPC,
 * casting a spell, or simply examining something.
 *
 * In prep mode every outcome is visible, because prepping means reading
 * everything. In run mode results stay hidden until toggled, which is the
 * original point of the reveal system.
 */
export function ChecksBlock({
  items,
  runMode,
  onToggle,
}: {
  items: Reveal[];
  runMode: boolean;
  onToggle: (revealId: number, next: boolean) => void;
}) {
  if (items.length === 0) return null;
  return (
    <BlockShell tone="check" label="Checks" count={items.length}>
      {items.map((c) => {
        const skills = c.skills ?? [];
        const hidden = runMode && !c.revealed;
        return (
          <div key={c.id} className={`check ${c.revealed ? "revealed" : ""}`}>
            <div className="check-head">
              {c.context && <span className="check-context">{c.context}</span>}
              <span className="check-roll">
                {c.dc === null || c.dc === undefined ? (
                  <span className="check-noroll">No roll needed</span>
                ) : (
                  <>
                    {c.passive ? "Passive " : ""}DC {c.dc}
                  </>
                )}
                {skills.length > 0 && <> · {skills.join(" or ")}</>}
              </span>
              {c.cost && <span className="check-cost">{c.cost}</span>}
            </div>
            {hidden ? (
              <button className="check-unlock" onClick={() => onToggle(c.id, true)}>
                Reveal outcome
              </button>
            ) : (
              <>
                <p className="check-success">{c.text}</p>
                {c.fail_text && <p className="check-fail">On a failure: {c.fail_text}</p>}
                {runMode && (
                  <button className="check-unlock" onClick={() => onToggle(c.id, false)}>
                    Hide again
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </BlockShell>
  );
}

/** Standing rules for the area: no trigger, no roll to discover. */
export function FeaturesBlock({ items }: { items: Feature[] }) {
  if (items.length === 0) return null;
  return (
    <BlockShell tone="feature" label="Always on" count={items.length}>
      {items.map((f) => (
        <div key={f.ordinal} className="block-entry">
          <p className="named-entry-title">{f.name}</p>
          <p>{f.text}</p>
        </div>
      ))}
    </BlockShell>
  );
}

/** How to perform the scene. Tells you nothing about the world. */
export function TechniqueBlock({ items }: { items: Technique[] }) {
  if (items.length === 0) return null;
  return (
    <BlockShell tone="technique" label="How to run it" count={items.length}>
      {items.map((t) => (
        <div key={t.ordinal} className="block-entry">
          <p className="named-entry-title">{t.name}</p>
          <p>{t.text}</p>
        </div>
      ))}
    </BlockShell>
  );
}

export function BackgroundBlock({ text }: { text: string }) {
  if (!text) return null;
  return (
    <BlockShell tone="background" label="Background">
      {text.split("\n\n").map((para, i) => (
        <p key={i}>{para}</p>
      ))}
    </BlockShell>
  );
}
