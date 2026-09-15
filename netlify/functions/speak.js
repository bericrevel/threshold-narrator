const DEFAULT_VOICE = "onwK4e9ZLuTAKqWW03F9";
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors() };
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });
  let payload = {};
  try { payload = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Bad JSON" }); }
  const text = String(payload.text || "").slice(0, 4500).trim();
  if (!text) return json(400, { error: "No text" });
  const key = String(payload.key || process.env.ELEVENLABS_API_KEY || "").trim();
  if (!key) return json(400, { error: "Missing ElevenLabs API key" });
  const voice = String(payload.voice || DEFAULT_VOICE).replace(/[^a-zA-Z0-9]/g, "") || DEFAULT_VOICE;
  const res = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + voice, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true }
    })
  });
  if (!res.ok) return json(res.status, { error: (await res.text()).slice(0, 400) });
  const buf = Buffer.from(await res.arrayBuffer());
  return { statusCode: 200, headers: { ...cors(), "Content-Type": "audio/mpeg" }, body: buf.toString("base64"), isBase64Encoded: true };
};
function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
}
function json(statusCode, obj) {
  return { statusCode, headers: { ...cors(), "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
