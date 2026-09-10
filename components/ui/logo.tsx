import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Refactrd wordmark.
 *
 * One asset for both themes. The file is black on transparent, so dark mode
 * inverts it via the --logo-filter token rather than swapping in the padded
 * 500x500 white variant, which would render the mark tiny inside its whitespace.
 */
export function Logo({
  className,
  width = 132,
}: {
  className?: string;
  width?: number;
}) {
  return (
    <Image
      src="/images/Refactrd-logo-short.png"
      alt="Refactrd"
      width={width}
      height={Math.round((width * 110) / 400)}
      priority
      className={cn("logo-adaptive h-auto w-auto", className)}
      style={{ width, height: "auto" }}
    />
  );
}
