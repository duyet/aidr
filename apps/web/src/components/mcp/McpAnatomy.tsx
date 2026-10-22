import { useEffect, useId, useRef, useState } from "react";
import { useLang } from "../../lib/lang-context";
import {
  ART,
  CABLE,
  DIAL_HUB,
  DRAWERS,
  HEIGHT,
  HITS,
  type Item,
  LED,
  needleOf,
  SCREEN_LINES,
  WIDTH,
} from "./anatomy/geometry";
import { pathOf } from "./anatomy/iso-kit";
import { PARTS, partById, TOOL_PARTS } from "./anatomy/model";
import "./anatomy/anatomy.css";

const TOUR_MS = 4200;
const PULSE_MS = 1100;
const HALF_HOUR_MS = 30 * 60 * 1000;

function Art({ items }: { items: Item[] }) {
  return (
    <>
      {items.map((item, i) => {
        if (item.kind === "halo")
          return <path key={i} className="iso-halo" d={item.d} />;
        if (item.kind === "line")
          return (
            <path
              key={i}
              className="iso-line"
              data-tone={item.tone}
              d={item.d}
            />
          );
        if (item.kind === "dots")
          return (
            <g key={i} className="iso-dots" data-tone={item.tone}>
              {item.points.map(([x, y], j) => (
                <circle
                  key={j}
                  cx={x.toFixed(1)}
                  cy={y.toFixed(1)}
                  r={item.size}
                />
              ))}
            </g>
          );
        const { paths, tone = "hi", lit, crease = "faint" } = item;
        return (
          <g key={i} className="iso-solid" data-lit={lit ? "" : undefined}>
            <path className="iso-fill" d={paths.fill} />
            {paths.shades.map((d, shade) =>
              d ? (
                <path
                  key={shade}
                  className="iso-shade"
                  data-shade={shade}
                  d={d}
                />
              ) : null
            )}
            <path className="iso-top" d={paths.top} />
            {crease !== "none" && paths.crease ? (
              <path className="iso-line" data-tone={crease} d={paths.crease} />
            ) : null}
            {crease !== "none" && paths.bevel ? (
              <path className="iso-line" data-tone={crease} d={paths.bevel} />
            ) : null}
            <path
              className="iso-line iso-edge"
              data-tone={tone}
              d={paths.outline}
            />
          </g>
        );
      })}
    </>
  );
}

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function pointOnCable(t: number): [number, number] {
  const lengths = CABLE.slice(1).map((p, i) =>
    Math.hypot(p[0] - CABLE[i][0], p[1] - CABLE[i][1])
  );
  let left = t * lengths.reduce((a, b) => a + b, 0);
  for (const [i, length] of lengths.entries()) {
    if (left <= length) {
      const f = length ? left / length : 0;
      return [
        CABLE[i][0] + (CABLE[i + 1][0] - CABLE[i][0]) * f,
        CABLE[i][1] + (CABLE[i + 1][1] - CABLE[i][1]) * f,
      ];
    }
    left -= length;
  }
  return CABLE[CABLE.length - 1];
}

/**
 * The MCP server drawn as a card cabinet. A 30-minute feeder ranks cards
 * onto a rack, each public read tool is a drawer, the operator tools sit
 * behind a lock, and an AI client pulls stories through one port.
 */
