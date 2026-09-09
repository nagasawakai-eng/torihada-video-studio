function getApiKey() {
  return process.env.FISHAUDIO_API_KEY || '';
}

async function listVoices() {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('FISHAUDIO_API_KEY が設定されていません');
  const r = await fetch('https://api.fish.audio/model?self=true&page_size=100', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) throw new Error(`Fish Audio API HTTP ${r.status}`);
  const data = await r.json();
  return (data.items || []).map(v => ({ id: v._id || v.id, title: v.title || v.name || v._id }));
}

// テキストを音声化してBufferを返す
async function synthesize(text, { voiceId, speed = 1.0 } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('FISHAUDIO_API_KEY が設定されていません');
  const r = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      reference_id: voiceId || null,
      format: 'mp3',
      mp3_bitrate: 128,
      normalize: true,
      latency: 'normal',
      prosody: speed && speed !== 1 ? { speed } : undefined,
    }),
  });
  if (!r.ok) throw new Error(`TTS HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

module.exports = { listVoices, synthesize, getApiKey };
