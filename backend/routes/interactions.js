const express = require("express");
const { fetchDrugLabel } = require("../services/openfdaService");
const { normalizeLabel } = require("../services/normalizeLabel");
const { interpretLabel } = require("../services/interpretLabel");

const router = express.Router();

router.get("/label-interactions", async (req, res) => {
  try {
    const drug = req.query.drug;

    if (!drug) {
      return res.status(400).json({ error: "Missing drug query parameter." });
    }

    const rawLabel = await fetchDrugLabel(drug);

    if (!rawLabel) {
      return res.status(404).json({
        error: `No label found for drug: ${drug}`,
      });
    }

    const normalized = normalizeLabel(rawLabel);
    const interpretation = interpretLabel(normalized);

    return res.json({
      drugQuery: drug,
      matchedLabel: normalized?.drug ?? null,
      meta: normalized?.meta ?? null,
      interactionEvidence: normalized?.sections ?? null,
      interpretation,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Failed to fetch interaction-related label data.",
      detail: err.message,
    });
  }
});

module.exports = router;
