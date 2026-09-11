// Max-flow with min-cut extraction (Dinic's algorithm).
//
// This exists because interview-round feasibility is exactly a flow problem, and
// the min-cut is the part that matters to a user: it names which constraint is
// actually binding. "You can run 31 of 35" is the flow value; "the bottleneck is
// Tuesday evening availability, not your caps" is the cut.
//
// Complexity is O(V^2 E), which at club scale (hundreds of nodes) is instant.

export type Edge = {
  to: number;
  cap: number;
  flow: number;
  rev: number; // index of the reverse edge in graph[to]
  label?: string; // set on capacity-bearing edges so the cut can be explained
};

export class FlowNetwork {
  graph: Edge[][] = [];
  private level: number[] = [];
  private iter: number[] = [];

  node(): number {
    this.graph.push([]);
    return this.graph.length - 1;
  }

  edge(from: number, to: number, cap: number, label?: string) {
    if (from === to || cap <= 0) return;
    this.graph[from].push({
      to,
      cap,
      flow: 0,
      rev: this.graph[to].length,
      label,
    });
    this.graph[to].push({
      to: from,
      cap: 0,
      flow: 0,
      rev: this.graph[from].length - 1,
    });
  }

  private bfs(s: number, t: number): boolean {
    this.level = new Array(this.graph.length).fill(-1);
    const queue = [s];
    this.level[s] = 0;
    for (let head = 0; head < queue.length; head++) {
      const v = queue[head];
      for (const e of this.graph[v]) {
        if (e.cap - e.flow > 0 && this.level[e.to] < 0) {
          this.level[e.to] = this.level[v] + 1;
          queue.push(e.to);
        }
      }
    }
    return this.level[t] >= 0;
  }

  private dfs(v: number, t: number, pushed: number): number {
    if (v === t) return pushed;
    for (; this.iter[v] < this.graph[v].length; this.iter[v]++) {
      const e = this.graph[v][this.iter[v]];
      const room = e.cap - e.flow;
      if (room > 0 && this.level[v] + 1 === this.level[e.to]) {
        const sent = this.dfs(e.to, t, Math.min(pushed, room));
        if (sent > 0) {
          e.flow += sent;
          this.graph[e.to][e.rev].flow -= sent;
          return sent;
        }
      }
    }
    return 0;
  }

  maxflow(s: number, t: number): number {
    let total = 0;
    while (this.bfs(s, t)) {
      this.iter = new Array(this.graph.length).fill(0);
      for (;;) {
        const sent = this.dfs(s, t, Number.MAX_SAFE_INTEGER);
        if (sent === 0) break;
        total += sent;
      }
    }
    return total;
  }

  // Nodes still reachable from the source in the residual graph. Everything
  // reachable is on the source side of the minimum cut.
  reachable(s: number): boolean[] {
    const seen = new Array(this.graph.length).fill(false);
    const queue = [s];
    seen[s] = true;
    for (let head = 0; head < queue.length; head++) {
      for (const e of this.graph[queue[head]]) {
        if (e.cap - e.flow > 0 && !seen[e.to]) {
          seen[e.to] = true;
          queue.push(e.to);
        }
      }
    }
    return seen;
  }

  // The saturated, labelled edges crossing from the source side to the sink
  // side. These are the constraints that are actually binding — raising any
  // capacity NOT in this set changes nothing, which is the whole point.
  cut(s: number): { label: string; cap: number }[] {
    const seen = this.reachable(s);
    const out: { label: string; cap: number }[] = [];
    for (let v = 0; v < this.graph.length; v++) {
      if (!seen[v]) continue;
      for (const e of this.graph[v]) {
        if (e.label && e.cap > 0 && !seen[e.to]) {
          out.push({ label: e.label, cap: e.cap });
        }
      }
    }
    return out;
  }
}
