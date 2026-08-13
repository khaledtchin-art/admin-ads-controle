/**
 * Firebase (Auth + Firestore) client for ADS.
 * Exposes a small Supabase-like query surface so the admin panels keep one API.
 * The config below is a public web config (safe in client code).
 */
import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyCMHMHgBXkq_tU_9nR8DW172wSOHA8-pCk",
  authDomain: "mon-projet-d6af7.firebaseapp.com",
  databaseURL: "https://mon-projet-d6af7-default-rtdb.firebaseio.com",
  projectId: "mon-projet-d6af7",
  storageBucket: "mon-projet-d6af7.firebasestorage.app",
  messagingSenderId: "883471429967",
  appId: "1:883471429967:web:815019d4eb9983c937153a",
  measurementId: "G-DH67EPZ5B1",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);

/** Analytics: navigateur uniquement, chargé après hydratation. */
export async function initAnalytics() {
  if (typeof window === "undefined") return null;
  const { getAnalytics, isSupported } = await import("firebase/analytics");
  return (await isSupported()) ? getAnalytics(firebaseApp) : null;
}

export type Row = Record<string, unknown>;
type Result<T> = { data: T; error: { message: string } | null };

const errorOf = (e: unknown) => ({ message: e instanceof Error ? e.message : String(e) });

async function readAll(name: string): Promise<Row[]> {
  const snap = await getDocs(collection(firestore, name));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Row) }));
}

class SelectQuery implements PromiseLike<Result<Row[]>> {
  private filters: Array<[string, unknown]> = [];
  private orderField: string | null = null;
  private asc = true;
  private max: number | null = null;
  constructor(private name: string) {}

  select(_cols?: string) {
    return this;
  }
  eq(field: string, value: unknown) {
    this.filters.push([field, value]);
    return this;
  }
  order(field: string, opts?: { ascending?: boolean }) {
    this.orderField = field;
    this.asc = opts?.ascending ?? true;
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }

  private async run(): Promise<Result<Row[]>> {
    try {
      let rows = await readAll(this.name);
      for (const [f, v] of this.filters) rows = rows.filter((r) => r[f] === v);
      if (this.orderField) {
        const f = this.orderField;
        rows.sort((a, b) => {
          const x = String(a[f] ?? "");
          const y = String(b[f] ?? "");
          return this.asc ? x.localeCompare(y) : y.localeCompare(x);
        });
      }
      if (this.max !== null) rows = rows.slice(0, this.max);
      return { data: rows, error: null };
    } catch (e) {
      return { data: [], error: errorOf(e) };
    }
  }

  async maybeSingle(): Promise<Result<Row | null>> {
    const res = await this.run();
    return { data: res.data[0] ?? null, error: res.error };
  }

