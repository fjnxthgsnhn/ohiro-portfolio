(() => {
  const P = window.PROFILE, W = window.WORKS, X = window.X_PICKS || [];
  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "style") n.style.cssText = v;
      else n.setAttribute(k, v);
    }
    for (const k of kids) n.append(k);
    return n;
  };

  // プロフィール
  $("#name").textContent = P.name;
  $("#role").textContent = `${P.roleJa} / ${P.roleEn}`;
  $("#message").textContent = P.message;
  $("#lead").textContent = P.lead;
  for (const l of P.links.filter((l) => l.url)) {
    $("#links").append(el("a", { class: "btn", href: l.url, target: "_blank", rel: "noopener" }, l.label));
  }
  $("#year").textContent = new Date().getFullYear();

  // 動きを減らす設定の人にはヒーロー動画を止めて静止画（poster）にする
  const hv = $("#hero-video");
  if (hv && matchMedia("(prefers-reduced-motion: reduce)").matches) {
    hv.removeAttribute("autoplay");
    hv.pause();
  }

  // 問い合わせフォーム（送信先が未設定のあいだは仮表示）
  const form = $("#contact-form");
  const note = $("#form-note");
  const btn = form.querySelector("button");
  if (P.contactAction) {
    form.action = P.contactAction;
    const errors = {
      rate_limited: "短時間に送信が続いたため受け付けられませんでした。しばらくしてからお試しください。",
      email: "メールアドレスの形式をご確認ください。",
      too_long: "入力が長すぎます。内容を短くしてお試しください。",
    };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      btn.disabled = true;
      note.textContent = "送信しています…";
      try {
        const res = await fetch(form.action, { method: "POST", body: new FormData(form) });
        const r = await res.json().catch(() => ({}));
        if (res.ok && r.ok) {
          form.reset();
          note.textContent = "送信しました。お問い合わせありがとうございます。内容を確認のうえご連絡します。";
          return;
        }
        note.textContent = errors[r.error] || "送信できませんでした。時間をおいて再度お試しいただくか、X の DM からご連絡ください。";
      } catch {
        note.textContent = "通信エラーで送信できませんでした。時間をおいて再度お試しください。";
      }
      btn.disabled = false;
    });
  } else {
    btn.disabled = true;
    note.textContent = "※ 現在フォームは準備中です。お急ぎの方は X の DM からご連絡ください。";
    form.addEventListener("submit", (e) => e.preventDefault());
  }

  // クリックしてから iframe を読み込む軽量 YouTube プレイヤー
  const player = (id, title, vertical) => {
    const box = el("button", {
      class: "yt" + (vertical ? " yt-v" : ""),
      type: "button",
      "aria-label": `${title} を再生`,
    });
    // サムネイルは thumbs/<動画ID>.jpg。無ければ YouTube の標準サムネイルを使う
    const img = el("img", { src: `thumbs/${id}.jpg`, alt: "", loading: "lazy", decoding: "async" });
    img.onerror = () => { img.onerror = null; img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`; };
    box.append(img, el("span", { class: "play", "aria-hidden": "true" }));
    box.addEventListener("click", () => {
      const wrap = el("div", { class: box.className });
      wrap.append(el("iframe", {
        src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
        title,
        allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
        allowfullscreen: "",
      }));
      box.replaceWith(wrap);
    }, { once: true });
    return box;
  };

  // 作品
  const tools = new Set();
  W.forEach((w, i) => {
    const card = el("article", { class: "work", id: w.id, style: `--accent:${w.accent}` });
    const head = el("div", { class: "work-head" },
      el("p", { class: "work-no" }, String(i + 1).padStart(2, "0")),
      el("div", {},
        el("p", { class: "work-kind" }, `${w.kind} ・ ${w.year}`),
        el("h3", { class: "work-title" }, w.title)));

    // 自作アプリ: 画像＋機能一覧（「使っている道具」には映像の道具だけを集める）
    if (w.app) {
      const a = w.app;
      // 紹介動画（サイト内で再生。読み込みは再生を押してから）
      const mainCol = el("div", { class: "work-main" },
        el("video", { class: "app-video", src: a.video, poster: a.poster, controls: "", preload: "none", playsinline: "" }),
        el("p", { class: "cap" }, a.caption, el("span", {}, a.duration || "")));
      const info = el("div", { class: "work-info" },
        el("p", { class: "synopsis" }, w.synopsis),
        el("ul", { class: "tags" }, ...w.tools.map((t) => el("li", {}, t))),
        el("div", { class: "more-links" },
          ...(w.links || []).map((l) => el("a", { class: "more", href: l.url, target: "_blank", rel: "noopener" }, l.label))));
      // 画面写真（クリックで原寸）
      const shot = el("figure", { class: "app-fig" },
        el("a", { class: "app-shot", href: a.image, target: "_blank", rel: "noopener" },
          el("img", { src: a.image, alt: `${w.title} の画面`, loading: "lazy" })),
        el("figcaption", { class: "cap" }, a.imageCaption));
      const feats = el("ul", { class: "features" },
        ...a.features.map((f) => el("li", {}, el("h4", {}, f.title), el("p", {}, f.text))));
      card.append(head, el("div", { class: "work-body" }, mainCol, info),
        el("p", { class: "shorts-label" }, "Features"), el("div", { class: "app-detail" }, feats, shot));
      $("#works-list").append(card);
      return;
    }

    w.tools.forEach((t) => tools.add(t));
    const mainCol = el("div", { class: "work-main" },
      player(w.main.id, `${w.title} ${w.main.title}`, false),
      el("p", { class: "cap" }, `${w.main.title}`, el("span", {}, w.main.duration)));
    const info = el("div", { class: "work-info" },
      el("p", { class: "synopsis" }, w.synopsis),
      el("ul", { class: "tags" }, ...w.tools.map((t) => el("li", {}, t))),
      el("div", { class: "more-links" },
        el("a", { class: "more", href: `https://www.youtube.com/watch?v=${w.main.id}`, target: "_blank", rel: "noopener" }, "YouTube で見る →"),
        ...(w.links || []).map((l) => el("a", { class: "more", href: l.url, target: "_blank", rel: "noopener" }, l.label))));
    const shorts = el("div", { class: "shorts" },
      ...w.shorts.map((s) => el("figure", { class: "short" },
        player(s.id, s.title, true),
        el("figcaption", {}, s.title))));
    card.append(head, el("div", { class: "work-body" }, mainCol, info),
      el("p", { class: "shorts-label" }, "Shorts"), shorts);
    $("#works-list").append(card);
  });
  $("#all-tools").append(...[...tools].map((t) => el("li", {}, t)));

  // X ピックアップ（公式の埋め込みスクリプトで表示）
  if (X.length) {
    $("#xpicks").hidden = false;
    $("#nav-x").hidden = false;
    for (const p of X) {
      const bq = el("blockquote", { class: "twitter-tweet", "data-media-max-width": "560", "data-theme": "dark" },
        el("a", { href: p.url.replace("x.com", "twitter.com") }, p.title || p.url));
      $("#xgrid").append(el("div", { class: "xitem" }, bq));
    }
    document.body.append(el("script", { src: "https://platform.twitter.com/widgets.js", async: "" }));
  }
})();
