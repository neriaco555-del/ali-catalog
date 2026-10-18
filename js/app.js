/* ============================================================
   app.js — לוגיקת החנות
   ============================================================ */
(function () {
  "use strict";

  var CFG = window.CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var state = {
    products: [], filtered: [], cart: [], source: "loading", at: 0,
    q: "", cat: "all", sort: "default"
  };

  var CURRENCY = CFG.CURRENCY || "₪";
  var CURRENCY_BEFORE = !/^\$/.test(CURRENCY);
  var PLACEHOLDER = placeholderDataUri();

  /* ============ UTIL ============ */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtPrice(n) {
    if (n == null || !isFinite(n)) return "";
    var v = Math.round(n * 100) / 100;
    var s = v % 1 === 0 ? String(v) : v.toFixed(2);
    s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return CURRENCY_BEFORE ? CURRENCY + s : s + CURRENCY;
  }
  function placeholderDataUri() {
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#7c4dff'/><stop offset='1' stop-color='#ff2e93'/></linearGradient></defs><rect width='400' height='400' fill='#12121e'/><rect x='0' y='0' width='400' height='400' fill='url(%23g)' opacity='.35'/><text x='200' y='215' font-size='150' font-family='Arial' text-anchor='middle' fill='rgba(255,255,255,.5)'>?</text></svg>";
    return "data:image/svg+xml," + encodeURIComponent(svg).replace(/%253A/g, "%3A");
  }
  function relTime(ts) {
    if (!ts) return "—";
    var d = Math.floor((Date.now() - ts) / 1000);
    if (d < 60) return "לפני " + d + " שניות";
    if (d < 3600) return "לפני " + Math.floor(d / 60) + " דקות";
    if (d < 86400) return "לפני " + Math.floor(d / 3600) + " שעות";
    return "לפני " + Math.floor(d / 86400) + " ימים";
  }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return "אתר"; } }

  /* ============ TOASTS ============ */
  function toast(msg, kind) {
    var wrap = $("#toasts");
    var el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.innerHTML = "<span>" + esc(msg) + "</span>";
    wrap.appendChild(el);
    setTimeout(function () { el.classList.add("out"); setTimeout(function () { el.remove(); }, 350); }, 3200);
  }

  /* ============ DEMO DATA ============ */
  function demoProducts() {
    var names = [
      ["שעון חכם פרימיום · מסך AMOLED", 189, 349, "גאדג'טים", "שעון חכם עם חיישן דופק, מעקב שינה ו-120 מצבי ספורט. סוללה ל-7 ימים."],
      ["מטען מהיר 65W GaN", 79, 149, "אלקטרוניקה", "מטען קומפקטי עם 3 יציאות, טעינה מהירה לנייד, טאבלט ולפטופ jednocześnie."],
      ["אוזניות אלחוטיות ANC", 129, 299, "גאדג'טים", "ביטול רעשים אקטיבי, 30 שעות סוללה, עמידות למים IPX5."],
      ["מייבש כביסה מיני נייד", 99, 219, "לבית", "מייבש קומפקטי 5 ק״ג עם חיטוי UV — מושלם לדירות ומעונות."],
      ["מצלמת רשת 2K למחשב", 89, 169, "אלקטרוניקה", "רזולוציית 2K, מיקרופון מובנה, כיסוי פרטיות ותאורת לילה."],
      ["פנס ראש טקטי 1200 לומן", 69, 139, "ספורט וחוץ", "פנס ראש נטען, 4 מצבי תאורה, עמיד במים ובדROP."],
      ["שואב אבק רובוטי חכם", 549, 999, "לבית", "ניווט לייזר, שטיפה ושאיבה, שליטה מהאפליקציה."],
      ["פאוור בנק 20000mAh מ곡ש", 119, 259, "אלקטרוניקה", "טעינה כפולה 22.5W, צג דיגיטלי, 4 יציאות."],
      ["מחצלת פיקניק מתקפלת אטומה", 89, 159, "ספורט וחוץ", "מחצלת גדולה 200×200, אטומה למים, מתקפלת לתיק."]
    ];
    return names.map(function (n, i) {
      return {
        id: "d" + i, name: n[0], link: "https://www.aliexpress.com/",
        images: ["https://picsum.photos/seed/drop" + i + "/700/700"],
        image: "https://picsum.photos/seed/drop" + i + "/700/700",
        price: n[1], oldPrice: n[2], desc: n[4], category: n[3],
        badge: i === 0 ? "הנבחר" : (i === 6 ? "חדש" : ""), sku: "", demo: true
      };
    });
  }

  /* ============ LOAD ============ */
  function load(force) {
    var grid = $("#grid");
    if (force) { setBusy(true); }
    return window.Sheet.fetchProducts(CFG, force)
      .then(function (res) {
        state.products = res.products;
        state.source = res.source === "sheet" ? "sheet" : (res.source === "stale" ? "stale" : "cache");
        state.at = res.at || Date.now();
        if (!state.products.length && CFG.DEMO_WHEN_EMPTY) {
          state.products = demoProducts();
          state.source = "demo";
        }
        renderBanner();
        applyFilters();
        updateStats();
        stampUpdate();
        if (force) toast("הקטלוג רענן · " + state.products.length + " מוצרים", "ok");
      })
      .catch(function (err) {
        if (CFG.DEMO_WHEN_EMPTY && !state.products.length) {
          state.products = demoProducts();
          state.source = "demo";
          applyFilters();
          updateStats();
          toast("הגיליון לא זמין — מוצגים מוצרים להדגמה", "bad");
        } else {
          state.source = "error";
          renderBanner(err);
          toast("טעינת הקטלוג נכשלה", "bad");
        }
      })
      .then(function () { setBusy(false); grid.setAttribute("aria-busy", "false"); });
  }

  function setBusy(on) {
    $$(".chip-btn").forEach(function (b) { b.classList.toggle("busy", on); });
  }

  /* ============ FILTER / SORT ============ */
  function applyFilters() {
    var q = state.q.trim().toLowerCase();
    var list = state.products.filter(function (p) {
      if (state.cat !== "all" && (p.category || "ללא קטגוריה") !== state.cat) return false;
      if (!q) return true;
      return (p.name + " " + p.desc + " " + (p.category || "")).toLowerCase().indexOf(q) !== -1;
    });
    var s = state.sort;
    if (s === "price-asc") list.sort(function (a, b) { return (a.price == null ? 1e9 : a.price) - (b.price == null ? 1e9 : b.price); });
    else if (s === "price-desc") list.sort(function (a, b) { return (b.price == null ? -1 : b.price) - (a.price == null ? -1 : a.price); });
    else if (s === "name") list.sort(function (a, b) { return a.name.localeCompare(b.name, "he"); });
    else if (s === "new") list.reverse();
    state.filtered = list;
    renderGrid();
  }

  /* ============ RENDER: chips ============ */
  function renderChips() {
    var cats = {};
    state.products.forEach(function (p) {
      var c = (p.category || "").trim() || "ללא קטגוריה";
      cats[c] = (cats[c] || 0) + 1;
    });
    var keys = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; });
    var html = ['<button class="chip' + (state.cat === "all" ? " active" : "") + '" data-cat="all">הכול <small>(' + state.products.length + ')</small></button>'];
    keys.forEach(function (k) {
      html.push('<button class="chip' + (state.cat === k ? " active" : "") + '" data-cat="' + esc(k) + '">' + esc(k) + " <small>(" + cats[k] + ")</small></button>");
    });
    $("#chips").innerHTML = html.join("");
  }

  /* ============ RENDER: grid ============ */
  function badgeClass(b) {
    var t = String(b || "").toLowerCase();
    if (/חדש|new|חדש/.test(t)) return "new";
    if (/חם|hot|הנחת|מבצע|sale/.test(t)) return "hot";
    return "";
  }

  function renderGrid() {
    var grid = $("#grid");
    if (!state.filtered.length) {
      grid.innerHTML = "";
      $("#empty").hidden = false;
      return;
    }
    $("#empty").hidden = true;
    var html = state.filtered.map(cardHtml).join("");
    grid.innerHTML = html;
    observeReveals(grid);
    paintHeroImages();
  }

  function cardHtml(p) {
    var img = p.image || PLACEHOLDER;
    var hasLink = !!p.link;
    var off = p.oldPrice && p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    var badge = p.badge ? '<span class="badge ' + badgeClass(p.badge) + '">' + esc(p.badge) + "</span>" : "";
    var disc = off >= 5
      ? '<div class="disc" aria-hidden="true"><svg viewBox="0 0 100 100"><defs><path id="sp" d="M50,50 m-36,0 a36,36 0 1,1 72,0 a36,36 0 1,1 -72,0"/></defs><text><textPath href="#sp">SALE · SALE · SALE · SALE · </textPath></text></svg><b>-' + off + "%</b></div>"
      : "";
    var buy = '<button class="btn btn-acid" data-act="order">הזמנה בוואטסאפ</button>';
    var priceHtml = p.price != null
      ? '<span class="price">' + fmtPrice(p.price) + "</span>" +
        (p.oldPrice ? '<s class="old">' + fmtPrice(p.oldPrice) + "</s>" : "") +
        (off >= 5 ? '<span class="off">-' + off + "%</span>" : "")
      : '<span class="price">לפי האתר</span>';

    return '' +
      '<article class="card reveal" data-id="' + esc(p.id) + '">' +
        '<div class="card-media">' +
          '<img loading="lazy" decoding="async" src="' + esc(img) + '" alt="' + esc(p.name) + '" onerror="this.onerror=null;this.src=\'' + PLACEHOLDER + "\'\">" +
          badge + disc +
          '<div class="card-hover">' +
            "<button data-act=\"view\">מבט מהיר</button>" +
            '<button data-act="add">+ לסל</button>' +
          "</div>" +
        "</div>" +
        '<div class="card-body">' +
          (p.category ? '<span class="cat">' + esc(p.category) + "</span>" : "") +
          "<h3>" + esc(p.name) + "</h3>" +
          (p.desc ? '<p class="card-desc">' + esc(p.desc) + "</p>" : "") +
          '<div class="price-row">' + priceHtml + "</div>" +
          '<div class="card-actions">' + buy +
            '<button class="icon-btn" data-act="add" aria-label="הוספה לסל" title="הוספה לסל">' +
              '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>' +
            "</button>" +
            '<button class="icon-btn" data-act="share" aria-label="שיתוף מוצר" title="שיתוף">' +
              '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3m0 0L8 7m4-4 4 4"/></svg>' +
            "</button>" +
          "</div>" +
        "</div>" +
      "</article>";
  }

  function skeletons(n) {
    var html = "";
    for (var i = 0; i < (n || 8); i++) {
      html += '<div class="skel"><div class="sk-img"></div><div class="sk-line"></div><div class="sk-line s"></div></div>';
    }
    return html;
  }

  /* ============ HERO IMAGES ============ */
  function paintHeroImages() {
    var withImg = state.products.filter(function (p) { return p.image; });
    for (var i = 0; i < 3; i++) {
      var el = $("#hvImg" + (i + 1));
      if (el && withImg[i]) el.src = withImg[i].image;
    }
  }

  /* ============ BANNER ============ */
  function renderBanner(err) {
    var el = $("#banner");
    el.className = "banner";
    el.hidden = false;
    if (state.source === "demo") {
      el.classList.add("warn");
      el.innerHTML = '<b>מצב הדגמה.</b> מוצגים מוצרים להמחשה.';
    } else if (state.source === "error") {
      el.classList.add("err");
      el.innerHTML = '<b>אין חיבור כרגע.</b> נסו שוב בעוד כמה דקות. <button data-act="retry">ניסיון נוסף</button>';
    } else if (state.source === "stale" || state.source === "cache") {
      el.classList.add("info");
      el.innerHTML = "<b>מציג נתונים שמורים</b> מ" + relTime(state.at) + ".";
    } else {
      el.hidden = true;
    }
  }

  function updateStats() {
    var cats = {};
    state.products.forEach(function (p) { cats[(p.category || "x")] = 1; });
    animateCount($("#statProducts"), state.products.length);
    animateCount($("#statCats"), Object.keys(cats).length);
  }

  function animateCount(el, to) {
    if (!el) return;
    var from = parseInt(el.textContent, 10) || 0;
    if (from === to) { el.textContent = to; return; }
    var start = performance.now(), dur = 900;
    function step(now) {
      var t = Math.min(1, (now - start) / dur);
      t = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (to - from) * t);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function stampUpdate() {
    var el = $("#lastUpdate");
    if (el) el.textContent = state.source === "sheet" || state.source === "cache"
      ? "עודכן " + relTime(state.at) : "מצב הדגמה";
  }

  /* ============ CART ============ */
  function cartKey() { return "ds_cart_" + (CFG.SHEET_ID || "x"); }
  function saveCart() { try { localStorage.setItem(cartKey(), JSON.stringify(state.cart)); } catch (e) {} }
  function loadCart() {
    try {
      var raw = localStorage.getItem(cartKey());
      if (raw) state.cart = JSON.parse(raw) || [];
    } catch (e) { state.cart = []; }
  }
  function cartQty() { return state.cart.reduce(function (s, i) { return s + i.qty; }, 0); }
  function cartTotal() {
    return state.cart.reduce(function (s, i) {
      var p = find(i.id);
      return s + (p && p.price ? p.price * i.qty : 0);
    }, 0);
  }
  function find(id) {
    for (var i = 0; i < state.products.length; i++) if (state.products[i].id === id) return state.products[i];
    return null;
  }
  function addToCart(id) {
    var p = find(id);
    if (!p) return;
    var line = null;
    state.cart.forEach(function (i) { if (i.id === id) line = i; });
    if (line) line.qty++;
    else state.cart.push({ id: id, qty: 1 });
    saveCart();
    renderCart();
    var c = $("#cartCount");
    c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
    toast("נוסף לסל · " + p.name, "ok");
  }
  function setQty(id, qty) {
    state.cart = state.cart.filter(function (i) {
      if (i.id !== id) return true;
      i.qty = qty;
      return qty > 0;
    });
    saveCart();
    renderCart();
  }
  function renderCart() {
    var n = cartQty();
    $("#cartCount").textContent = n;
    $("#drawerCount").textContent = "(" + n + ")";
    $("#cartTotal").textContent = fmtPrice(cartTotal()) || fmtPrice(0);
    var body = $("#drawerBody");
    if (!state.cart.length) {
      body.innerHTML = '<div class="drawer-empty">הסל ריק.<br>מוסיפים מוצר מהקטלוג ↓</div>';
      return;
    }
    body.innerHTML = state.cart.map(function (line) {
      var p = find(line.id);
      if (!p) return "";
      return '<div class="ci" data-id="' + esc(p.id) + '">' +
        '<img src="' + esc(p.image || PLACEHOLDER) + '" alt="" onerror="this.onerror=null;this.src=\'' + PLACEHOLDER + "\'\">" +
        "<div><h4>" + esc(p.name) + '</h4><span class="ci-price">' + (p.price != null ? fmtPrice(p.price) : "—") + "</span>" +
        '<div class="qty"><button data-act="dec" aria-label="הפחתת כמות">−</button><span>' + line.qty + '</span><button data-act="inc" aria-label="הוספת כמות">+</button></div>' +
        '<button class="rm" data-act="rm">הסרה</button></div>' +
        "<b>" + (p.price != null ? fmtPrice(p.price * line.qty) : "—") + "</b>" +
      "</div>";
    }).join("");
  }

  function checkout() {
    if (!state.cart.length) { toast("הסל ריק", "bad"); return; }
    var lines = state.cart.map(function (line, i) {
      var p = find(line.id);
      if (!p) return "";
      return (i + 1) + ". " + p.name + " ×" + line.qty + (p.price != null ? " — " + fmtPrice(p.price * line.qty) : "");
    }).filter(Boolean);
    var msg = "🛒 *הזמנה חדשה — " + (CFG.STORE_NAME || "חנות") + "*\n\n" + lines.join("\n") +
      "\n\n*סה״כ:* " + fmtPrice(cartTotal()) + "\n\nנשלח מהקטלוג 🟡";
    var url = waUrl(msg);
    if (url) {
      window.open(url, "_blank", "noopener");
      toast("נפתחה שיחת וואטסאפ", "ok");
    } else {
      copyText(msg).then(function () {
        toast("ההזמנה הועתקה — הדביקו בוואטסאפ", "ok");
      });
    }
  }

  function waUrl(text) {
    var wa = String(CFG.WHATSAPP || "").replace(/[^\d]/g, "");
    return wa ? "https://wa.me/" + wa + "?text=" + encodeURIComponent(text) : null;
  }

  function orderProduct(id) {
    var p = find(id);
    if (!p) return;
    var msg = "🛒 *طلب חדש — " + (CFG.STORE_NAME || "חנות") + "*\n\n" +
      "מוצר: " + p.name + "\n" +
      (p.price != null ? "מחיר: " + fmtPrice(p.price) + "\n" : "") +
      "כמות: 1\n\nמקטלוג האתר";
    var url = waUrl(msg);
    if (url) { window.open(url, "_blank", "noopener"); toast("נפתחה שיחת וואטסאפ", "ok"); }
    else { copyText(msg).then(function () { toast("הפרטים הועתקו — הדביקו בוואטסאפ", "ok"); }); }
  }

  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
    return new Promise(function (res) {
      var ta = document.createElement("textarea");
      ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      ta.remove(); res();
    });
  }

  function shareLink(title, url) {
    url = url || location.href;
    if (navigator.share) {
      navigator.share({ title: title || CFG.STORE_NAME, url: url }).catch(function () {});
      return;
    }
    copyText(url).then(function () { toast("הקישור הועתק", "ok"); });
  }

  /* ============ MODAL ============ */
  var modalId = null;
  function openModal(id) {
    var p = find(id);
    if (!p) return;
    modalId = id;
    $("#mImg").src = p.image || PLACEHOLDER;
    $("#mImg").onerror = function () { this.onerror = null; this.src = PLACEHOLDER; };
    $("#mImg").alt = p.name;
    $("#mName").textContent = p.name;
    $("#mCat").textContent = p.category || "";
    $("#mDesc").textContent = p.desc || "אין תיאור למוצר הזה עדיין.";
    var badge = $("#mBadge");
    if (p.badge) { badge.textContent = p.badge; badge.hidden = false; } else badge.hidden = true;

    var off = p.oldPrice && p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    $("#mPriceRow").innerHTML = p.price != null
      ? '<span class="price">' + fmtPrice(p.price) + "</span>" +
        (p.oldPrice ? '<s class="old">' + fmtPrice(p.oldPrice) + "</s>" : "") +
        (off >= 5 ? '<span class="off">-' + off + "%</span>" : "")
      : '<span class="price">לפי האתר</span>';

    var buy = $("#mBuy");
    buy.href = waUrl("🛒 *طلب — " + (CFG.STORE_NAME || "חנות") + "*\n\nמוצר: " + p.name + (p.price != null ? "\nמחיר: " + fmtPrice(p.price) : "") + "\n\nמקטלוג האתר") || "#";
    buy.innerHTML = "הזמנה בוואטסאפ <span aria-hidden=\"true\">💬</span>";
    $("#mAdd").dataset.id = id;

    var thumbs = $("#mThumbs");
    thumbs.innerHTML = (p.images || []).map(function (u, i) {
      return '<img src="' + esc(u) + '" alt="" class="' + (i === 0 ? "on" : "") + '" data-u="' + esc(u) + '">';
    }).join("");

    showModal(true);
  }

  function showModal(on) {
    var m = $("#modal"), o = $("#overlay");
    if (on) {
      m.hidden = false; o.hidden = false;
      requestAnimationFrame(function () { m.classList.add("show"); o.classList.add("show"); });
      document.body.classList.add("locked");
      $("#closeModal").focus();
    } else {
      m.classList.remove("show");
      if (!$("#drawer").classList.contains("show")) { o.classList.remove("show"); document.body.classList.remove("locked"); }
      setTimeout(function () { m.hidden = true; if (!$("#drawer").classList.contains("show")) o.hidden = true; }, 300);
      modalId = null;
    }
  }

  /* ============ DRAWER ============ */
  function showDrawer(on) {
    var d = $("#drawer"), o = $("#overlay");
    if (on) {
      renderCart();
      d.hidden = false; o.hidden = false;
      requestAnimationFrame(function () { d.classList.add("show"); o.classList.add("show"); });
      document.body.classList.add("locked");
      $("#closeDrawer").focus();
    } else {
      d.classList.remove("show");
      if (!$("#modal").classList.contains("show")) { o.classList.remove("show"); document.body.classList.remove("locked"); }
      setTimeout(function () { d.hidden = true; if (!$("#modal").classList.contains("show")) o.hidden = true; }, 350);
    }
  }

  /* ============ REVIEWS ============ */
  function renderReviews() {
    var data = [
      ["העליתי 20 מוצרים ב-10 דקות והאתר פשוט עבד. האורחים שלי חשבו שיש לי חנות אמיתית.", "דנה כ.", "דרופשיפינג"],
      ["ההזמנה הולכת ישר לוואטסאפ שלי — בלי סל מסובך, בלי כאבי ראש.", "יובל ש.", "מוכר באלי"],
      ["אני משנה מחיר בגיליון מהנייד בשנייה, והקטלוג מתעדכן. פשוט.", "מעיין ל.", "סושיאל"],
      ["העיצוב מטורף, אבל מה שהכי חשוב — הכל באמת עובד מהגיליון.", "איתי ר.", "יזם"]
    ];
    var stars = "★★★★★";
    var cards = data.map(function (d) {
      return '<figure class="rev"><div class="rev-stars" aria-label="5 כוכבים">' + stars + "</div><p>״" + d[0] + "״</p><cite>— " + d[1] + " · " + d[2] + "</cite></figure>";
    }).join("");
    $("#revTrack").innerHTML = cards + cards;
  }

  /* ============ REVEAL / COUNTER OBSERVER ============ */
  var io = null;
  function observeReveals(root) {
    if (!("IntersectionObserver" in window)) {
      $$(".reveal", root || document).forEach(function (el) { el.classList.add("in"); });
      return;
    }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    }
    $$(".reveal", root || document).forEach(function (el) { if (!el.classList.contains("in")) io.observe(el); });
  }

  function initCounters() {
    var stats = $("#stats");
    if (!stats) return;
    if (!("IntersectionObserver" in window)) {
      $$("[data-count]", stats).forEach(function (el) {
        if (el.id) return;
        el.textContent = el.getAttribute("data-count");
      });
      return;
    }
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        $$("[data-count]", stats).forEach(function (el) {
          if (el.id) return;
          animateCount(el, parseInt(el.getAttribute("data-count"), 10) || 0);
        });
        cio.disconnect();
      });
    }, { threshold: 0.4 });
    cio.observe(stats);
  }

  /* ============ FX: cursor, magnet, tilt, floats ============ */
  function initFx() {
    var fine = window.matchMedia("(hover:hover) and (pointer:fine)").matches;
    if (fine) {
      var cur = $("#cursor"), ring = $("#cursorRing");
      var mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
      document.addEventListener("mousemove", function (e) {
        mx = e.clientX; my = e.clientY;
        cur.style.transform = "translate(" + (mx - 4) + "px," + (my - 4) + "px)";
        document.body.classList.add("cursor-on");
      }, { passive: true });
      document.addEventListener("mouseleave", function () { document.body.classList.remove("cursor-on"); });
      (function loop() {
        rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
        ring.style.transform = "translate(" + (rx - 18) + "px," + (ry - 18) + "px)";
        requestAnimationFrame(loop);
      })();
      var hotSel = "a,button,.card,input,select,summary,.chip";
      document.addEventListener("mouseover", function (e) {
        if (e.target.closest && e.target.closest(hotSel)) document.body.classList.add("cursor-hot");
      });
      document.addEventListener("mouseout", function (e) {
        if (e.target.closest && e.target.closest(hotSel)) document.body.classList.remove("cursor-hot");
      });

      /* magnetic buttons */
      $$("[data-magnet]").forEach(function (el) {
        el.addEventListener("mousemove", function (e) {
          var r = el.getBoundingClientRect();
          var x = e.clientX - r.left - r.width / 2;
          var y = e.clientY - r.top - r.height / 2;
          el.style.transform = "translate(" + x * 0.22 + "px," + y * 0.28 + "px)";
        });
        el.addEventListener("mouseleave", function () { el.style.transform = ""; });
      });

      /* hero parallax */
      var vis = $("#heroVis");
      if (vis) {
        document.addEventListener("mousemove", function (e) {
          var dx = (e.clientX / innerWidth - 0.5) * 2;
          var dy = (e.clientY / innerHeight - 0.5) * 2;
          $$(".hv-card", vis).forEach(function (c, i) {
            var f = (i + 1) * 7;
            c.style.transform = "translate(" + dx * f + "px," + dy * f + "px) rotate(" + (-9 + i * 8) + "deg)";
          });
        }, { passive: true });
      }
    }

    /* scroll fx */
    var nav = $("#nav"), bar = $("#scrollbar"), toTop = $("#toTop");
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY || document.documentElement.scrollTop;
        nav.classList.toggle("scrolled", y > 30);
        var h = document.documentElement.scrollHeight - innerHeight;
        bar.style.width = (h > 0 ? (y / h) * 100 : 0) + "%";
        toTop.classList.toggle("show", y > 600);
        ticking = false;
      });
    }
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    toTop.addEventListener("click", function () { scrollTo({ top: 0, behavior: "smooth" }); });
  }

  /* ============ TICKER duplication for seamless loop ============ */
  function initTicker() {
    $$(".ticker-track").forEach(function (t) {
      t.innerHTML = t.innerHTML + t.innerHTML;
    });
  }

  /* ============ PRELOADER ============ */
  function runPreloader() {
    var pre = $("#preloader"), num = $("#preNum"), bar = $("#preBar");
    if (!pre) return Promise.resolve();
    if (sessionStorage.getItem("ds_pre") === "1") {
      pre.classList.add("done");
      setTimeout(function () { pre.remove(); }, 400);
      return Promise.resolve();
    }
    return new Promise(function (res) {
      var start = performance.now(), dur = 1100;
      (function step(now) {
        var t = Math.min(1, (now - start) / dur);
        var v = Math.round(t * 100);
        num.textContent = v;
        bar.style.width = v + "%";
        if (t < 1) requestAnimationFrame(step);
        else {
          pre.classList.add("done");
          sessionStorage.setItem("ds_pre", "1");
          setTimeout(function () { pre.remove(); res(); }, 850);
        }
      })(start);
    });
  }

  /* ============ EVENTS ============ */
  function bind() {
    /* brand */
    var name = CFG.STORE_NAME || "הקטלוג";
    $("#brandName").textContent = name;
    $("#footName").textContent = name;
    $("#footName2").textContent = name;
    $("#footTag").textContent = CFG.TAGLINE || "";
    document.title = name + " — קטלוג חי";
    $("#year").textContent = new Date().getFullYear();

    /* whatsapp fab */
    var wa = String(CFG.WHATSAPP || "").replace(/[^\d]/g, "");
    if (wa) { var f = $("#waFab"); f.href = "https://wa.me/" + wa; f.hidden = false; }

    /* grid delegation */
    $("#grid").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]");
      var card = e.target.closest(".card");
      if (!card) return;
      var id = card.getAttribute("data-id");
      if (btn) {
        var act = btn.getAttribute("data-act");
        if (act === "add") addToCart(id);
        else if (act === "view") openModal(id);
        else if (act === "share") shareLink(CFG.STORE_NAME, location.href);
        else if (act === "order") orderProduct(id);
        return;
      }
      if (e.target.tagName === "IMG" || e.target.closest("h3")) openModal(id);
    });

    /* cart drawer items */
    $("#drawerBody").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]");
      var line = e.target.closest(".ci");
      if (!btn || !line) return;
      var id = line.getAttribute("data-id");
      var item = null;
      state.cart.forEach(function (i) { if (i.id === id) item = i; });
      if (!item) return;
      var act = btn.getAttribute("data-act");
      if (act === "inc") setQty(id, item.qty + 1);
      else if (act === "dec") setQty(id, item.qty - 1);
      else if (act === "rm") setQty(id, 0);
    });

    /* chips */
    $("#chips").addEventListener("click", function (e) {
      var c = e.target.closest(".chip");
      if (!c) return;
      state.cat = c.getAttribute("data-cat");
      renderChips();
      applyFilters();
    });

    /* search + sort */
    var deb;
    $("#search").addEventListener("input", function () {
      var v = this.value;
      clearTimeout(deb);
      deb = setTimeout(function () { state.q = v; applyFilters(); }, 180);
    });
    $("#sort").addEventListener("change", function () { state.sort = this.value; applyFilters(); });
    $("#resetFilters").addEventListener("click", function () {
      state.q = ""; state.cat = "all"; state.sort = "default";
      $("#search").value = ""; $("#sort").value = "default";
      renderChips(); applyFilters();
    });

    /* banner retry */
    $("#banner").addEventListener("click", function (e) {
      if (e.target.closest('[data-act="retry"]')) load(true);
    });

    /* refresh */
    function refresh() { load(true); }
    $("#refreshBtn").addEventListener("click", refresh);
    $("#refreshBtn2").addEventListener("click", refresh);

    /* drawer / modal open-close */
    $("#cartBtn").addEventListener("click", function () { showDrawer(true); });
    $("#closeDrawer").addEventListener("click", function () { showDrawer(false); });
    $("#closeModal").addEventListener("click", function () { showModal(false); });
    $("#overlay").addEventListener("click", function () { showDrawer(false); showModal(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { showDrawer(false); showModal(false); closeMnav(); }
    });

    /* modal actions */
    $("#mBuy").addEventListener("click", function (e) {
      if (this.getAttribute("aria-disabled") === "true") { e.preventDefault(); toast("למוצר הזה אין קישור שיתופי", "bad"); }
    });
    $("#mAdd").addEventListener("click", function () { addToCart(this.dataset.id); });
    $("#mShare").addEventListener("click", function () {
      var p = find(modalId);
      shareLink(CFG.STORE_NAME, location.href);
    });
    $("#mThumbs").addEventListener("click", function (e) {
      var img = e.target.closest("img");
      if (!img) return;
      $("#mImg").src = img.getAttribute("data-u");
      $$("#mThumbs img").forEach(function (i) { i.classList.remove("on"); });
      img.classList.add("on");
    });

    /* checkout + site share */
    $("#checkoutBtn").addEventListener("click", checkout);
    $("#shareSite").addEventListener("click", function () { shareLink(CFG.STORE_NAME, location.href); });

    /* mobile menu */
    var burger = $("#burger"), mnav = $("#mnav");
    burger.addEventListener("click", function () {
      var open = mnav.hidden;
      mnav.hidden = !open;
      burger.setAttribute("aria-expanded", String(open));
    });
    mnav.addEventListener("click", function (e) { if (e.target.tagName === "A") closeMnav(); });
    function closeMnav() { mnav.hidden = true; burger.setAttribute("aria-expanded", "false"); }

    /* sticky toolbar shadow on scroll (visual only) */
    window.addEventListener("resize", function () { /* keeps parallax sane */ }, { passive: true });
  }

  /* ============ BOOT ============ */
  function boot() {
    $("#grid").innerHTML = skeletons(8);
    renderChips();
    renderReviews();
    renderCart();
    bind();
    initFx();
    initTicker();
    initCounters();
    observeReveals(document);
    loadCart();

    var p = runPreloader();
    load(false);
    p.then(function () { observeReveals(document); });

    if (CFG.AUTO_REFRESH_MINUTES > 0) {
      setInterval(function () { load(true); }, CFG.AUTO_REFRESH_MINUTES * 60000);
    }
    setInterval(stampUpdate, 30000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
