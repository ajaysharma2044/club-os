import type { Field } from "./FormPrimitives";
export type Row = {
    id: string;
    kind: string;
    owner: string;
    data: Record<string, any>;
    version: number;
};
export type Person = {
    id: string;
    name: string;
    role?: string;
};
export type TaskProps = {
    people: Person[];
    user: {
        id: string;
        role: string;
    };
    busy: boolean;
    action: (path: string, body: any) => Promise<any>;
    run: (path: string, body: any) => Promise<void>;
    show: (title: string, fields: Field[], submit: (d: any) => Promise<void>, label?: string) => void;
};
export const dateLabel = (s: string) => new Date(s).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const fieldsFrom = (values: string[]) => values.map(value => ({ value, label: value }));
