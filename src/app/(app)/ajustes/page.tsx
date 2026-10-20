import { getSettings, maskSecret } from "@/lib/settings";
import { SettingsForm } from "./SettingsForm";
import { MailAccounts } from "./MailAccounts";
import { listMailAccounts } from "@/app/mail-actions";

export default async function AjustesPage() {
  const s = await getSettings([
    "geminiApiKey", "geminiModel", "profileName", "profileRole",
    "openpayMerchantId", "openpayPrivateKey", "openpaySandbox", "ticketEventName", "ticketPrice",
  ]);
  const mail = await getSettings(["mailAutoCheck", "mailCheckHours", "mailLastRunAt"]);
  const accounts = await listMailAccounts();
  // Los secretos nunca se envían completos al navegador
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Ajustes</h1>
      <p className="mt-1 text-stone-500">Configura tu perfil, la inteligencia artificial y la pasarela de pagos.</p>
      <SettingsForm
        values={{
          ...s,
          geminiApiKey: maskSecret(s.geminiApiKey),
          openpayPrivateKey: maskSecret(s.openpayPrivateKey),
        }}
        hasGemini={!!s.geminiApiKey}
        hasOpenpay={!!s.openpayPrivateKey}
      />
      <MailAccounts
        accounts={accounts}
        autoCheck={mail.mailAutoCheck === "true"}
        hours={Number(mail.mailCheckHours) || 2}
        lastRunAt={mail.mailLastRunAt || null}
      />
    </div>
  );
}
