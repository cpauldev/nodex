import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface SelectOption<T extends string> {
  label: string;
  value: T;
}

export function SelectMenu<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)));
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.focus();
    const closeOutside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", closeOutside);
    return () => window.removeEventListener("mousedown", closeOutside);
  }, [activeIndex, open]);

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) window.setTimeout(() => trigger.current?.focus(), 0);
  }

  function choose(index: number) {
    onChange(options[index].value);
    close();
  }

  function onOptionKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index - 1 + options.length) % options.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(index);
    }
  }

  return <div className="ui-select" ref={root}>
    <button
      className="ui-select__trigger"
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => {
        const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
        setActiveIndex(selectedIndex);
        setOpen((current) => !current);
      }}
      ref={trigger}
    >
      <span>{selected.label}</span><ChevronDown size={15} aria-hidden="true" />
    </button>
    {open ? <div className="ui-select__popover" role="listbox" aria-label={label}>
      {options.map((option, index) => <button
        className={option.value === value ? "is-selected" : ""}
        key={option.value}
        role="option"
        aria-selected={option.value === value}
        onClick={() => choose(index)}
        onKeyDown={(event) => onOptionKeyDown(event, index)}
        ref={(element) => { optionRefs.current[index] = element; }}
        tabIndex={activeIndex === index ? 0 : -1}
      >
        <span>{option.label}</span>{option.value === value ? <Check size={15} aria-hidden="true" /> : null}
      </button>)}
    </div> : null}
  </div>;
}
