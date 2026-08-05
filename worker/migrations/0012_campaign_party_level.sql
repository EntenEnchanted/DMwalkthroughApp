-- Migration number: 0012 	 2026-08-05T04:05:00.000Z
-- Party level, so the Campaign page can resolve level-scaling variants.
--
-- This belongs on the campaign rather than being a global app setting: DoSI runs
-- levels 1-2 and LMoP runs 1-5, so two campaigns on the same account can sit at
-- different levels, and two campaigns on the same module can too.
--
-- NULL means "not set" — the prep strip then shows every variant rather than
-- guessing, which is the safe default for campaigns created before this existed.
ALTER TABLE campaigns ADD COLUMN party_level INTEGER;
