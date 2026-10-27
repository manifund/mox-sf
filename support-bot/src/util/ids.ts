export function ticketRef(id: number): string {
  return `MOX-${String(id).padStart(3, "0")}`;
}

export function parseTicketRef(s: string): number | null {
  const m = /MOX-?(\d+)/i.exec(s);
  return m ? parseInt(m[1]!, 10) : null;
}

/** custom_id helpers — every interactive component id is "mox:<ns>:<action>[:<ticket>[:<extra>]]" */
export function cid(ns: string, action: string, ticketId?: number | string, extra?: string): string {
  const parts = ["mox", ns, action];
  if (ticketId !== undefined) parts.push(String(ticketId));
  if (extra !== undefined) parts.push(extra);
  return parts.join(":");
}

export interface ParsedCid {
  ns: string;
  action: string;
  ticketId: number | null;
  extra: string | null;
}

export function parseCid(customId: string): ParsedCid | null {
  const p = customId.split(":");
  if (p[0] !== "mox" || p.length < 3) return null;
  const ticketId = p[3] !== undefined && /^\d+$/.test(p[3]) ? parseInt(p[3], 10) : null;
  return { ns: p[1]!, action: p[2]!, ticketId, extra: p[4] ?? (ticketId === null && p[3] !== undefined ? p[3] : null) };
}
