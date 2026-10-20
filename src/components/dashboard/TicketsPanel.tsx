"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  Ban, Camera, CheckCircle2, CreditCard, Download, ExternalLink, Loader2, Plus, QrCode, RefreshCw, ScanLine, ShieldCheck, Ticket, XCircle,
} from "lucide-react";
import { Modal } from "@/components/Modal";
import {
  cancelTicket, createTicket, markTicketPaid, startCheckout, validateTicket, verifyPayment, type ScanResult,
} from "@/app/actions";

type TicketRow = {
  id: string;
  code: string;
  buyerName: string;
  buyerEmail: string;
  status: string;
  price: number;
  eventName: string;
  hasCharge: boolean;
  checkoutUrl: string | null;
  usedAt: string | null;
};

const STATUS_CLS: Record<string, string> = {
  PENDIENTE: "bg-amber-100 text-amber-800",
  PAGADO: "bg-emerald-100 text-emerald-800",
  USADO: "bg-stone-200 text-stone-600",
  CANCELADO: "bg-red-100 text-red-700",
};
const money = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

export function TicketsPanel({
  tickets,
  eventName,
  price,
  openpay,
}: {
  tickets: TicketRow[];
  eventName: string;
  price: number;
  openpay: { configured: boolean; sandbox: boolean };
}) {
  const [newOpen, setNewOpen] = useState(false);
  const [qrTicket, setQrTicket] = useState<TicketRow | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  const sold = tickets.filter((t) => t.status === "PAGADO" || t.status === "USADO");
  const run = (id: string, fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, okText?: string) => {
    setBusy(id);
    setMsg(null);
    start(async () => {
      const r = await fn();
      setBusy(null);
      if (!r.ok) setMsg({ ok: false, text: r.error ?? "Error" });
      else if (okText) setMsg({ ok: true, text: okText });
    });
  };

  return (
    <section id="boletos" className="card scroll-mt-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-50 p-2 text-indigo-700"><Ticket className="h-5 w-5" /></div>
          <div>
            <h2 className="font-display text-xl font-bold">Sistema de Venta de Boletos</h2>
            <p className="text-sm text-stone-500">{eventName} · {money(price)} por boleto</p>
          </div>
        </div>
        <button onClick={() => setNewOpen(true)} className="btn-primary px-3 py-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" /> Nuevo boleto
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Stat label="Vendidos" value={sold.length} />
        <Stat label="Ingresos" value={money(sold.reduce((a, t) => a + t.price, 0))} />
        <Stat label="Pendientes de pago" value={tickets.filter((t) => t.status === "PENDIENTE").length} />
        <Stat label="Ya ingresaron" value={tickets.filter((t) => t.status === "USADO").length} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${openpay.configured ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
            <CreditCard className="mt-0.5 h-4 w-4 shrink-0" />
            {openpay.configured ? (
              <p>
                <b>OpenPay conectado</b> ({openpay.sandbox ? "Sandbox · pruebas" : "Producción"}). “Cobrar” genera un enlace de pago seguro de OpenPay.
              </p>
            ) : (
              <p>
                <b>OpenPay sin configurar.</b> Agrega tu Merchant ID y llave privada en{" "}
                <Link href="/ajustes" className="font-semibold underline">Ajustes</Link>. Mientras tanto puedes marcar boletos como pagados manualmente.
              </p>
            )}
          </div>

          {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}

          <div className="overflow-x-auto rounded-xl border border-stone-200">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="bg-sand-100 text-left text-xs text-stone-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Comprador</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {tickets.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-stone-500">Aún no hay boletos. Crea el primero con “Nuevo boleto”.</td>
                  </tr>
                )}
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 font-mono text-xs">{t.code}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{t.buyerName}</p>
                      <p className="text-xs text-stone-500">{t.buyerEmail}</p>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_CLS[t.status]}`}>{t.status}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        {busy === t.id && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
                        {t.status === "PENDIENTE" && openpay.configured && !t.checkoutUrl && (
                          <IconBtn
                            title="Cobrar con OpenPay"
                            onClick={() =>
                              run(t.id, async () => {
                                const r = await startCheckout(t.id);
                                if (r.ok) window.open(r.url, "_blank", "noopener,noreferrer");
                                return r;
                              })
                            }
                          >
                            <CreditCard className="h-4 w-4" />
                          </IconBtn>
                        )}
                        {t.status === "PENDIENTE" && t.checkoutUrl && (
                          <>
                            <IconBtn title="Abrir enlace de pago" onClick={() => window.open(t.checkoutUrl!, "_blank", "noopener,noreferrer")}>
                              <ExternalLink className="h-4 w-4" />
                            </IconBtn>
                            <IconBtn
                              title="Verificar pago en OpenPay"
                              onClick={() =>
                                run(t.id, async () => {
                                  const r = await verifyPayment(t.id);
                                  if (r.ok) setMsg({ ok: r.status === "completed", text: r.status === "completed" ? "Pago confirmado ✅" : `OpenPay reporta: ${r.status}` });
                                  return r.ok ? { ok: true } : r;
                                })
                              }
                            >
                              <RefreshCw className="h-4 w-4" />
                            </IconBtn>
                          </>
                        )}
                        {t.status === "PENDIENTE" && (
                          <IconBtn
                            title="Marcar como pagado (efectivo / transferencia)"
                            onClick={() => confirm(`¿Confirmas que ${t.buyerName} ya pagó?`) && run(t.id, () => markTicketPaid(t.id), "Boleto marcado como pagado.")}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </IconBtn>
                        )}
                        {(t.status === "PAGADO" || t.status === "USADO") && (
                          <IconBtn title="Ver código QR" onClick={() => setQrTicket(t)}>
                            <QrCode className="h-4 w-4" />
                          </IconBtn>
                        )}
                        {(t.status === "PENDIENTE" || t.status === "PAGADO") && (
                          <IconBtn
                            title="Cancelar boleto"
                            onClick={() => confirm(`¿Cancelar el boleto ${t.code}?`) && run(t.id, () => cancelTicket(t.id))}
                          >
                            <Ban className="h-4 w-4" />
                          </IconBtn>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Scanner />
      </div>

      <NewTicketModal open={newOpen} onClose={() => setNewOpen(false)} />
      <QrModal ticket={qrTicket} onClose={() => setQrTicket(null)} />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-sand-100 px-4 py-3">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="font-display text-2xl font-semibold">{value}</p>
    </div>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900">
      {children}
    </button>
  );
}

function NewTicketModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <Modal open={open} onClose={onClose} title="Nuevo boleto" size="sm">
      <form
        className="space-y-4"
        action={(fd) =>
          start(async () => {
            const r = await createTicket(String(fd.get("name")), String(fd.get("email")));
            if (r.ok) {
              setError("");
              onClose();
            } else setError(r.error);
          })
        }
      >
        <div>
          <label className="label" htmlFor="t-name">Nombre del comprador</label>
          <input id="t-name" name="name" className="input" required autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="t-email">Correo</label>
          <input id="t-email" name="email" type="email" className="input" required />
        </div>
        <p className="text-xs text-stone-500">Se genera un código único. El QR se activa cuando el pago se confirma.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button disabled={pending} className="btn-primary">Crear boleto</button>
        </div>
      </form>
    </Modal>
  );
}

function QrModal({ ticket, onClose }: { ticket: TicketRow | null; onClose: () => void }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!ticket) return;
    QRCode.toDataURL(ticket.code, { width: 320, margin: 1, color: { dark: "#042f2e" } }).then(setSrc);
  }, [ticket]);
  return (
    <Modal open={!!ticket} onClose={onClose} title="Boleto digital" size="sm">
      {ticket && (
        <div className="text-center">
          <p className="font-display font-bold">{ticket.eventName}</p>
          <p className="text-sm text-stone-500">{ticket.buyerName}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src && <img src={src} alt={`QR ${ticket.code}`} className="mx-auto my-4 h-56 w-56" />}
          <p className="font-mono text-sm font-bold tracking-wider">{ticket.code}</p>
          {ticket.status === "USADO" && <p className="mt-2 text-sm text-red-600">Este boleto ya fue usado.</p>}
          {src && (
            <a href={src} download={`boleto-${ticket.code}.png`} className="btn-outline mt-4">
              <Download className="h-4 w-4" /> Descargar QR
            </a>
          )}
        </div>
      )}
    </Modal>
  );
}

type BarcodeDetectorLike = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

function Scanner() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [pending, start] = useTransition();
  const [camOn, setCamOn] = useState(false);
  const [camSupported, setCamSupported] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastRef = useRef("");

  useEffect(() => setCamSupported(typeof window !== "undefined" && "BarcodeDetector" in window), []);

  const check = (c: string) => {
    if (!c.trim()) return;
    start(async () => {
      setResult(await validateTicket(c));
      setCode("");
    });
  };

  // Escaneo con cámara (navegadores con BarcodeDetector, p. ej. Chrome en Android)
  useEffect(() => {
    if (!camOn) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    const Detector = (window as unknown as { BarcodeDetector: new (o: object) => BarcodeDetectorLike }).BarcodeDetector;
    const detector = new Detector({ formats: ["qr_code"] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        while (!stopped) {
          const codes = await detector.detect(videoRef.current).catch(() => []);
          const v = codes[0]?.rawValue;
          if (v && v !== lastRef.current) {
            lastRef.current = v;
            check(v);
            setTimeout(() => (lastRef.current = ""), 3000);
          }
          await new Promise((r) => setTimeout(r, 400));
        }
      } catch {
        setCamOn(false);
      }
    })();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn]);

  return (
    <div className="rounded-2xl bg-brand-950 p-5 text-white">
      <p className="flex items-center gap-2 font-display font-bold">
        <ScanLine className="h-5 w-5 text-brand-200" /> Validación de entrada
      </p>
      <p className="mt-1 text-xs text-brand-200">Escanea el QR o escribe el código del boleto.</p>

      {camOn && <video ref={videoRef} className="mt-3 aspect-square w-full rounded-xl bg-black object-cover" muted playsInline />}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          check(code);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 font-mono text-sm uppercase outline-none placeholder:text-brand-200/60 focus:border-brand-200"
          placeholder="TRM-XXXXXXXXXX"
        />
        <button disabled={pending || !code.trim()} className="btn bg-white text-brand-900 hover:bg-brand-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        </button>
      </form>
      {camSupported && (
        <button onClick={() => setCamOn((v) => !v)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-200 hover:text-white">
          <Camera className="h-3.5 w-3.5" /> {camOn ? "Apagar cámara" : "Usar cámara"}
        </button>
      )}

      <div
        className={`mt-4 flex min-h-36 flex-col items-center justify-center rounded-xl p-4 text-center transition ${
          !result ? "border border-dashed border-white/20" : result.allowed ? "bg-emerald-500" : "bg-red-500"
        }`}
        aria-live="polite"
      >
        {!result ? (
          <p className="text-sm text-brand-200">Esperando boleto…</p>
        ) : (
          <>
            {result.allowed ? <CheckCircle2 className="h-12 w-12" /> : <XCircle className="h-12 w-12" />}
            <p className="mt-2 font-display text-2xl font-semibold tracking-wide uppercase">{result.allowed ? "Permitido" : "Denegado"}</p>
            <p className="text-sm">{result.reason}</p>
            {result.buyer && <p className="text-xs opacity-90">{result.buyer} · {result.code}</p>}
          </>
        )}
      </div>
    </div>
  );
}
