/* =========================================================
   Material price rate data — KEN Digital Print
   Normalized: materials and techniques live in their own master
   tables (edit once, every category referencing them updates).
   Categories hold no cost numbers directly — only references.

   This file holds DATA ONLY (no calculation logic). The math
   lives in tiered-sheet-pricing-engine.js.

   Schema:
   {
     inkCostPerSheet: { [printMode]: number },
       // shared across every category — the printing machine's
       // ink cost per sheet doesn't depend on material/technique,
       // only on print mode (e.g. CMYK vs BW).

     groups: [string, ...],
       // product-line labels for organizing the editor and the
       // calculator's preset dropdown (e.g. "สติ๊กเกอร์", "กระดาษ").
       // A group can exist here with zero categories yet — useful
       // for planning a product line before adding its first rate.

     materials: [
       { id: string, name: string, costPerSheet: number }, ...
     ],

     techniques: [
       { id: string, name: string, costPerSheet: number }, ...
       // id "none" with costPerSheet 0 represents "no technique".
     ],

     categories: [
       {
         group: string,        // must match one entry in `groups`
         material: string,     // must match a `materials[].id`
         finish: string,       // must match a `techniques[].id`
         name: string,          // human-readable label (calculator
                                 // preset dropdown option text)
         passMultiplier: number,
           // how many print/technique passes this category needs —
           // 1 for single-sided (all stickers, 1-side cards), 2 for
           // double-sided cards. Scales BOTH ink cost and technique
           // cost (a 2-side card needs ink AND lamination on both
           // sides).
         unitsPerSheet: number | undefined,
           // number     -> fixed pieces-per-sheet (card size IS the
           //               category, so this is constant)
           // undefined  -> varies per order (e.g. stickers depend on
           //               the customer's design size)
         tiers: [ { sheets: number, pricePerSheet: number }, ... ]
           // rate ladder indexed by number of print sheets, sorted
           // ascending by `sheets`. Any number of tiers is fine.
       }
     ]
   }

   costPerSheet for a category = materials[material].costPerSheet
     + techniques[finish].costPerSheet * passMultiplier
     + inkCostPerSheet[printMode] * passMultiplier

   Add or remove materials, techniques, groups, or categories
   freely — calculators should read these lists dynamically
   rather than hardcoding options.
   ========================================================= */
