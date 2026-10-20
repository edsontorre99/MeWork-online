/* eslint-disable @next/next/no-img-element */

export function Avatar({
  name,
  src,
  color = "#0f766e",
  size = 40,
  online,
}: {
  name: string;
  src?: string | null;
  color?: string;
  size?: number;
  online?: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt={name} className="h-full w-full rounded-full object-cover ring-2 ring-white" />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-bold text-white ring-2 ring-white"
          style={{ background: color, fontSize: size * 0.38 }}
        >
          {initials}
        </div>
      )}
      {online && <span className="absolute right-0 bottom-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />}
    </div>
  );
}
