# LedgerPilot demo script

**Shree Ganesh Electricals & Hardware** · Nashik, Maharashtra · GSTIN `27AABCS4821K1Z6` · FY 2026-27

As of **27 Oct 2026, 6:40 pm IST**. All data is synthetic. Payments are simulated; no bank,
vendor, GST portal or external API is connected.

---

## Before the judges arrive

```powershell
npm install --legacy-peer-deps --no-audit --no-fund
npm run dev
```

Open `http://localhost:3000`. In **Demo controls**, click **Reset demo data** and confirm, so the
run starts from the seed: 12 vendors, 16 invoices, 10 payment records, 19 audit events,
Ramesh Patil (owner) acting.

Optional confidence checks:

```powershell
npm run check:ledger   # 116/116 data consistency assertions
npm run lint
npm run build
```

---

## The 3-minute run

### 0:00 – 0:15 · Open on Overview

Say:

> This is LedgerPilot, the payables console for a small Indian electricals and hardware retailer.
> Everything you see is synthetic, and the demo banner stays on screen: payments are simulated,
> no money moves.

### 0:15 – 0:45 · Show the working capital picture

Point at the four KPI cards, then the two queues below them.

> The business has **₹3,83,870** of open payables across 11 invoices. **₹1,01,088** is overdue on
> four invoices, and **₹11,151** falls due in the next seven days.
>
> Four exceptions need a human: a **₹135 GST arithmetic difference** on Sharma Hardware, a
> **duplicate copy** from Sahyadri Switchgear, a **changed bank account** for Nashik Lighting House,
> and an Om Sai invoice with **no purchase order**.
>
> The approval queue is separate: one request is waiting for the owner, two are approved and ready
> to execute.

### 0:45 – 1:15 · Open one invoice and show the evidence

Click **Review exceptions**, then open **Sharma/26-27/0412** (Sharma Hardware & Tools).

> The vendor's printed total is **₹21,995**, but the line items plus GST add up to **₹22,130**. That
> ₹135 gap is a blocking exception, so the invoice cannot be paid until it is corrected.
>
> Every invoice carries its own checks, vendor bank state, payment history, and the original
> document. Click **Invoice document** to see the printed invoice the fields were extracted from.

Close the drawer.

### 1:15 – 2:05 · Maker-checker: record, approve, execute

1. In the header, switch **Acting as** to **Sunita · accountant**.
2. Go to **Invoices** and open **ABC/26-27/0184** (ABC Electricals).
3. The invoice is **₹12,500**, with **₹5,000** already paid and **₹7,500** available.
4. Click **Record payment**. Set the amount to **2500.00**, leave NEFT and the default reference,
   then click **Record request**.
5. Close the drawer. Switch the header role back to **Ramesh · owner**.
6. Go to **Payments**. The new **₹2,500** request is in **Awaiting owner approval**.
7. Click **Approve**, then confirm **Approve payment**.
8. Click **Execute**, then confirm **Execute simulation**.

Say while the mock transaction appears:

> Sunita can record a request, but she cannot approve or execute it. Ramesh approves, then executes
> a simulated NEFT. The result is a mock transaction id, not a bank transfer. The request, approval,
> execution and the new balance are all written to the audit trail. A refresh keeps the state.

The ABC balance is now **₹5,000** and the payment shows **Simulated**.

### 2:05 – 2:40 · Show why approvals go stale

1. Go to **Invoices**, open **PSS/26-27/0121** (Prime Solar Solutions, ₹1,39,240, approved).
2. Scroll to **Payment requests** and click **Record supplier revision**. Confirm **Add revision**.
3. Scroll back up.

> The supplier added ₹500 freight and the total changed. The approval was tied to the invoice total
> and the bank account, so it is now **stale**. Execution is replaced by **Re-approve**. That is the
> difference between a click-through approval and a control.

Optionally click **Re-approve** and confirm to show the approval fingerprint being refreshed.

### 2:40 – 3:00 · Reset and close

1. Open **Demo controls**.
2. Click **Reset demo data**, then confirm **Reset demo data**.

> The seed is restored: 10 payments, 19 audit events, Ramesh acting. The same build passes 116 data
> consistency checks. The product is deliberately narrow: invoice checks, maker-checker controls,
> simulated payments and an audit trail for an Indian small business.

---

## Alternate 30-second ending: failed payment and safe retry

Use this instead of the revision ending if the judges care more about payment operations.

1. **Demo controls** → arm **Force the next simulated transfer to fail**.
2. **Payments** → **Execute** on Deccan Power Tools (`DPT/26-27/0559`, ₹36,816).
3. Confirm **Execute simulation**. It lands in **Failed** with a mock gateway reason.
4. Click **Retry** → **Authorise retry**, then **Execute** → **Execute simulation**.

