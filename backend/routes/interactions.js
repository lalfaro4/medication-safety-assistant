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

function compareNormalizedLabels(drugAQuery, labelA, drugBQuery, labelB) {
  const namesA = collectNames(labelA, drugAQuery);
  const namesB = collectNames(labelB, drugBQuery);

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

  if (aMentionsBInInteractions || bMentionsAInInteractions) {
    summary.push(
      "Possible interaction found in the drug_interactions section of one or both labels."
    );
  }

  if (aMentionsBInWarnings || bMentionsAInWarnings) {
    summary.push(
      "One drug name appears in the warnings section of the other drug's label."
    );
  }

  if (aMentionsBInContraindications || bMentionsAInContraindications) {
    summary.push(
      "One drug name appears in the contraindications section of the other drug's label."
    );
  }

  if (summary.length === 0) {
    summary.push(
      "No direct mention of either drug was found in the other drug's interaction-related label sections."
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
