"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { SLIDES } from "@/lib/copy/greetings";
import { cn } from "@/lib/utils";

const INTERVAL_MS = 7000;

/**
 * Image panel beside the auth form.
 *
 * The supplied photography is stock AI imagery in blues and neon oranges, which
 * would fight the ink and brass palette if used raw. Each slide is desaturated
 * almost to monochrome and washed with brass, so the panel reads as part of the
 * product rather than as a stock photo dropped behind the form.
 *
 * Auto-advance stops entirely under prefers-reduced-motion, and the dots stay
 * operable either way.
 */
export function Showcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced || paused) return;

    const timer = setInterval(
      () => setIndex((current) => (current + 1) % SLIDES.length),
      INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [paused]);

  const slide = SLIDES[index];

  return (
    <aside
      className="relative hidden overflow-hidden rounded-2xl bg-surface-sunken lg:block"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {SLIDES.map((item, i) => (
        <div
          key={item.src}
          className={cn(
            "absolute inset-0 transition-opacity duration-700",
            i === index ? "opacity-100" : "opacity-0",
          )}
          aria-hidden={i !== index}
        >
          <Image
            src={item.src}
            alt={i === index ? item.alt : ""}
            fill
            priority={i === 0}
            sizes="(min-width: 1024px) 50vw, 0px"
            className="object-cover grayscale-[0.9] contrast-[1.05] brightness-[0.78]"
          />
        </div>
      ))}

      {/* Brass wash, then a bottom ramp so the quote always has contrast
          regardless of what the photograph is doing behind it. */}
      <div className="absolute inset-0 bg-brass/25 mix-blend-overlay" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />

      <div className="relative flex h-full flex-col justify-end p-10">
        <blockquote key={slide.quote} className="slide-enter max-w-md">
          <p className="font-display text-2xl leading-snug font-semibold text-balance text-white">
            {slide.quote}
          </p>
          <footer className="mt-3 text-xs font-medium tracking-[0.18em] text-white/70 uppercase">
            {slide.caption}
          </footer>
        </blockquote>

        <div className="mt-8 flex items-center gap-2">
          {SLIDES.map((item, i) => (
            <button
              key={item.src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show slide ${i + 1}: ${item.caption}`}
              aria-current={i === index}
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                i === index
                  ? "w-8 bg-white"
                  : "w-3 bg-white/40 hover:bg-white/70",
              )}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
