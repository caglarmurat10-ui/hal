export type Sale = {
  id: string;
  date: string;
  season: string;
  kilo: number;
  unitPrice: number;
  gross: number;
  commissionRate: number;
  net: number;
  received: number;
  createdAt?: string;
  updatedAt?: string;
};

export type Payment = {
  id: string;
  date: string;
  amount: number;
  createdAt: string;
};

export type AppState = {
  sales: Sale[];
  payments: Payment[];
  commissionRate: number;
  serverTime: string;
};

export type PendingOperation =
  | { id: string; type: "upsert-sale"; payload: Sale }
  | { id: string; type: "delete-sale"; payload: { id: string } }
  | { id: string; type: "payment"; payload: { paymentId: string; amount: number; date: string } }
  | { id: string; type: "settings"; payload: { commissionRate: number } };
