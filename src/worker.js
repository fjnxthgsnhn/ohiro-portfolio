// 問い合わせフォームの受け口。/api/* 以外は静的ファイル（ASSETS）に任せる。
const TOPICS = ["映像制作のご依頼", "取材・コラボのご相談", "その他"];
const LIMITS = { name: 100, email: 254, message: 5000 };
const MAX_PER_HOUR = 5; // 同じ IP から 1 時間に受け付ける件数

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") return json({ ok: false, error: "method" }, 405);
      return handleContact(request, env, ctx);
    }
    if (url.pathname.startsWith("/api/")) return json({ ok: false, error: "not_found" }, 404);
    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env, ctx) {
  // 別サイトからの送信を拒否
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ ok: false, error: "origin" }, 403);

  let data;
  try {
    const ct = request.headers.get("content-type") || "";
    data = ct.includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }

  // ボット対策のおとり欄。人間には見えないので、埋まっていたら成功を装って捨てる
  if (String(data.website || "").trim()) return json({ ok: true });

  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim();
  const message = String(data.message || "").trim();
  const topic = TOPICS.includes(data.topic) ? data.topic : "その他";

  if (!name || !email || !message) return json({ ok: false, error: "required" }, 400);
  if (name.length > LIMITS.name || email.length > LIMITS.email || message.length > LIMITS.message)
    return json({ ok: false, error: "too_long" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "email" }, 400);

  const ip = request.headers.get("cf-connecting-ip") || "";
  const { n } = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM messages WHERE ip = ? AND created_at > datetime('now', '-1 hour')"
  ).bind(ip).first();
  if (n >= MAX_PER_HOUR) return json({ ok: false, error: "rate_limited" }, 429);

  const { meta } = await env.DB.prepare(
    "INSERT INTO messages (name, email, topic, message, ip) VALUES (?, ?, ?, ?, ?)"
  ).bind(name, email, topic, message, ip).run();

  // 保存できた時点で成功。Discord への通知は応答のあとで行う
  ctx.waitUntil(notifyDiscord(env, meta.last_row_id, { name, email, topic, message }));
  return json({ ok: true });
}

async function notifyDiscord(env, id, m) {
  if (!env.DISCORD_WEBHOOK_URL) return;
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  const res = await fetch(env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "ポートフォリオ問い合わせ",
      allowed_mentions: { parse: [] }, // 本文中の @everyone などを無効化
      embeds: [{
        title: `#${id} ${m.topic}`,
        color: 0xff4f8b,
        description: cut(m.message, 4000),
        fields: [
          { name: "お名前", value: cut(m.name, 1024), inline: true },
          { name: "メール", value: cut(m.email, 1024), inline: true },
        ],
        timestamp: new Date().toISOString(),
      }],
    }),
  });
  if (res.ok) await env.DB.prepare("UPDATE messages SET notified = 1 WHERE id = ?").bind(id).run();
  else console.error("discord webhook failed", res.status, await res.text());
}
