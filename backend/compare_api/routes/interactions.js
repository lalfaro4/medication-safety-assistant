const express = require("express");
const router = express.Router();

const { fetchDrugLabel } = require("../services/openfdaService");
const { normalizeLabel } = require("../services/normalizeLabel");
const { interpretLabel } = require("../services/interpretLabel");

function normalizeName(name) {
  return (name || "").toLowerCase().trim();
}

function collectNames(normalizedLabel, originalQuery) {
  const names = new Set();

  if (originalQuery) names.add(originalQuery.trim());

  if (normalizedLabel?.drug?.brandName) {
    names.add(normalizedLabel.drug.brandName);
  }

  if (normalizedLabel?.drug?.genericName) {
    names.add(normalizedLabel.drug.genericName);
  }

  if (Array.isArray(normalizedLabel?.drug?.substanceNames)) {
    normalizedLabel.drug.substanceNames.forEach((name) => {
      if (name) names.add(name);
    });
  }

  return Array.from(names).filter(Boolean);
}

function textMentionsAnyName(textArray, namesToCheck) {
  if (!Array.isArray(textArray) || textArray.length === 0) return false;

  const combinedText = textArray.join(" ").toLowerCase();

  return namesToCheck.some((name) => {
    const cleaned = normalizeName(name);
    return cleaned && combinedText.includes(cleaned);
  });
}

function getDisplayName(queryName, normalizedLabel) {
  return (
    queryName?.trim() ||
    normalizedLabel?.drug?.brandName ||
    normalizedLabel?.drug?.genericName ||
    "This medication"
  );
}

