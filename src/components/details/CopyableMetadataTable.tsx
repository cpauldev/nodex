import { Check, Clipboard } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MetadataRow } from "../../detailPresentation";

export type { MetadataRow } from "../../detailPresentation";

export function CopyableMetadataTable({ rows }: { rows: MetadataRow[] }) {
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  async function copyValue(label: string, value: string) {
    await copyText(value);
    setCopiedLabel(label);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopiedLabel(null), 1_200);
  }

  return <table className="metadata-table">
    <tbody>{rows.map(([label, value]) => {
      const copied = copiedLabel === label;
      return <tr key={label}>
        <th scope="row">{label}</th>
        <td
          aria-label={`Copy ${label}`}
          className={copied ? "copy-value-cell is-copied" : "copy-value-cell"}
          onClick={() => void copyValue(label, value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              void copyValue(label, value);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <span className="copy-value-text">{value}</span>
          <span className="copy-value-badge" aria-hidden="true">{copied ? <Check size={12} /> : <Clipboard size={12} />}</span>
        </td>
      </tr>;
    })}</tbody>
  </table>;
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}
