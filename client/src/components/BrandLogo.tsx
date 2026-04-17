import { Leaf } from "lucide-react";

type BrandLogoProps = {
  /** Outer size (Tailwind size class or arbitrary). Default matches previous header logo. */
  className?: string;
};

/**
 * Falcon / mark from `logo.png` with a Leaf Cleaning leaf badge for quick brand recognition.
 */
export function BrandLogo({ className = "h-9 w-9" }: BrandLogoProps) {
  return (
    <div className={`relative shrink-0 rounded-full bg-white ring-2 ring-white/40 ${className}`}>
      <img
        src="/logo.png"
        alt="Leaf Cleaning"
        className="h-full w-full rounded-full object-cover"
        width={36}
        height={36}
        decoding="async"
      />
      <div
        className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-emerald-500 text-white shadow-md ring-2 ring-[#0f1b33]"
        aria-hidden
      >
        <Leaf className="h-[11px] w-[11px]" strokeWidth={2.75} />
      </div>
    </div>
  );
}