function cleanEntry(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeEntries(entries, limit = 3) {
  const seen = new Set();
  const summary = [];

  for (const entry of entries || []) {
    const cleaned = cleanEntry(entry);

    if (!cleaned) continue;

    const isTruncated = cleaned.length > 220;
    const excerpt = isTruncated
      ? `${cleaned.slice(0, 217).trimEnd()}...`
      : cleaned;

    const key = excerpt.toLowerCase();

    if (seen.has(key)) continue;
    seen.add(key);
    summary.push({
      excerpt,
      fullText: cleaned,
      isTruncated
    });

    if (summary.length >= limit) break;
  }

  return summary;
}

function buildDrugSummary(drugQuery, normalizedLabel) {
  const sections = normalizedLabel?.sections || {};
  const warnings = [
    ...summarizeEntries(sections.boxedWarning, 1),
    ...summarizeEntries(sections.contraindications, 2),
    ...summarizeEntries(sections.warningsAndCautions, 2),
    ...summarizeEntries(sections.warnings, 2)
  ];

  const instructions = summarizeEntries([
    ...(sections.whenUsing || []),
    ...(sections.patientInformation || []),
    ...(sections.patientCounselingInformation || []),
    ...(sections.doNotUse || []),
    ...(sections.askDoctor || []),
    ...(sections.askDoctorOrPharmacist || []),
    ...(sections.stopUse || [])
  ], 4);

  const sideEffects = summarizeEntries(sections.adverseReactions, 3);

  return {
    drugQuery,
    displayName: getDisplayName(drugQuery, normalizedLabel),
    matchedLabel: normalizedLabel?.drug || {},
    meta: normalizedLabel?.meta || {},
    boxedWarning: summarizeEntries(sections.boxedWarning, 1),
    importantWarnings: warnings,
    importantInstructions: instructions,
    commonSideEffects: sideEffects,
    hasAnyInfo: warnings.length > 0 || instructions.length > 0 || sideEffects.length > 0
  };
}

function compareNormalizedLabels(drugAQuery, labelA, drugBQuery, labelB) {
  const namesA = collectNames(labelA, drugAQuery);
  const namesB = collectNames(labelB, drugBQuery);

  const displayNameA = getDisplayName(drugAQuery, labelA);
  const displayNameB = getDisplayName(drugBQuery, labelB);

  const sectionsA = labelA?.sections || {};
  const sectionsB = labelB?.sections || {};

  const aMentionsBInInteractions = textMentionsAnyName(
    sectionsA.drugInteractions || [],
    namesB
  );

  const bMentionsAInInteractions = textMentionsAnyName(
    sectionsB.drugInteractions || [],
    namesA
  );

  const aMentionsBInWarnings = textMentionsAnyName(
    sectionsA.warnings || [],
    namesB
  );

  const bMentionsAInWarnings = textMentionsAnyName(
    sectionsB.warnings || [],
    namesA
  );

  const aMentionsBInContraindications = textMentionsAnyName(
    sectionsA.contraindications || [],
    namesB
  );

  const bMentionsAInContraindications = textMentionsAnyName(
    sectionsB.contraindications || [],
    namesA
  );

  const possibleInteraction =
    aMentionsBInInteractions ||
    bMentionsAInInteractions ||
    aMentionsBInWarnings ||
    bMentionsAInWarnings ||
    aMentionsBInContraindications ||
    bMentionsAInContraindications;

  const evidence = {
    aMentionsBInInteractions,
    bMentionsAInInteractions,
    aMentionsBInWarnings,
    bMentionsAInWarnings,
    aMentionsBInContraindications,
    bMentionsAInContraindications
  };

  const summary = [];

  if (aMentionsBInInteractions) {
    summary.push(
      `${displayNameB} appears in the drug interactions section of ${displayNameA}'s label.`
    );
  }

  if (bMentionsAInInteractions) {
    summary.push(
      `${displayNameA} appears in the drug interactions section of ${displayNameB}'s label.`
    );
  }

  if (aMentionsBInWarnings) {
    summary.push(
      `${displayNameB} appears in the warnings section of ${displayNameA}'s label.`
    );
  }

  if (bMentionsAInWarnings) {
    summary.push(
      `${displayNameA} appears in the warnings section of ${displayNameB}'s label.`
    );
  }

  if (aMentionsBInContraindications) {
    summary.push(
      `${displayNameB} appears in the contraindications section of ${displayNameA}'s label.`
    );
  }

  if (bMentionsAInContraindications) {
    summary.push(
      `${displayNameA} appears in the contraindications section of ${displayNameB}'s label.`
    );
  }

  if (summary.length === 0) {
    summary.push(
      "No direct interaction-related mentions were found in the fetched label sections."
    );
  }

  return {
    drugA: drugAQuery,
    drugB: drugBQuery,
    possibleInteraction,
    evidence,
    summary
  };
}

// GET /api/label-interactions?drug=ibuprofen
router.get("/label-interactions", async (req, res) => {
  try {
    const drug = req.query.drug;

    if (!drug || !drug.trim()) {
      return res.status(400).json({
        error: "Missing drug query parameter."
      });
    }

    const rawLabel = await fetchDrugLabel(drug.trim());

    if (!rawLabel) {
      return res.status(404).json({
        error: `No label found for drug: ${drug}`
      });
    }

    const normalized = normalizeLabel(rawLabel);
    const interpretation = interpretLabel(normalized);

    return res.json({
      drugQuery: drug,
      matchedLabel: normalized.drug,
      meta: normalized.meta,
      interactionEvidence: normalized.sections,
      interpretation
    });
  } catch (error) {
    console.error("Interaction route error:", error);
    return res.status(500).json({
      error: "Server error while fetching label interactions."
    });
  }
});

router.get("/drug-summary", async (req, res) => {
  try {
    const drug = req.query.drug;

    if (!drug || !drug.trim()) {
      return res.status(400).json({
        error: "Missing drug query parameter."
      });
    }

    const rawLabel = await fetchDrugLabel(drug.trim());

    if (!rawLabel) {
      return res.status(404).json({
        error: `No label found for drug: ${drug}`
      });
    }

    const normalized = normalizeLabel(rawLabel);

    return res.json({
      summary: buildDrugSummary(drug.trim(), normalized)
    });
  } catch (error) {
    console.error("Drug summary route error:", error);
    return res.status(500).json({
      error: "Server error while fetching drug summary."
    });
  }
});

// GET /api/compare-drugs?drugA=ibuprofen&drugB=warfarin
router.get("/compare-drugs", async (req, res) => {
  try {
    const drugA = req.query.drugA;
    const drugB = req.query.drugB;

    if (!drugA || !drugA.trim() || !drugB || !drugB.trim()) {
      return res.status(400).json({
        error: "Both drugA and drugB query parameters are required."
      });
    }

    const [rawLabelA, rawLabelB] = await Promise.all([
      fetchDrugLabel(drugA.trim()),
      fetchDrugLabel(drugB.trim())
    ]);

    if (!rawLabelA) {
      return res.status(404).json({
        error: `No label found for drugA: ${drugA}`
      });
    }

    if (!rawLabelB) {
      return res.status(404).json({
        error: `No label found for drugB: ${drugB}`
      });
    }

    const normalizedA = normalizeLabel(rawLabelA);
    const normalizedB = normalizeLabel(rawLabelB);

    const interpretationA = interpretLabel(normalizedA);
    const interpretationB = interpretLabel(normalizedB);

    const comparison = compareNormalizedLabels(
      drugA.trim(),
      normalizedA,
      drugB.trim(),
      normalizedB
    );

    return res.json({
      comparison,
      drugADetails: {
        drugQuery: drugA,
        matchedLabel: normalizedA.drug,
        meta: normalizedA.meta,
        interactionEvidence: normalizedA.sections,
        interpretation: interpretationA
      },
      drugBDetails: {
        drugQuery: drugB,
        matchedLabel: normalizedB.drug,
        meta: normalizedB.meta,
        interactionEvidence: normalizedB.sections,
        interpretation: interpretationB
      }
    });
  } catch (error) {
    console.error("Compare drugs route error:", error);
    return res.status(500).json({
      error: "Server error while comparing drugs."
    });
  }
});

module.exports = router;
