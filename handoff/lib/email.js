const EMAIL_RE = /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/;
const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com']);

// The prospect's company domain, or null for gmail-style addresses.
function businessDomain(email) {
  const domain = email.split('@')[1].toLowerCase();
  return FREE_MAIL.has(domain) ? null : domain;
}

function companyFromEmail(email) {
  const domain = businessDomain(email);
  if (!domain) return null;
  const root = domain.split('.').slice(-2)[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}

module.exports = { EMAIL_RE, businessDomain, companyFromEmail };