(function (root) {

  const MaterialPriceRate = {
    inkCostPerSheet: { CMYK: 2.5, BW: 0.3 },

    groups: ["สติ๊กเกอร์", "กระดาษ", "โบรชัวร์", "แผ่นพับ"],

    materials: [
      { id: "pp", name: "สติ๊กเกอร์ PP เฉลี่ยขนาด 13x19''", costPerSheet: 5.3 },
      { id: "paper", name: "สติ๊กเกอร์กระดาษ เฉลี่ยขนาด 13x19''", costPerSheet: 3.5 },
      { id: "artcard300", name: "อาร์ตการ์ด 300 แกรม", costPerSheet: 2.6 },
    ],

    techniques: [
      { id: "none", name: "ไม่เคลือบ / ไม่มีเทคนิคเพิ่ม", costPerSheet: 0 },
      { id: "cold_laminate", name: "เคลือบเย็น เงา/ด้าน", costPerSheet: 1.76 },
      { id: "hotlam", name: "เคลือบร้อน เงา/ด้าน", costPerSheet: 2.92 },
    ],

    categories: [
      /* ---- สติ๊กเกอร์ (unitsPerSheet varies per order -> omitted) ---- */
      {
        id: "pp_none",
        group: "สติ๊กเกอร์",
        material: "pp",
        finish: "none",
        name: "สติ๊กเกอร์ PP — ไม่เคลือบ",
        passMultiplier: 1,
        tiers: [
          { sheets: 6, pricePerSheet: 40 },
          { sheets: 60, pricePerSheet: 35 },
          { sheets: 120, pricePerSheet: 30 },
          { sheets: 300, pricePerSheet: 28 },
          { sheets: 420, pricePerSheet: 25 },
          { sheets: 600, pricePerSheet: 21.666667 },
          { sheets: 1200, pricePerSheet: 18.333333 },
          { sheets: 2400, pricePerSheet: 16.666667 },
        ],
      },
      {
        id: "pp_cold_laminate",
        group: "สติ๊กเกอร์",
        material: "pp",
        finish: "cold_laminate",
        name: "สติ๊กเกอร์ PP — เคลือบเย็น",
        passMultiplier: 1,
        tiers: [
          { sheets: 6, pricePerSheet: 50 },
          { sheets: 60, pricePerSheet: 45 },
          { sheets: 120, pricePerSheet: 38.333333 },
          { sheets: 300, pricePerSheet: 36.666667 },
          { sheets: 420, pricePerSheet: 33.333333 },
          { sheets: 600, pricePerSheet: 30 },
          { sheets: 1200, pricePerSheet: 26.666667 },
        ],
      },
      {
        id: "paper_none",
        group: "สติ๊กเกอร์",
        material: "paper",
        finish: "none",
        name: "สติ๊กเกอร์กระดาษ — ไม่เคลือบ",
        passMultiplier: 1,
        tiers: [
          { sheets: 6, pricePerSheet: 38.333333 },
          { sheets: 60, pricePerSheet: 33.333333 },
          { sheets: 120, pricePerSheet: 28.333333 },
          { sheets: 300, pricePerSheet: 26.333333 },
          { sheets: 420, pricePerSheet: 23.333333 },
          { sheets: 600, pricePerSheet: 20 },
          { sheets: 1200, pricePerSheet: 18.333333 },
        ],
      },
      {
        id: "paper_cold_laminate",
        group: "สติ๊กเกอร์",
        material: "paper",
        finish: "cold_laminate",
        name: "สติ๊กเกอร์กระดาษ — เคลือบเย็น",
        passMultiplier: 1,
        tiers: [
          { sheets: 6, pricePerSheet: 48.333333 },
          { sheets: 60, pricePerSheet: 43.333333 },
          { sheets: 120, pricePerSheet: 36.666667 },
          { sheets: 300, pricePerSheet: 35 },
          { sheets: 420, pricePerSheet: 31.666667 },
          { sheets: 600, pricePerSheet: 28.333333 },
          { sheets: 1200, pricePerSheet: 25 },
        ],
      },

      /* ---- กระดาษ / การ์ด (fixed unitsPerSheet: card size = category) ---- */
      {
        id: "artcard300_1side_none",
        group: "กระดาษ",
        material: "artcard300",
        finish: "none",
        name: "อาร์ตการ์ด 300 แกรม พิมพ์ 1 หน้า — ไม่เคลือบ",
        passMultiplier: 1,
        unitsPerSheet: 30,
        tiers: [
          { sheets: 4, pricePerSheet: 37.5 },
          { sheets: 20, pricePerSheet: 30 },
          { sheets: 40, pricePerSheet: 25 },
          { sheets: 80, pricePerSheet: 22.5 },
          { sheets: 200, pricePerSheet: 18 },
          { sheets: 400, pricePerSheet: 15 },
          { sheets: 625, pricePerSheet: 14 },
          { sheets: 2000, pricePerSheet: 12 },
        ],
      },
      {
        id: "artcard300_2side_none",
        group: "กระดาษ",
        material: "artcard300",
        finish: "none",
        name: "อาร์ตการ์ด 300 แกรม พิมพ์ 2 หน้า — ไม่เคลือบ",
        passMultiplier: 2,
        unitsPerSheet: 30,
        tiers: [
          { sheets: 4, pricePerSheet: 62.5 },
          { sheets: 20, pricePerSheet: 45 },
          { sheets: 40, pricePerSheet: 37.5 },
          { sheets: 80, pricePerSheet: 32.5 },
          { sheets: 200, pricePerSheet: 27.5 },
          { sheets: 400, pricePerSheet: 24 },
          { sheets: 600, pricePerSheet: 22 },
          { sheets: 1000, pricePerSheet: 20 },
        ],
      },
      {
        id: "artcard300_1side_hotlam",
        group: "กระดาษ",
        material: "artcard300",
        finish: "hotlam",
        name: "อาร์ตการ์ด 300 แกรม พิมพ์ 1 หน้า — เคลือบร้อน เงา/ด้าน",
        passMultiplier: 1,
        unitsPerSheet: 30,
        tiers: [
          { sheets: 4, pricePerSheet: 47.5 },
          { sheets: 20, pricePerSheet: 40 },
          { sheets: 40, pricePerSheet: 35 },
          { sheets: 80, pricePerSheet: 32.5 },
          { sheets: 200, pricePerSheet: 27 },
          { sheets: 400, pricePerSheet: 24 },
          { sheets: 625, pricePerSheet: 22 },
        ],
      },
      {
        id: "artcard300_2side_hotlam",
        group: "กระดาษ",
        material: "artcard300",
        finish: "hotlam",
        name: "อาร์ตการ์ด 300 แกรม พิมพ์ 2 หน้า — เคลือบร้อน เงา/ด้าน",
        passMultiplier: 2,
        unitsPerSheet: 30,
        tiers: [
          { sheets: 4, pricePerSheet: 77.5 },
          { sheets: 20, pricePerSheet: 65 },
          { sheets: 40, pricePerSheet: 52.5 },
          { sheets: 80, pricePerSheet: 45 },
          { sheets: 200, pricePerSheet: 41 },
          { sheets: 500, pricePerSheet: 35 },
        ],
      },
    ],
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MaterialPriceRate;
  }
  if (root) {
    root.MaterialPriceRate = MaterialPriceRate;
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
