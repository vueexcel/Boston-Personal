import { cn } from "@/lib/utils";
import logo from "../../../public/assests/BOSTEL.png";

const SIZES = {
  sm: { height: 40, className: "h-10 w-auto" },
  md: { height: 50, className: "h-12 w-auto" },
  lg: { height: 60, className: "h-16 w-auto" },
} as const;

type BostelLogoProps = {
  size?: keyof typeof SIZES;
  className?: string;
  /** Rounded container for light backgrounds (logo asset has a black canvas). */
  framed?: boolean;
  priority?: boolean;
};

export function BostelLogo({
  size = "md",
  className,
  framed = false,
  priority,
}: BostelLogoProps) {
  const { height, className: sizeClass } = SIZES[size];
  const aspectRatio = logo.width / logo.height;
  const width = Math.round(height * aspectRatio);

  const image = (
    // eslint-disable-next-line @next/next/no-img-element -- static logo; avoids sharp in standalone prod
    <img
      src={logo.src}
      alt="Bostel Communications"
      width={width}
      height={height}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      className={cn(sizeClass, "object-contain object-left", className)}
    />
  );

  if (!framed) return image;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center overflow-hidden",
        size === "sm" && "px-1.5 py-1",
        size === "md" && "px-2 py-1",
        size === "lg" && "px-2.5 py-1.5",
      )}
    >
      {image}
    </span>
  );
}
