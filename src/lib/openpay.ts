import "server-only";
import { getSettings } from "./settings";

// Integración con OpenPay (cargo con redireccionamiento a su checkout seguro).
// Docs: https://documents.openpay.mx/docs/api/#cargo-con-redireccionamiento

export async function openpayConfig() {
  const s = await getSettings(["openpayMerchantId", "openpayPrivateKey", "openpaySandbox"]);
  const configured = !!(s.openpayMerchantId && s.openpayPrivateKey);
  const base = s.openpaySandbox === "false" ? "https://api.openpay.mx/v1" : "https://sandbox-api.openpay.mx/v1";
  return { ...s, configured, base };
}

async function call(path: string, init?: RequestInit) {
  const cfg = await openpayConfig();
  if (!cfg.configured) throw new Error("OpenPay no está configurado. Agrega Merchant ID y llave privada en Ajustes.");
  const res = await fetch(`${cfg.base}/${cfg.openpayMerchantId}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${cfg.openpayPrivateKey}:`).toString("base64")}`,
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenPay: ${body?.description ?? res.statusText}`);
  return body;
}

export async function createCheckoutCharge(opts: {
  amount: number;
  description: string;
  orderId: string;
  name: string;
  email: string;
  redirectUrl: string;
}) {
  const body = await call("/charges", {
    method: "POST",
    body: JSON.stringify({
      method: "card",
      amount: opts.amount,
      currency: "MXN",
      description: opts.description,
      order_id: opts.orderId,
      confirm: false,
      send_email: false,
      redirect_url: opts.redirectUrl,
      customer: { name: opts.name, email: opts.email },
    }),
  });
  return { chargeId: body.id as string, url: body.payment_method?.url as string };
}

export async function getChargeStatus(chargeId: string): Promise<string> {
  const body = await call(`/charges/${chargeId}`);
  return body.status as string; // "completed" cuando está pagado
}
