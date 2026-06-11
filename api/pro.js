// api/pro.js - 全功能后端：支付Webhook + 激活验证
// Vercel KV 存储，需在 Vercel Dashboard → Storage → 创建 KV Database

export default async function handler(req, res) {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  async function kvSet(key, value) {
    await fetch(`${KV}/set/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      body: JSON.stringify({ value })
    });
  }
  async function kvGet(key) {
    const r = await fetch(`${KV}/get/${key}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.result ? JSON.parse(j.result) : null;
  }

  // POST: 面包多 Webhook
  if (req.method === 'POST') {
    const { type, data } = req.body || {};
    if (type !== 'charge_succeeded') return res.json({ ok: true, msg: 'ignored' });

    const { out_trade_no, amount } = data;
    // 生成激活码：PRO + 订单号后6位
    const code = 'PRO' + out_trade_no.slice(-6).toUpperCase();
    const now = Date.now();
    const expireAt = now + 30 * 24 * 3600 * 1000; // 30天后到期

    await kvSet(`code:${code}`, JSON.stringify({
      orderId: out_trade_no,
      amount,
      createdAt: now,
      expireAt,
      activated: false
    }));

    console.log(`✅ 新订单 ${out_trade_no} → 激活码 ${code} → 到期 ${new Date(expireAt).toISOString()}`);
    return res.json({ ok: true, code });
  }

  // GET: 激活验证
  const code = req.query.code;
  if (!code) return res.json({ ok: false, msg: '请提供激活码' });

  const data = await kvGet(`code:${code}`);
  if (!data) return res.json({ ok: false, msg: '激活码无效' });
  if (Date.now() > data.expireAt) return res.json({ ok: false, msg: '已过期' });

  // 标记已激活
  data.activated = true;
  await kvSet(`code:${code}`, JSON.stringify(data));

  return res.json({
    ok: true,
    expireAt: data.expireAt,
    daysLeft: Math.ceil((data.expireAt - Date.now()) / 86400000)
  });
}
