import { type CSSProperties, type ReactNode, useState } from "react";

/**
 * Favicon URLs arrive from the radio directory and are therefore untrusted.
 * Keep them in Chromium's image sandbox instead of proxying them through the
 * privileged Electron process. A custom proxy would turn directory data into
 * arbitrary main-process network requests.
 */
interface FaviconSource {
  candidates: string[];
}

const FALLBACK_GRADIENTS = [
  "radial-gradient(circle at top center, #00dfd8 0%, #007cf0 72%)",
  "radial-gradient(circle at top center, #d946ef 0%, #7c3aed 72%)",
  "radial-gradient(circle at top center, #fb923c 0%, #f43f5e 72%)",
  "radial-gradient(circle at top center, #22d3ee 0%, #2563eb 72%)",
  "radial-gradient(circle at top center, #a3e635 0%, #059669 72%)",
  "radial-gradient(circle at top center, #ec4899 0%, #8b5cf6 72%)",
  "radial-gradient(circle at top center, #38bdf8 0%, #6366f1 72%)",
  "radial-gradient(circle at top center, #facc15 0%, #f97316 72%)"
];

function gradientFor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  return FALLBACK_GRADIENTS[Math.abs(hash) % FALLBACK_GRADIENTS.length];
}

function constrainWikimediaThumbnail(url: URL): void {
  if (url.hostname !== "upload.wikimedia.org" || !url.pathname.includes("/thumb/")) return;
  url.pathname = url.pathname.replace(/\/\d+px-([^/]+)$/, "/250px-$1");
}

function getFaviconSource(value: unknown): FaviconSource | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    constrainWikimediaThumbnail(url);
    if (url.protocol === "https:") return { candidates: [url.href] };

    const insecureUrl = url.href;
    url.protocol = "https:";
    return { candidates: [url.href, insecureUrl] };
  } catch {
    return null;
  }
}

interface FaviconProps {
  url: unknown;
  seed: string;
  alt?: string;
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
  imageClassName?: string;
  imageStyle?: CSSProperties;
  fallback: ReactNode;
  renderBackdrop?: (src: string) => ReactNode;
  renderFallbackBackdrop?: (background: string) => ReactNode;
}

interface FaviconAssetProps extends Omit<FaviconProps, "url"> {
  source: FaviconSource | null;
}

const loadedImages = new Set<string>();

function FaviconAsset({ source, seed, alt = "", wrapperClassName, wrapperStyle, imageClassName, imageStyle, fallback, renderBackdrop, renderFallbackBackdrop }: FaviconAssetProps) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const src = source?.candidates[candidateIndex] ?? null;
  const [loaded, setLoaded] = useState(() => src ? loadedImages.has(src) : false);
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed || !loaded;
  const fallbackGradient = gradientFor(seed);

  return <div className={wrapperClassName} style={wrapperStyle}>
    {loaded && src && renderBackdrop?.(src)}
    {showFallback && renderFallbackBackdrop?.(fallbackGradient)}
    {showFallback ? <div style={{ position: "absolute", inset: 0, borderRadius: "inherit", background: fallbackGradient, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255, 255, 255, 0.9)" }}>{fallback}</div> : null}
    {src && !failed ? <img
      src={src}
      alt={alt}
      className={imageClassName}
      style={imageStyle}
      onLoad={() => {
        setLoaded(true);
        if (src) loadedImages.add(src);
      }}
      onError={() => {
        if (source && candidateIndex + 1 < source.candidates.length) setCandidateIndex((index) => index + 1);
        else setFailed(true);
      }}
    /> : null}
  </div>;
}

/** Browser image caching coalesces identical table, player, and drawer requests. */
export function Favicon(props: FaviconProps) {
  const source = getFaviconSource(props.url);
  return <FaviconAsset key={source?.candidates.join("|") ?? "missing"} {...props} source={source} />;
}
