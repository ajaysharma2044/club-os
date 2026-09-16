"use client";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
export type Field = {
    key: string;
    label: string;
    type?: string;
    options?: {
        value: string;
        label: string;
    }[];
    required?: boolean;
    value?: any;
};
export function Modal({ title, children, close, }: {
    title: string;
    children: ReactNode;
    close: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const closeRef = useRef(close);
    closeRef.current = close;
    useEffect(() => {
        const prior = document.activeElement as HTMLElement;
        const overlay = ref.current?.closest(".cec-dialog-root");
        const siblings = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== overlay);
        const priorInert = siblings.map(node => node.inert);
        siblings.forEach(node => { node.inert = true; });
        const priorOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const first = ref.current?.querySelector<HTMLElement>("input:not([disabled]),select:not([disabled]),textarea:not([disabled])");
        (first || ref.current)?.focus();
        const listener = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                closeRef.current();
            }
            if (e.key === "Tab") {
                const nodes = ref.current?.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]");
                if (!nodes?.length)
                    return;
                const a = nodes[0], b = nodes[nodes.length - 1];
                if (e.shiftKey && document.activeElement === a) {
                    e.preventDefault();
                    b.focus();
                }
                else if (!e.shiftKey && document.activeElement === b) {
                    e.preventDefault();
                    a.focus();
                }
            }
        };
        document.addEventListener("keydown", listener);
        return () => {
            document.removeEventListener("keydown", listener);
            siblings.forEach((node, index) => { node.inert = priorInert[index]; });
            document.body.style.overflow = priorOverflow;
            if (prior?.isConnected) prior.focus();
        };
    }, []);
    return createPortal(<div className="cec embedded cec-dialog-root"><div className="modal-shade">
      <div ref={ref} className="modal" tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="close" onClick={close} aria-label="Close dialog">
            ×
          </button>
        </header>
        {children}
      </div>
    </div></div>, document.body);
}
export function Editor({ fields, onSubmit, busy, label = "Save", }: {
    fields: Field[];
    onSubmit: (d: any) => Promise<void>;
    busy: boolean;
    label?: string;
}) {
    const [values, setValues] = useState<any>(Object.fromEntries(fields.map((f) => [
        f.key,
        f.value ??
            (f.type === "checkbox" ? false : f.options?.[0]?.value || ""),
    ])));
    async function submit(e: FormEvent) {
        e.preventDefault();
        const d = { ...values };
        for (const f of fields) {
            if (f.type === "datetime-local" && d[f.key])
                d[f.key] = new Date(d[f.key]).toISOString();
        }
        await onSubmit(d);
    }
    return (<form onSubmit={submit} className="form-grid">
      {fields.map((f) => (<label className={f.type === "checkbox" ? "check" : "field"} key={f.key}>
          {f.type === "checkbox" ? (<>
              <input type="checkbox" checked={!!values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.checked })}/>
              {f.label}
            </>) : (<>
              {f.label}
              {f.options ? (<select value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                  {f.options.map((o) => (<option key={o.value} value={o.value}>
                      {o.label}
                    </option>))}
                </select>) : f.type === "textarea" ? (<textarea required={f.required !== false} maxLength={4000} value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}/>) : (<input required={f.required !== false} type={f.type || "text"} value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}/>)}
            </>)}
        </label>))}
      <button disabled={busy} className="button" type="submit">
        {busy ? "Saving…" : label}
      </button>
    </form>);
}
