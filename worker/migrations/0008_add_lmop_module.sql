-- Migration number: 0008 	 2026-08-02T20:50:42.264Z
-- Registers Lost Mine of Phandelver as a selectable module now that its
-- 300 sections (287 narrative + 13 magic items) are fully ingested and
-- reviewed — deliberately not added earlier so a DM could never create a
-- campaign against a partially-loaded module.
INSERT INTO modules (id, slug, name, description)
VALUES ('lmop', 'lmop', 'Lost Mine of Phandelver', 'A starting adventure for 1st- to 5th-level characters.');