> The retry reuses the same payment record and reference. The first attempt stays in the audit
> trail. Nothing auto-retries, and no duplicate transfer is created.

---

## Numbers to keep straight

| Item | Value |
| --- | --- |
| Total payable | ₹3,83,870.00 (11 open invoices) |
| Overdue | ₹1,01,088.00 (4 invoices) |
| Due in 7 days | ₹11,151.00 |
| Awaiting owner approval | 1 · Godavari Conduit Co. · ₹7,434.00 |
| Approved to execute | 2 · ₹1,76,056.00 |
| Simulated payments | 7 · ₹1,02,388.00 paid this month |
| Exceptions | 4 |
| ABC invoice | ₹12,500.00 total · ₹5,000.00 paid · ₹7,500.00 available |
| Sharma mismatch | ₹21,995.00 printed vs ₹22,130.00 arithmetic · ₹135.00 gap |
| Trimurti invoice | ₹14,632.00 total · ₹7,000.00 paid · ₹7,632.00 balance |
| Nashik bank change | HDFC ****6614 → ICICI ****7719 on 25 Oct 2026 |
| Seed size | 12 vendors · 16 invoices · 10 payments · 19 audit events |

Key invoice numbers:

- ABC Electricals: `ABC/26-27/0184`
- Sharma Hardware: `Sharma/26-27/0412`
- Godavari Conduit: `GCC/26-27/0193`
- Prime Solar: `PSS/26-27/0121`
- Deccan Power: `DPT/26-27/0559`
- Nashik Lighting: `NLH/26-27/0288`
- Sahyadri duplicate: `Sahyadri/26-27/0771`
- Om Sai: `OSE/26-27/0507`

---

## Judge Q&A

**Is any money actually transferred?**
No. There is no bank or PSP connection. Execution creates a mock transaction id such as
`MOCK-NEFT-20261027-XXXXXX` and an audit event. The banner states this on every screen.

**How do you stop a duplicate payment?**
Four layers: the duplicate check flags the same vendor, invoice number and amount; duplicate copies
are excluded from payables; the available balance subtracts simulated, pending and approved amounts;
and execution is idempotent, so replaying an executed payment returns the existing mock transaction
instead of creating another one.

**What happens if the vendor changes their bank account?**
New payment requests are blocked until the owner verifies the account by phone. The approval also
fingerprints the bank account, so changing it after approval makes the approval stale.

**What happens if the invoice changes after approval?**
The approval fingerprint covers the invoice total and the vendor bank account. Any change marks the
approval stale; **Execute** is replaced by **Re-approve**, and the store also rejects stale
execution.

**How is GST handled?**
Amounts are integer paise internally. Intra-state invoices split CGST 9% + SGST 9%; inter-state
invoices use IGST 18%. Totals are rounded to the rupee and shown with Indian digit grouping. The
Sharma invoice demonstrates a deliberate ₹135 arithmetic exception.

**Is the role switch only hiding buttons?**
No. Approval, rejection, execution, retry, revision and bank verification call an owner check in the
store. A staff role also cannot record a payment. The UI toast is only the visible part.

**Is this using AI or Gemini?**
The demo path does not call any model or external service. It runs entirely in the browser on
deterministic seed data. The extraction/intake layer is represented by structured invoice records
and the rendered source document; the checks and controls operate on that structured record.

**Where does the data live?**
In `localStorage`, so a refresh keeps the session. **Reset demo data** restores the deterministic
seed. A production build would use a database and an append-only audit store, but the demo has no
backend dependency and no paid services.

**Why not auto-pay everything?**
The product is built around owner control for a small business: the accountant records, the owner
approves and executes, exceptions block payment, and every step is attributable. Automation handles
checking and evidence; it does not remove the approval.

**What would you build next?**
Email/WhatsApp invoice intake and OCR into the same record shape, a vendor portal, real payment
gateway integration with webhooks and reconciliation, and GST filing exports. The checks and
maker-checker controls already define the contract those integrations would feed.

---

## Failure drills

- **Nothing happens when I click Approve?** The acting role is not owner. Switch to Ramesh.
- **Record payment is disabled?** The invoice is paid, rejected, a duplicate, has a blocking
  exception, or has no available balance. The reason is printed under the footer.
- **Execute is missing on an approved payment?** The approval is stale after a revision or bank
  change. Use **Re-approve**.
- **The state looks edited from a previous run?** **Demo controls → Reset demo data**.
- **Port 3000 is busy?** Stop the other process or set `PORT` before `npm run dev`.