export function McpAnatomy() {
  const lang = useLang();
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const clipId = useId().replace(/:/g, "");
  const [activeId, setActiveId] = useState<string>(TOOL_PARTS[0].id);
  const [held, setHeld] = useState(false);
  const [arrived, setArrived] = useState(true);
  const rootRef = useRef<HTMLElement>(null);
  const needleRef = useRef<SVGPathElement>(null);
  const pulseRef = useRef<SVGCircleElement>(null);
  const active = partById(activeId);
  const openIndex = TOOL_PARTS.findIndex((part) => part.id === activeId);

  useEffect(() => {
    const tick = () =>
      needleRef.current?.setAttribute(
        "d",
        needleOf((Date.now() % HALF_HOUR_MS) / HALF_HOUR_MS)
      );
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (held || reducedMotion()) return;
    let visible = true;
    const root = rootRef.current;
    const observer =
      root && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
          })
        : null;
    if (root) observer?.observe(root);
    const timer = window.setInterval(() => {
      if (!visible || document.hidden) return;
      setActiveId((id) => {
        const index = PARTS.findIndex((part) => part.id === id);
        return PARTS[(index + 1) % PARTS.length].id;
      });
    }, TOUR_MS);
    return () => {
      window.clearInterval(timer);
      observer?.disconnect();
    };
  }, [held]);

  useEffect(() => {
    if (active.kind !== "tool") {
      setArrived(false);
      return;
    }
    const pulse = pulseRef.current;
    if (!pulse || reducedMotion()) {
      setArrived(true);
      return;
    }
    setArrived(false);
    let frame = 0;
    const start = performance.now() + 450;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / PULSE_MS));
      const eased = 1 - (1 - p) ** 3;
      const [x, y] = pointOnCable(eased);
      pulse.setAttribute("cx", x.toFixed(1));
      pulse.setAttribute("cy", y.toFixed(1));
      pulse.style.opacity =
        p <= 0 || p >= 1 ? "0" : String(Math.min(1, Math.sin(p * Math.PI) * 2));
      if (p < 1) frame = requestAnimationFrame(step);
      else setArrived(true);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  const pick = (id: string) => {
    setHeld(true);
    setActiveId(id);
  };
  const fromEvent = (event: { target: EventTarget }) => {
    const part = (event.target as Element).closest?.("[data-part]");
    const id = part?.getAttribute("data-part");
    if (id && id !== activeId) pick(id);
  };
  const lit = (kind: string) => active.kind === kind;
  const order = DRAWERS.map((_, i) => i).sort(
    (a, b) => Number(a === openIndex) - Number(b === openIndex)
  );

  return (
    <figure ref={rootRef} className="iso mt-8">
      <div className="relative overflow-hidden rounded-xl border border-border bg-card px-2 pt-10 pb-12 sm:px-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-4 top-3.5 bottom-3.5 font-mono text-[10.5px] tracking-wider text-muted-foreground"
        >
          <span className="absolute top-0 left-0 text-foreground/70">
            Fig. 1
          </span>
          <span className="absolute top-0 right-0 uppercase">
            {t("Anatomy of the MCP server", "Cấu tạo máy chủ MCP")}
          </span>
          <span className="absolute bottom-0 left-0 hidden uppercase sm:inline">
            {t("Hover or tap a part", "Rê chuột hoặc chạm vào một bộ phận")}
          </span>
          <span
            className="absolute right-0 bottom-0 text-foreground/80 tabular-nums"
            data-readout
          >
            {lang === "vi" ? active.label.vi : active.label.en}
          </span>
        </div>
        <svg
          className="iso-svg mx-auto max-w-[720px]"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={t(
            "Isometric drawing of the AI;DR MCP server as a card cabinet with one drawer per read tool.",
            "Hình isometric mô tả máy chủ MCP của AI;DR như một tủ phiếu, mỗi ngăn kéo là một công cụ đọc."
          )}
          onPointerOver={fromEvent}
          onClick={fromEvent}
          onPointerLeave={() => setHeld(false)}
        >
          <defs>
            {DRAWERS.map((drawer, i) => (
              <clipPath key={i} id={`${clipId}-d${i}`}>
                <path d={drawer.clip} />
              </clipPath>
            ))}
          </defs>
          <Art items={ART.base} />
          <g data-part="ingest">
            <Art items={ART.feeder} />
            <path
              ref={needleRef}
              className="iso-line"
              data-tone={lit("feeder") ? "lit" : "hi"}
              d={needleOf(0)}
            />
            <circle
              cx={DIAL_HUB[0]}
              cy={DIAL_HUB[1]}
              r={1.1}
              className="iso-wire-end"
            />
            <path className="iso-hit" d={HITS.ingest} />
          </g>
          <g data-part="edition">
            <Art items={ART.rack} />
            <path className="iso-hit" d={HITS.edition} />
          </g>
          <Art items={ART.cabinet} />
          {DRAWERS.map((drawer, i) => (
            <path key={i} className="iso-recess" d={drawer.slot} />
          ))}
          {order.map((i) => (
            <g
              key={TOOL_PARTS[i].id}
              data-part={TOOL_PARTS[i].id}
              data-open={i === openIndex ? "" : undefined}
              clipPath={`url(#${clipId}-d${i})`}
            >
              <g
                className="iso-tray"
                transform={i === openIndex ? DRAWERS[i].pull : "translate(0 0)"}
              >
                <Art items={DRAWERS[i].tray} />
              </g>
              <path className="iso-hit" d={DRAWERS[i].clip} />
            </g>
          ))}
          <g data-part="operator">
            <Art items={ART.lock} />
            <path className="iso-hit" d={HITS.operator} />
          </g>
          <g className="iso-wire" data-tone={lit("port") ? "lit" : "mid"}>
            <path
              className="iso-line"
              data-tone={lit("port") ? "lit" : "mid"}
              d={pathOf(CABLE)}
            />
          </g>
          <g data-part="port">
            <Art items={ART.port} />
            <path className="iso-hit" d={HITS.port} />
          </g>
          <g data-part="client">
            <Art items={ART.client} />
            {SCREEN_LINES.map((d, i) => (
              <path
                key={i}
                className="iso-line iso-screen-line"
                data-tone={arrived && active.kind === "tool" ? "lit" : "lo"}
                d={d}
              />
            ))}
            <circle
              cx={LED[0]}
              cy={LED[1]}
              r={1.3}
              className="iso-wire-end"
              style={
                arrived && active.kind === "tool"
                  ? { fill: "var(--anatomy-lit)" }
                  : undefined
              }
            />
            <path className="iso-hit" d={HITS.client} />
          </g>
          <circle
            ref={pulseRef}
            className="iso-pulse"
            r={1.8}
            cx={CABLE[0][0]}
            cy={CABLE[0][1]}
          />
        </svg>
      </div>
      <figcaption className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {PARTS.map((part) => (
            <button
              key={part.id}
              type="button"
              aria-pressed={part.id === activeId}
              onClick={() => pick(part.id)}
              onFocus={() => pick(part.id)}
              className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
                part.id === activeId
                  ? "border-foreground/40 bg-foreground/5 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {lang === "vi" ? part.label.vi : part.label.en}
            </button>
          ))}
        </div>
        <p
          className="min-h-[3em] max-w-3xl text-sm leading-relaxed text-muted-foreground"
          aria-live="polite"
        >
          <span className="font-mono text-xs text-foreground">
            {lang === "vi" ? active.label.vi : active.label.en}
          </span>{" "}
          {lang === "vi" ? active.returns.vi : active.returns.en}
        </p>
      </figcaption>
    </figure>
  );
}
