/* =========================================================
   Tiered Sheet Pricing Engine — shared core math
   Used by both stickers and cards (any "rate ladder indexed by
   number of print sheets" product). Pure functions only.

   The piece-by-category cost model differs per product (e.g.
   stickers pick ink cost by CMYK/BW; cards bake ink into the
   category), so this engine takes a single pre-computed
   `costPerSheet` rather than trying to model every product's
   cost shape itself. Each product's own data file + a thin
   wrapper function computes costPerSheet, then calls into here.

   Usage (browser):
     <script src="tiered-sheet-pricing-engine.js"></script>
     TieredSheetEngine.calcTieredPrice({ quantity, unitsPerSheet, tiers, costPerSheet })
   ========================================================= */
(function (root) {

  function round2(n) { return Math.round(n * 100) / 100; }

  // tiers: [{ sheets, pricePerSheet }, ...] — any order, any length.
  // Returns the pricePerSheet of the highest tier whose `sheets`
  // threshold is <= sheetsNeeded (more volume -> cheaper tier).
  function findTierPrice(tiers, sheetsNeeded) {
    const sorted = [...tiers].sort((a, b) => a.sheets - b.sheets);
    let best = sorted[0];
    for (const t of sorted) {
      if (sheetsNeeded >= t.sheets) best = t;
      else break;
    }
    return best ? best.pricePerSheet : 0;
  }

  function calcTieredPrice({ quantity, unitsPerSheet, tiers, costPerSheet }) {
    if (!quantity || quantity <= 0) throw new Error('quantity ต้องมากกว่า 0');
    if (!unitsPerSheet || unitsPerSheet <= 0) throw new Error('unitsPerSheet ต้องมากกว่า 0');
    if (!tiers || tiers.length === 0) throw new Error('ไม่มีขั้นบันไดราคา (tiers)');

    const sheetsNeeded = Math.ceil(quantity / unitsPerSheet);
    const pricePerSheet = findTierPrice(tiers, sheetsNeeded);
    const totalPrice = round2(pricePerSheet * sheetsNeeded);
    const totalCost = round2((costPerSheet || 0) * sheetsNeeded);
    const profit = round2(totalPrice - totalCost);
    const marginPct = totalPrice > 0 ? round2((profit / totalPrice) * 100) : 0;
    const pricePerUnit = round2(totalPrice / quantity);

    return {
      quantity, unitsPerSheet, sheetsNeeded,
      pricePerSheet: round2(pricePerSheet),
      pricePerUnit, totalPrice, totalCost, profit, marginPct,
    };
  }

  const TieredSheetEngine = { round2, findTierPrice, calcTieredPrice };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TieredSheetEngine;
  }
  if (root) {
    root.TieredSheetEngine = TieredSheetEngine;
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
