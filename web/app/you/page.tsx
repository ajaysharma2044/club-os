import { JoinRecord } from "@/components/JoinRecord";
import { PersonalCalendar } from "@/components/PersonalCalendar";
import { PersonalConnections } from "@/components/PersonalConnections";

export default function YouPage() {
  return (
    <>
      <div className="page-title">
        <div>
          <h1 className="text-title-1">Your record</h1>
          <p className="text-caption" style={{ margin: "4px 0 0" }}>
            This stays yours after you graduate.
          </p>
        </div>
        <button className="btn" type="button">
          Export
        </button>
      </div>

      <JoinRecord />

      <section className="section">
        <h2 className="text-title-2">Positions</h2>
        <hr className="rule" />
        <div className="event-row">
          <div className="grow">
            <div className="row-title">Treasurer, Baja Racing</div>
            <div className="text-caption">
              Mar 2026 – Mar 2027 · elected, ballot archived, attested by J. Ruiz and Dr. Patel
            </div>
          </div>
        </div>
        <div className="event-row">
          <div className="grow">
            <div className="row-title">Case team B, Northfield Consulting</div>
            <div className="text-caption">Sep 2025 – present · appointed</div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="text-title-2">This semester</h2>
        <hr className="rule" />
        <dl className="stat-strip">
          <div className="stat">
            <dt>Events attended</dt>
            <dd>11 of 14</dd>
          </div>
          <div className="stat">
            <dt>Hours on the record</dt>
            <dd>46</dd>
          </div>
          <div className="stat">
            <dt>Approvals signed</dt>
            <dd>9</dd>
          </div>
        </dl>
      </section>

      <PersonalCalendar />

      <PersonalConnections />
    </>
  );
}
