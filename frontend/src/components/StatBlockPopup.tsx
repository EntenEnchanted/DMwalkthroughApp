import { useEffect, useState } from "react";
import { getNarrativeReferences, getSection } from "../api";
import type { CreatureStatBlock, NarrativeReference, SectionDetail } from "../types";
import { DmOnlyText } from "../dmText";

export function StatBlockPopup({ sectionId, onClose }: { sectionId: string; onClose: () => void }) {
  const [section, setSection] = useState<SectionDetail | null>(null);
  const [narrative, setNarrative] = useState<NarrativeReference[]>([]);
  const [tab, setTab] = useState<"stats" | "narrative">("stats");

  useEffect(() => {
    setSection(null);
    setNarrative([]);
    setTab("stats");
    getSection(sectionId).then(setSection);
    getNarrativeReferences(sectionId).then(setNarrative);
  }, [sectionId]);

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-panel" onClick={(e) => e.stopPropagation()}>
        <button className="popup-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {!section && <div className="empty-state">Loading…</div>}
        {section && (
          <>
            <div className="section-card-title">{section.heading}</div>

            {narrative.length > 0 && (
              <div className="popup-tabs">
                <button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}>
                  Stat Block
                </button>
                <button className={tab === "narrative" ? "active" : ""} onClick={() => setTab("narrative")}>
                  Narrative
                </button>
              </div>
            )}

            {tab === "stats" &&
              (section.stat_block ? (
                <StatBlockView stats={section.stat_block} />
              ) : (
                <div className="tier-block dm-only">
                  {section.dm_only_text ? <DmOnlyText text={section.dm_only_text} /> : "No details available."}
                </div>
              ))}

            {tab === "narrative" && (
              <div>
                {narrative.map((n) => (
                  <div key={n.id} className="stat-block-section">
                    <h4>
                      {n.heading} — {n.chapter}
                    </h4>
                    {n.read_aloud_text && <div className="tier-block read-aloud">{n.read_aloud_text}</div>}
                    {n.dm_only_text && (
                      <div className="tier-block dm-only">
                        <DmOnlyText text={n.dm_only_text} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatBlockView({ stats }: { stats: CreatureStatBlock }) {
  const speed = Object.entries(stats.speed)
    .map(([k, v]) => `${k} ${v} ft.`)
    .join(", ");
  const abilities = Object.entries(stats.abilities)
    .map(([k, v]) => `${k.toUpperCase()} ${v.score} (${v.mod >= 0 ? "+" : ""}${v.mod})`)
    .join("  ·  ");
  const skills = Object.entries(stats.skills)
    .map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`)
    .join(", ");

  return (
    <div>
      <p className="stat-line">
        {stats.size} {stats.type}, {stats.alignment}
      </p>
      <p className="stat-line">
        <b>AC</b> {stats.ac} &nbsp; <b>HP</b> {stats.hp_avg} ({stats.hp_formula}) &nbsp; <b>Speed</b> {speed}
      </p>
      <p className="stat-line">{abilities}</p>
      {skills && (
        <p className="stat-line">
          <b>Skills</b> {skills}
        </p>
      )}
      {!!stats.vulnerabilities?.length && (
        <p className="stat-line">
          <b>Vulnerabilities</b> {stats.vulnerabilities.join(", ")}
        </p>
      )}
      {!!stats.resistances?.length && (
        <p className="stat-line">
          <b>Resistances</b> {stats.resistances.join(", ")}
        </p>
      )}
      {!!stats.immunities?.length && (
        <p className="stat-line">
          <b>Immunities</b> {stats.immunities.join(", ")}
        </p>
      )}
      <p className="stat-line">
        <b>Senses</b> {stats.senses}
      </p>
      <p className="stat-line">
        <b>Languages</b> {stats.languages}
      </p>
      <p className="stat-line">
        <b>Challenge</b> {stats.cr} (XP {stats.xp})
      </p>

      {stats.traits.length > 0 && (
        <div className="stat-block-section">
          <h4>Traits</h4>
          {stats.traits.map((t) => (
            <p className="stat-line" key={t.name}>
              <b>{t.name}.</b> {t.text}
            </p>
          ))}
        </div>
      )}

      <div className="stat-block-section">
        <h4>Actions</h4>
        {stats.actions.map((a) => (
          <p className="stat-line" key={a.name}>
            <b>{a.name}.</b> {a.text}
          </p>
        ))}
      </div>

      {!!stats.bonus_actions?.length && (
        <div className="stat-block-section">
          <h4>Bonus Actions</h4>
          {stats.bonus_actions.map((a) => (
            <p className="stat-line" key={a.name}>
              <b>{a.name}.</b> {a.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
