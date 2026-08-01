/** Public https base for WhatsApp-clickable invite links */
export function getInvitePublicBase(): string {
  const raw =
    process.env.INVITE_PUBLIC_BASE ??
    process.env.PUBLIC_API_BASE ??
    "https://tugup-api.onrender.com";
  return raw.replace(/\/$/, "");
}

export const APP_SCHEME = "tug-of-war-mobile";

export function buildFriendInviteDeepLink(inviteId: string) {
  return `${APP_SCHEME}://invite/friend/${inviteId}`;
}

export function buildGameInviteDeepLink(inviteId: string) {
  return `${APP_SCHEME}://invite/game/${inviteId}`;
}

/** https URL shared in WhatsApp / SMS (clickable) */
export function buildFriendInviteShareUrl(inviteId: string) {
  return `${getInvitePublicBase()}/invite/friend/${inviteId}`;
}

export function buildGameInviteShareUrl(inviteId: string) {
  return `${getInvitePublicBase()}/invite/game/${inviteId}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Landing page: opens the app via custom scheme; WhatsApp needs https first */
export function inviteBridgeHtml(opts: {
  deepLink: string;
  title: string;
  subtitle: string;
  openLabel: string;
}) {
  const deep = escapeHtml(opts.deepLink);
  const title = escapeHtml(opts.title);
  const subtitle = escapeHtml(opts.subtitle);
  const openLabel = escapeHtml(opts.openLabel);
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="0;url=${deep}" />
  <title>${title}</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center}
    .card{max-width:360px}
    h1{font-size:1.5rem;margin:0 0 8px;color:#f8fafc}
    p{color:#94a3b8;line-height:1.5;margin:0 0 24px}
    a.btn{display:inline-block;background:#fbbf24;color:#0f172a;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:14px}
  </style>
  <script>
    (function () {
      var target = ${JSON.stringify(opts.deepLink)};
      window.location.href = target;
      setTimeout(function () { window.location.href = target; }, 400);
    })();
  </script>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${subtitle}</p>
    <a class="btn" href="${deep}">${openLabel}</a>
  </div>
</body>
</html>`;
}
