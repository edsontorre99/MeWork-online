/** Logotipo de texto "MeWork": grotesca negra con tracking cerrado. */
export function Logo({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`font-wordmark font-bold text-[#1d1d1f] select-none ${className}`}
      style={{ fontSize: size, letterSpacing: "-0.045em", lineHeight: 1 }}
    >
      MeWork
    </span>
  );
}
