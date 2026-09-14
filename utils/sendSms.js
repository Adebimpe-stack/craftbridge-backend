/**
 * Provider-agnostic SMS sender.
 *
 * Configure with SMS_PROVIDER ("twilio" | "termii"). When it is unset or the
 * provider credentials are missing, sending is a no-op so the rest of the
 * notification flow keeps working.
 *
 * Twilio: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 * Termii: TERMII_API_KEY, TERMII_SENDER_ID
 * Optional: SMS_DEFAULT_COUNTRY_CODE (e.g. "+234") for local-format numbers.
 */

const DEFAULT_COUNTRY_CODE = process.env.SMS_DEFAULT_COUNTRY_CODE || "+234";

/**
 * Normalise a stored phone number to E.164.
 * Returns null when the number cannot be made valid.
 */
function normalisePhone(raw) {
  if (!raw) return null;

  const trimmed = String(raw).trim();
  const hasPlus = trimmed.startsWith("+") || trimmed.startsWith("00");
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) return null;

  let e164;
  if (trimmed.startsWith("00")) {
    e164 = `+${digits.slice(2)}`;
  } else if (hasPlus) {
    e164 = `+${digits}`;
  } else if (digits.startsWith("0")) {
    e164 = `${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  } else if (digits.startsWith(DEFAULT_COUNTRY_CODE.replace("+", ""))) {
    // Already carries the country code, just without the leading "+".
    e164 = `+${digits}`;
  } else {
    e164 = `${DEFAULT_COUNTRY_CODE}${digits}`;
  }

  const national = e164.slice(1);
  if (national.length < 8 || national.length > 15) return null;

  return e164;
}

async function sendViaTwilio(to, message) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    console.warn("SMS SKIPPED: Twilio credentials are not configured.");
    return null;
  }

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: message }),
    }
  );

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || `Twilio responded with ${res.status}`);
  }
  return payload;
}

async function sendViaTermii(to, message) {
  const apiKey = process.env.TERMII_API_KEY;
  const senderId = process.env.TERMII_SENDER_ID;

  if (!apiKey || !senderId) {
    console.warn("SMS SKIPPED: Termii credentials are not configured.");
    return null;
  }

  const res = await fetch("https://api.ng.termii.com/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: to.replace("+", ""),
      from: senderId,
      sms: message,
      type: "plain",
      channel: "generic",
      api_key: apiKey,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || `Termii responded with ${res.status}`);
  }
  return payload;
}

/**
 * Send an SMS. Never throws — failures are logged and resolve to null so the
 * caller's main flow is unaffected.
 *
 * @param {Object} options
 * @param {string} options.to - Recipient phone number in any common format
 * @param {string} options.message - Plain-text body
 * @returns {Promise<Object|null>}
 */
async function sendSms({ to, message }) {
  const provider = (process.env.SMS_PROVIDER || "").toLowerCase();
  if (!provider) return null;

  const phone = normalisePhone(to);
  if (!phone) {
    if (to) console.warn("SMS SKIPPED: unusable phone number.");
    return null;
  }

  if (!message) return null;

  try {
    if (provider === "twilio") return await sendViaTwilio(phone, message);
    if (provider === "termii") return await sendViaTermii(phone, message);

    console.warn(`SMS SKIPPED: unknown SMS_PROVIDER "${provider}".`);
    return null;
  } catch (err) {
    console.error("SMS ERROR:", err.message);
    return null;
  }
}

module.exports = sendSms;
module.exports.normalisePhone = normalisePhone;
