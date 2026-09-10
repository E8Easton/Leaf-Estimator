type BrandLogoProps = {
  /** Outer size (Tailwind size class or arbitrary). Default matches previous header logo. */
  className?: string;
};

/** Shark Exterior mark — same brand asset as the calendar app. */
export function BrandLogo({ className = "h-10 w-10" }: BrandLogoProps) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-orange-500/25 shadow-sm ${className}`}
    >
      <img
        src="/logo.jpg"
        alt="Shark Exterior"
        className="h-full w-full object-contain p-1"
        width={40}
        height={40}
        decoding="async"
      />
    </div>
  );
}
