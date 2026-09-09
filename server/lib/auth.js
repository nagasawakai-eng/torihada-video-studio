const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || 'torihada.co.jp';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7日

// SESSION_SECRET未設定時はプロセス起動ごとにランダム生成（再起動でログインし直しになる）
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  console.warn('[auth] SESSION_SECRETが未設定です。再起動のたびに全員ログインし直しが必要になります。.envに固定値を設定してください。');
  return crypto.randomBytes(32).toString('hex');
})();

const client = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

function isEnabled() {
  return !!GOOGLE_CLIENT_ID;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(data) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
}

function createSessionCookie(payload) {
  const body = base64url(JSON.stringify({ ...payload, exp: Date.now() + SESSION_MAX_AGE_MS }));
  const sig = sign(body);
  return `${body}.${sig}`;
}

function verifySessionCookie(token) {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  if (sign(body) !== sig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// GoogleのIDトークンを検証し、社内ドメインのアカウントか確認する
async function verifyGoogleIdToken(idToken) {
  if (!client) throw new Error('GOOGLE_CLIENT_IDが設定されていません');
  const ticket = await client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload || !payload.email_verified) throw new Error('メールアドレスが未検証です');
  const emailDomain = (payload.email || '').split('@')[1] || '';
  if (payload.hd !== ALLOWED_DOMAIN && emailDomain !== ALLOWED_DOMAIN) {
    throw new Error(`${ALLOWED_DOMAIN} アカウントでログインしてください`);
  }
  return { email: payload.email, name: payload.name || payload.email };
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

const COOKIE_NAME = 'tvs_session';

function setSessionCookie(res, payload) {
  const token = createSessionCookie(payload);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
}

// 未ログインは /login へ、API呼び出しは401を返す
function requireAuth(req, res, next) {
  if (!isEnabled()) return next(); // GOOGLE_CLIENT_ID未設定なら認証なしで公開（従来動作）

  const openPaths = ['/login', '/auth/google', '/login.js', '/login.css'];
  if (openPaths.includes(req.path)) return next();

  const cookies = parseCookies(req);
  const session = verifySessionCookie(cookies[COOKIE_NAME]);
  if (session) {
    req.user = session;
    return next();
  }

  if (req.path.startsWith('/api/') || req.path.startsWith('/preview/')) {
    return res.status(401).json({ success: false, error: 'ログインが必要です' });
  }
  return res.redirect('/login');
}

module.exports = {
  isEnabled,
  GOOGLE_CLIENT_ID,
  ALLOWED_DOMAIN,
  verifyGoogleIdToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
};
