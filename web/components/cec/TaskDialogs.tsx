"use client";
import { useState } from "react";
import { Modal, Editor, type Field } from "./FormPrimitives";
import type { Row, TaskProps } from "./taskTypes";
type Props = {
    task: Row;
    close: () => void;
    action: TaskProps["action"];
};
function TaskDialog({ task, close, action, revision }: Props & {
    revision: boolean;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const title = revision ? "Request revision" : task.data.work_history?.at(-1)?.kind === "revision" ? "Resubmit work" : "Submit work";
    const fields: Field[] = revision
        ? [{ key: "revision_note", label: "What needs to change?", type: "textarea" }]
        : [{ key: "submission_note", label: "What did you complete? Add a note or a link below.", type: "textarea", required: false },
            { key: "artifact_url", label: "Link to your work (optional)", type: "url", required: false }];
    return <Modal title={title} close={() => { if (!busy)
        close(); }}>
    {error && <p className="notice error" role="alert">{error}</p>}
    <Editor fields={fields} busy={busy} label={title} onSubmit={async (values) => {
            setBusy(true);
            setError("");
            try {
                // The snapshot is captured when opening: a background refresh must not
                // silently update the version attached to a submission/review in progress.
                await action("task.status", { id: task.id, version: task.version, status: revision ? "accepted" : "submitted", ...values });
                close();
            }
            catch (e) {
                setError(e instanceof Error ? e.message : "Unable to save. Try again.");
            }
            finally {
                setBusy(false);
            }
        }}/>
  </Modal>;
}
export function TaskSubmissionDialog(props: Props) { return <TaskDialog {...props} revision={false}/>; }
export function TaskRevisionDialog(props: Props) { return <TaskDialog {...props} revision/>; }