  then<A, B = never>(
    onfulfilled?: ((v: Result<Row[]>) => A | PromiseLike<A>) | null,
    onrejected?: ((r: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }
}

class WriteOp implements PromiseLike<Result<null>> {
  private filters: Array<[string, unknown]> = [];
  constructor(
    private name: string,
    private kind: "update" | "delete",
    private values: Row = {},
  ) {}

  eq(field: string, value: unknown) {
    this.filters.push([field, value]);
    return this;
  }

  private async run(): Promise<Result<null>> {
    try {
      let rows = await readAll(this.name);
      for (const [f, v] of this.filters) rows = rows.filter((r) => r[f] === v);
      await Promise.all(
        rows.map((r) =>
          this.kind === "delete"
            ? deleteDoc(doc(firestore, this.name, String(r["id"])))
            : updateDoc(doc(firestore, this.name, String(r["id"])), {
                ...this.values,
                updated_at: new Date().toISOString(),
              }),
        ),
      );
      return { data: null, error: null };
    } catch (e) {
      return { data: null, error: errorOf(e) };
    }
  }

  then<A, B = never>(
    onfulfilled?: ((v: Result<null>) => A | PromiseLike<A>) | null,
    onrejected?: ((r: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }
}

function table(name: string) {
  return {
    select: (cols?: string) => new SelectQuery(name).select(cols),
    async insert(values: Row | Row[]): Promise<Result<null>> {
      try {
        const list = Array.isArray(values) ? values : [values];
        await Promise.all(
          list.map((v) =>
            addDoc(collection(firestore, name), {
              created_at: new Date().toISOString(),
              ...v,
            }),
          ),
        );
        return { data: null, error: null };
      } catch (e) {
        return { data: null, error: errorOf(e) };
      }
    },
    update: (values: Row) => new WriteOp(name, "update", values),
    delete: () => new WriteOp(name, "delete"),
  };
}

const num = (v: unknown) => Number(v ?? 0);

async function financeOverview() {
  const [tx, deposits, withdrawals, referrals, wallets, kyc, profiles] = await Promise.all(
    ["transactions", "deposits", "withdrawals", "referrals", "wallets", "kyc_submissions", "profiles"].map(readAll),
  );
  const sum = (rows: Row[], field: string, statuses?: string[]) =>
    rows
      .filter((r) => !statuses || statuses.includes(String(r["status"])))
      .reduce((s, r) => s + num(r[field]), 0);
  return [
    {
      total_transactions: tx!.length,
      total_deposits: sum(deposits!, "amount", ["approved", "completed"]),
      total_withdrawals: sum(withdrawals!, "amount", ["approved", "completed"]),
      total_commissions: sum(referrals!, "commission"),
      total_wallet_balance: sum(wallets!, "balance"),
      pending_withdrawals: withdrawals!.filter((r) => r["status"] === "pending").length,
      pending_kyc: kyc!.filter((r) => r["status"] === "pending").length,
      total_users: profiles!.length,
    },
  ];
}

async function detectDuplicateAccounts() {
  const profiles = await readAll("profiles");
  const out: Array<{ kind: string; value: string; account_count: number; user_ids: string[] }> = [];
  const scan = (kind: string, field: string) => {
    const groups = new Map<string, string[]>();
    for (const p of profiles) {
      const v = String(p[field] ?? "").trim();
      if (!v) continue;
      groups.set(v, [...(groups.get(v) ?? []), String(p["id"])]);
    }
    for (const [value, ids] of groups)
      if (ids.length > 1) out.push({ kind, value, account_count: ids.length, user_ids: ids });
  };
  scan("phone", "phone");
  scan("device", "device_info");
  scan("ip", "signup_ip");
  return out;
}

export type AdminUser = { id: string; email: string | null };
export type AdminSession = { user: AdminUser } | null;

const toUser = (u: FirebaseUser | null): AdminUser | null =>
  u ? { id: u.uid, email: u.email } : null;

/** Client Firebase avec une API proche de celle utilisée précédemment. */
export const backend = {
  from: table,
  async rpc(fn: "finance_overview" | "detect_duplicate_accounts") {
    try {
      const data = fn === "finance_overview" ? await financeOverview() : await detectDuplicateAccounts();
      return { data, error: null };
    } catch (e) {
      return { data: null, error: errorOf(e) };
    }
  },
  auth: {
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
        return { data: { user: toUser(cred.user) }, error: null };
      } catch (e) {
        return { data: { user: null }, error: errorOf(e) };
      }
    },
    signOut: () => fbSignOut(firebaseAuth),
    onAuthStateChange(cb: (event: string, session: AdminSession) => void) {
      const unsub = onAuthStateChanged(firebaseAuth, (u) => {
        const user = toUser(u);
        cb(user ? "SIGNED_IN" : "SIGNED_OUT", user ? { user } : null);
      });
      return { data: { subscription: { unsubscribe: unsub } } };
    },
    async getSession(): Promise<{ data: { session: AdminSession } }> {
      const user = await new Promise<AdminUser | null>((resolve) => {
        const unsub = onAuthStateChanged(firebaseAuth, (u) => {
          unsub();
          resolve(toUser(u));
        });
      });
      return { data: { session: user ? { user } : null } };
    },
  },
};
