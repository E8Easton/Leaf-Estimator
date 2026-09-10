import { BrandLogo } from "@/components/BrandLogo";
import { AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4">
      <div className="shark-panel w-full max-w-md p-8 text-center">
        <div className="flex justify-center mb-5">
          <BrandLogo className="h-14 w-14" />
        </div>
        <AlertCircle className="mx-auto h-10 w-10 text-primary mb-4" />
        <h1 className="text-3xl font-bold text-white font-display mb-1">404</h1>
        <h2 className="text-lg font-semibold text-zinc-200 mb-3 font-display">Page Not Found</h2>
        <p className="text-zinc-400 mb-6 text-sm leading-relaxed">
          This page doesn’t exist in the Shark Exterior pricing tool.
        </p>
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Back to Pricing
        </button>
      </div>
    </div>
  );
}
