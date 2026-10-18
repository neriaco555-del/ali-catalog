/* ============================================================
   sheet.js — קריאת הקטלוג מ-Google Sheets
   טוען את הגיליון כ-CSV, ממפה עמודות אוטומטית (עברית/אנגלית)
   וממיר שורות לאובייקטי מוצר. ללא תלויות.
   ============================================================ */
(function (global) {
  "use strict";

  var DEFAULTS = { name: 0, link: 1, image: 2, price: 3, desc: 4, category: 5, badge: 6, oldPrice: 7 };

  /* סדר החשובות: הכי ספציפי ראשון, כדי ש"קישור תמונה" לא ייתפס כלינק מוצר */
  var HEADER_RULES = [
    ["oldPrice", ["מקורי", "היה", "לפני הנחה", "הנחה ראשונית", "old price", "was", "original"]],
    ["image", ["תמונה", "תמונות", "image", "img", "picture", "photo", "gallery", "cover", "banner"]],
    ["link", ["קישור", "לינק", "link", "url", "http", "אתר", "חנות", "shop"]],
    ["price", ["מחיר", "price", "cost", "pay", "תשלום", "shekel", "ils", "usd"]],
    ["category", ["קטגוריה", "category", "סוג", "type", "קבוצה", "מחלקה", "department"]],
    ["badge", ["תג", "badge", "תיוג", "מבצע", "special", "sticker"]],
    ["desc", ["תיאור", "פרטים", "מאפיינים", "description", "desc", "details", "features", "הערה"]],
    ["sku", ["מק\"ט", "מק״ט", "sku", "id", "מזהה", "ברקוד", "barcode"]],
    ["name", ["שם", "כותרת", "מוצר", "פריט", "title", "name", "product", "item"]]
  ];

  function buildUrls(cfg) {
    var id = cfg.SHEET_ID, gid = cfg.GID || 0, name = cfg.SHEET_NAME || "";
    var qs = name ? "sheet=" + encodeURIComponent(name) : "gid=" + gid;
    var base = "https://docs.google.com/spreadsheets/d/" + id;
    return [
      base + "/export?format=csv&" + qs,
      base + "/export?format=csv",
      base + "/gviz/tq?tqx=out:csv&" + qs,
      base + "/pub?output=csv"
    ];
  }

  function detectDelimiter(line) {
    var c = (line.match(/,/g) || []).length;
    var s = (line.match(/;/g) || []).length;
    var t = (line.match(/\t/g) || []).length;
    if (t > c && t > s) return "\t";
    if (s > c) return ";";
    return ",";
  }

  /* CSV ריסולבר פשוט — תומך במרכאות, מרכאות כפולות ושורות חדשות בפנים */
  function parseCSV(text) {
    if (text == null) return [];
    text = String(text).replace(/^\uFEFF/, "");
    if (!text.trim()) return [];
    var rows = [], row = [], cur = "", inQ = false, i = 0, n = text.length;
    var d = detectDelimiter(text.split(/\r?\n/)[0]);
    while (i < n) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cur += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cur += ch; i++; continue;
      }
      if (ch === '"') { inQ = true; i++; continue; }
      if (ch === d) { row.push(cur); cur = ""; i++; continue; }
      if (ch === "\r") { i++; continue; }
      if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; i++; continue; }
      cur += ch; i++;
    }
    row.push(cur);
    if (row.length > 1 || row[0] !== "") rows.push(row);
    for (var r = 0; r < rows.length; r++) {
      for (var c2 = 0; c2 < rows[r].length; c2++) rows[r][c2] = rows[r][c2].trim();
    }
    return rows;
  }

  function matchHeader(cell) {
    var s = String(cell || "").toLowerCase().replace(/[_\-.]/g, " ").trim();
    if (!s) return null;
    for (var i = 0; i < HEADER_RULES.length; i++) {
      var field = HEADER_RULES[i][0], words = HEADER_RULES[i][1];
      for (var j = 0; j < words.length; j++) {
        if (s.indexOf(words[j].toLowerCase()) !== -1) return field;
      }
    }
    return null;
  }

  function looksLikeHeader(row) {
    var hits = 0;
    for (var i = 0; i < row.length; i++) {
      if (matchHeader(row[i])) hits++;
      else if (isUrl(row[i]) || isNumber(row[i])) return 0;
    }
    return hits;
  }

  function isUrl(v) {
    return /^(https?:\/\/|\/\/|www\.)\S+$/i.test(String(v || "")) ||
      /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(String(v || ""));
  }

  function isNumber(v) {
    return /^[\s$₪₪]*\d+([.,]\d+)?\s*[%₪$]?$/.test(String(v || ""));
  }

  function normalizeLink(v) {
    v = String(v || "").trim();
    if (!v || /^[-–—]+$/.test(v)) return "";
    if (/^https?:\/\//i.test(v)) return v;
    if (/^\/\//.test(v)) return "https:" + v;
    if (isUrl(v)) return "https://" + v.replace(/^www\./, "www.");
    return "";
  }

  function normalizeImages(v) {
    var raw = String(v || "").trim();
    if (!raw) return [];
    var parts = raw.split(/\s*\|\s*|\s*;\s*|\r?\n|\s+https?:\/\//);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = (i > 0 && parts[i] && !/^https?:\/\//i.test(parts[i])) ? "https://" + parts[i] : parts[i].trim();
      var u = normalizeLink(p);
      if (!u) continue;
      var m;
      if ((m = u.match(/drive\.google\.com\/file\/d\/([^/]+)/)) ||
          (m = u.match(/drive\.google\.com\/open\?id=([^&]+)/)) ||
          (m = u.match(/[?&]id=([^&]+)/))) {
        u = "https://drive.google.com/uc?export=view&id=" + m[1];
      }
      u = u.replace(/\/s_image\/|\/s_icn\//, "/").replace(/^http:\/\//, "https://");
      if (out.indexOf(u) === -1) out.push(u);
    }
    return out.slice(0, 6);
  }

  function parsePrice(v) {
    if (v == null || v === "") return null;
    var m = String(v).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    var n = parseFloat(m[0]);
    return isFinite(n) && n >= 0 ? n : null;
  }

  function mapRows(rows) {
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].some(function (c) { return c !== ""; })) { list = rows.slice(i); break; }
    }
    if (!list.length) return [];

    var map = null, start = 0;
    if (looksLikeHeader(list[0]) > 0) {
      map = {};
      var used = {};
      for (var c = 0; c < list[0].length; c++) {
        var f = matchHeader(list[0][c]);
        if (f && used[f]) continue;
        if (f) { map[f] = c; used[f] = true; }
      }
      start = 1;
    }

    function col(row, field) {
      var idx = (map && map[field] != null) ? map[field] : DEFAULTS[field];
      return idx != null && idx < row.length ? row[idx] : "";
    }

    var products = [], seen = {};
    for (var r = start; r < list.length; r++) {
      var row = list[r];
      if (!row.some(function (x) { return x !== ""; })) continue;

      var name = col(row, "name").replace(/\s+/g, " ").trim();
      var link = normalizeLink(col(row, "link"));
      var images = normalizeImages(col(row, "image"));
      var price = parsePrice(col(row, "price"));
      var oldPrice = parsePrice(col(row, "oldPrice"));

      if (!name) {
        if (link) name = "מוצר #" + (r + 1);
        else if (images.length) name = "מוצר #" + (r + 1);
        else continue;
      }
      if (oldPrice != null && price != null && oldPrice <= price) oldPrice = null;
      if (!price && !link && !images.length) continue;

      var key = name + "|" + link;
      if (seen[key]) continue;
      seen[key] = true;

      products.push({
        id: "p" + r,
        name: name,
        link: link,
        images: images,
        image: images[0] || "",
        price: price,
        oldPrice: oldPrice,
        desc: col(row, "desc").replace(/\s+/g, " ").trim(),
        category: col(row, "category").replace(/\s+/g, " ").trim(),
        badge: col(row, "badge").replace(/\s+/g, " ").trim(),
        sku: col(row, "sku").trim()
      });
    }
    return products;
  }

  function readCache(key) {
    try {
      var raw = global.localStorage && global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeCache(key, products) {
    try {
      global.localStorage && global.localStorage.setItem(key, JSON.stringify({ t: Date.now(), p: products }));
    } catch (e) {}
  }

  function cacheKey(cfg) {
    return "ds_cat_" + cfg.SHEET_ID + "_" + (cfg.SHEET_NAME || cfg.GID);
  }

  /* טוען מוצרים: רשת תחילה, קאש כגיבוי */
  function fetchProducts(cfg, force) {
    var urls = buildUrls(cfg), key = cacheKey(cfg);
    if (!force) {
      var c0 = readCache(key);
      if (c0 && c0.p && c0.p.length) {
        return Promise.resolve({ products: c0.p, source: "cache", at: c0.t, error: null });
      }
    }
    var idx = 0, lastErr = null;
    function tryNext() {
      if (idx >= urls.length) {
        var c = readCache(key);
        if (c && c.p && c.p.length) {
          return Promise.resolve({ products: c.p, source: "stale", at: c.t, error: lastErr });
        }
        return Promise.reject(lastErr || new Error("no-data"));
      }
      var url = urls[idx++];
      return fetch(url, { cache: force ? "no-store" : "default", redirect: "follow" })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.text();
        })
        .then(function (text) {
          if (!text || !text.trim()) throw new Error("empty");
          if (/^\s*</.test(text)) throw new Error("html");
          var products = mapRows(parseCSV(text));
          if (!products.length) throw new Error("no-rows");
          writeCache(key, products);
          return { products: products, source: "sheet", at: Date.now(), error: null };
        })
        .catch(function (err) {
          lastErr = err;
          return tryNext();
        });
    }
    return tryNext();
  }

  global.Sheet = {
    fetchProducts: fetchProducts,
    parseCSV: parseCSV,
    mapRows: mapRows,
    normalizeLink: normalizeLink,
    normalizeImages: normalizeImages,
    parsePrice: parsePrice,
    matchHeader: matchHeader,
    buildUrls: buildUrls,
    DEFAULTS: DEFAULTS,
    HEADER_RULES: HEADER_RULES
  };
})(typeof window !== "undefined" ? window : globalThis);
