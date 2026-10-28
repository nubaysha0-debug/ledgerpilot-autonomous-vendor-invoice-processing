# LedgerPilot · 7–8 Minute Comprehensive Live Demo Script

**Target Business:** Shree Ganesh Electricals & Hardware · Nashik, Maharashtra · GSTIN `27AABCS4821K1Z6` · FY 2026-27  
**As of 27 Oct 2026, 6:40 pm IST.** All data is synthetic. Payments are simulated; no real money moves.  
**Pacing Target:** 7 Minutes 30 Seconds (Designed for 7–8 Minute Stage Walkthrough & Live Software Defense)

---

## Pre-Flight Setup & Confidence Checks (Do 10 Mins Before Stage)

1. **Start the Stack:**
   * **With Docker (Recommended for API story):**
     ```powershell
     docker compose up --build
     # In second terminal:
     npm run dev
     ```
   * **Without Docker / Offline Emergency Fallback:**
     ```powershell
     npm run dev
     ```
     Open `http://localhost:3000/?api=off`.
2. **Pre-Demo Confidence Checks:**
   ```powershell
   npm run check:ledger   # 116/116 data consistency assertions PASS
   npm run check:import   # 77/77 CSV and GST assertions PASS
   npm run lint           # TypeScript 0 errors PASS
   ```
3. **Reset State:** Open `http://localhost:3000`. Click **Demo controls** (bottom-left) → **Reset demo data** → Confirm.  
   *Verify initial state:* Ramesh Patil (Owner) active, ₹3,83,870 open payables, 4 exceptions.

---

## ⏱️ Live Demonstration Timeline (0:00 – 7:30)

```
0:00 ──────────────── 1:30 ──────────────── 3:00 ──────────────── 4:30 ──────────────── 5:45 ──────────────── 6:45 ──────── 7:30
  [Overview & Kpis]       [4 Exception Checks]    [Maker-Checker Flow]    [Stale Fingerprint]     [Failure & Audit]       [Data & Close]
```

---

### PHASE 1 · Overview & Working Capital Control Room (0:00 – 1:30)
**Screen:** Overview Dashboard (`http://localhost:3000`). Active role: **Ramesh Patil (Owner)**.

* **[0:00 – 0:45 · The Reality of the Shop]**
  * **Operator Action:** Hover mouse over the shop name in the top left: *Shree Ganesh Electricals & Hardware, Nashik*.
  * **Speaker Says:**  
    > *"Good morning, respected judges.  
    > What you are looking at on screen is LedgerPilot running live for a retail electrical and hardware business in Nashik, Maharashtra.  
    > They deal with 30+ repeat distributors—Havells, Polycab, Legrand, Crompton. They stock cables, modular switches, and switchgear.  
    > Notice the prominent top banner: **'DEMO - Payments are simulated. No money is transferred.'** Every payment screen and API payload carries this label because our project is dedicated strictly to financial controls and pre-payment reconciliation."*

* **[0:45 – 1:30 · The 4 Control KPIs & Ageing Buckets]**
  * **Operator Action:** Point cursor at each of the 4 top KPI cards in order.
  * **Speaker Says:**  
    > *"Look at our primary financial control tiles:  
    > • **₹3,83,870 Total Open Payables** — reconciled across 11 active invoices in our PostgreSQL database.  
    > • **₹1,01,088 Overdue Amount** across four bills—critical for an owner whose distributor credit lines freeze if bills exceed 30 days.  
    > • **₹11,151 Due in Next 7 Days** — enabling weekly cash flow predictability.  
    > • And here is our core value proposition: **4 Critical Blocking Exceptions** caught by our engine before money moves.  
    >  
    > Scroll down slightly: our Ageing Breakdown groups liabilities into 0–30 days, 31–60 days, and 60+ days. Every single tile reconciles to the database to the exact paisa. Now let's see how our engine catches leaks."*

---

### PHASE 2 · Deep Dive: Evidence-Backed Exceptions (1:30 – 3:00)
**Screen:** Invoices List & Invoice Drawer.

* **[1:30 – 2:15 · Exception 1: Sharma Hardware ₹135 GST Math Gap]**
  * **Operator Action:** Click **Review exceptions** (or navigate to Invoices filtered by *Needs review*). Open **Sharma Hardware & Tools (`Sharma/26-27/0412`)**.
  * **Speaker Says:**  
    > *"Let’s inspect our first exception: **Sharma Hardware & Tools**.  
    > The printed invoice states ₹21,995. But LedgerPilot recalculates every single line item—twenty sets of Bosch impact drill bits at ₹932—adds the 18% GST (9% CGST + 9% SGST), and calculates ₹22,130. That is a **₹135 mathematical calculation gap**.  
    >  
    > We deliberately do NOT use an LLM for invoice totals. LLMs are probabilistic; accounting is deterministic. Using AI to sum invoices in production is financial malpractice. We use integer-paise deterministic code for totals, and AI strictly for entity extraction and plain-English explanations.  
    > Notice: the **'Record payment' button is physically disabled**. An accountant cannot disburse money against a flawed invoice."*
  * **Operator Action:** Click the **Invoice document** tab inside the drawer.
  * **Speaker Says:**  
    > *"Clicking 'Invoice document' displays the authentic Indian Tax Invoice format: vendor GSTIN, HSN codes, Place of Supply, and amount in words. The original bill and the extracted fields stay permanently linked."*

* **[2:15 – 3:00 · Exceptions 2, 3, & 4: Duplicates, Banks, and POs]**
  * **Operator Action:** Close drawer. Open **Sahyadri Switchgear (`Sahyadri/26-27/0771`)**.
  * **Speaker Says:**  
    > *"Exception two: **Sahyadri Switchgear**. A duplicate PDF bill arrived on WhatsApp. Our database matched the vendor, bill number, and amount. It is stamped with a bold **`DUPLICATE COPY`** watermark and excluded from open payables so the owner never double-pays."*
  * **Operator Action:** Close drawer. Open **Nashik Lighting House (`NLH/26-27/0288`)**.
  * **Speaker Says:**  
    > *"Exception three: **Nashik Lighting House**. The vendor's bank account changed from HDFC ending 6614 to ICICI ending 7719 on 25 October. Payouts are locked until the proprietor verifies it by phone."*
  * **Operator Action:** Close drawer. Open **Om Sai Electricals (`OSE/26-27/0507`)**.
  * **Speaker Says:**  
    > *"Exception four: **Om Sai Electricals**. This ₹32,804 bill exceeds the shop's ₹25,000 Purchase Order threshold without an approved PO linked. It is flagged as a warning requiring owner override."*

---

### PHASE 3 · Maker-Checker Governance Flow (3:00 – 4:30)
**Screen:** Role Switcher, Invoices, and Payments Queue.

* **[3:00 – 3:45 · Sunita (Accountant) Records a ₹2,500 Partial Payment]**
  * **Operator Action:** In the top header, switch **Acting as** from Ramesh (Owner) to **Sunita · accountant**.
  * **Operator Action:** Go to **Invoices** tab. Open **ABC Electricals Pvt Ltd (`ABC/26-27/0184`)**.
  * **Speaker Says:**  
    > *"Now let’s demonstrate institutional maker-checker governance.  
    > Sunita is our counter accountant. She opens ABC Electricals. The total bill is **₹12,500**, with **₹5,000** already paid, leaving **₹7,500 available balance**."*
  * **Operator Action:** Click **Record payment**. Type `2500.00`, keep NEFT mode and reference, and click **Record request**.
  * **Speaker Says:**  
    > *"Sunita records a request for ₹2,500.  
    > Notice: Sunita is a maker. She **cannot approve** the request, and she **cannot execute** the transfer. Her job is strictly recording."*

* **[3:45 – 4:30 · Ramesh (Owner) Approves and Executes Simulated NEFT]**
  * **Operator Action:** Close drawer. In the header, switch role to **Ramesh · owner**.
  * **Operator Action:** Click the **Payments** tab in the sidebar.
  * **Speaker Says:**  
    > *"Now Ramesh, the shop proprietor, logs in. He navigates to the Payments queue.  
    > In his **Awaiting Owner Approval** queue, Sunita’s ₹2,500 request appears with her timestamp and reference."*
  * **Operator Action:** Click **Approve** → Confirm **Approve payment**. Then click **Execute** → Confirm **Execute simulation**.
  * **Speaker Says:**  
    > *"Ramesh inspects the request and approves it. Then he clicks Execute.  
    > A simulated NEFT transaction ID is generated (`MOCK-NEFT-20261027-XXXXXX`).  
    > Now look at ABC Electricals: **₹7,500 available has dropped to exactly ₹5,000 remaining due**. The partial payment is settled to the paisa."*

---

### PHASE 4 · The Mic-Drop: Live Stale Approval Invalidation (4:30 – 5:45)
**Screen:** Invoices → Prime Solar Solutions (`PSS/26-27/0121`).

* **[4:30 – 5:10 · The Post-Approval Tamper Vulnerability]**
  * **Operator Action:** Go to **Invoices**. Open **PSS/26-27/0121** (Prime Solar Solutions, ₹1,39,240, status Approved).
  * **Speaker Says:**  
    > *"Now watch what happens when an invoice is tampered with post-approval.  
    > **Prime Solar Solutions** is currently in 'Approved' state. Ramesh already authorized ₹1,39,240.  
    > But imagine the vendor sends a revised invoice ten minutes later, slipping in an extra ₹500 for freight."*

* **[5:10 – 5:45 · The Live Invalidation Moment]**
  * **Operator Action:** Scroll down to Payment requests. Click **Record supplier revision** → Confirm **Add revision**. Scroll back up to the top of the drawer.
  * **Speaker Says:**  
    > *"Watch the screen closely as I apply the ₹500 revision:  
    > Look at that: the approval status immediately flips to **STALE**.  
    > The 'Execute' button physically vanished and was replaced with **'Re-approve'**!  
    >  
    > Why did this happen? Because when Ramesh approved the invoice, our engine computed a SHA-256 cryptographic fingerprint covering the invoice total, version, vendor ID, and bank account. When the bill changed by even ₹500, the fingerprint broke.  
    > That is the difference between a superficial UI button and real financial control."*
  * **Operator Action:** Click **Re-approve** → Confirm **Re-approve payment** to show the fingerprint being refreshed and restoring the Execute button.

---

### PHASE 5 · Failure Recovery, Idempotency & Audit Trail (5:45 – 6:45)
**Screen:** Demo Controls, Payments Queue, and Audit View.

* **[5:45 – 6:15 · Forced Gateway Failure & Safe Retry]**
  * **Operator Action:** Click **Demo controls** (bottom-left). Toggle **Force the next simulated transfer to fail** ON. Close modal.
  * **Operator Action:** Go to **Payments**. Find Deccan Power Tools (`DPT/26-27/0559`, ₹36,816, Approved). Click **Execute** → Confirm.
  * **Speaker Says:**  
    > *"What happens when a network drops mid-transfer? We just forced a simulated gateway failure.  
    > Notice: the payment moved to **Failed** with the exact gateway error message recorded.  
    > Now watch the retry: I click **Retry** → **Authorise retry** → **Execute**.  
    > The retry succeeds, reusing the exact same payment reference. No duplicate transfer is created."*

* **[6:15 – 6:45 · Tamper-Evident Audit Trail]**
  * **Operator Action:** Click **Audit trail** in the sidebar (`AuditView.tsx`).
  * **Speaker Says:**  
    > *"Every single action we just performed—Sunita recording ₹2,500, Ramesh approving, the simulated NEFT execution, the Prime Solar revision, and the failed Deccan retry—is permanently logged here in our Audit Trail.  
    > In PostgreSQL, we wrote a custom database trigger that explicitly **blocks `UPDATE` and `DELETE` on the `audit_logs` table**. Even if a malicious actor has raw database access, historical audit events cannot be altered or purged."*

---

### PHASE 6 · Live Data Console, Offline Safety Net & Close (6:45 – 7:30)
**Screen:** Data View (`DataView.tsx`) & Closing.

* **[6:45 – 7:10 · The Live Judge Challenge & Offline Fallback]**
  * **Operator Action:** Click **Data** in the sidebar. Show the CSV Templates and Backup/Restore buttons.
  * **Speaker Says:**  
    > *"Judges, we did not hardcode a rigid script. In our **Data** console, you can download starter CSV templates, import your own custom vendor bills, or export a complete JSON backup. If any judge wants to test custom invoice numbers live, we can import them in thirty seconds.  
    >  
    > Furthermore, notice our architecture badge. We are currently backed by our relational PostgreSQL database and FastAPI server. But if conference Wi-Fi cuts out right now, we append `?api=off` and the entire console runs offline on our browser-local deterministic engine with zero downtime."*

* **[7:10 – 7:30 · The Closing One-Liner]**
  * **Operator Action:** Click **Demo controls** → Click **Reset demo data** → Confirm (restoring initial state cleanly in 1 second).
  * **Speaker Says:**  
    > *"31 out of 31 acceptance tests pass. 116 ledger consistency checks pass.  
    > Large enterprises spend crores on SAP and Coupa for maker-checker financial controls.  
    > **LedgerPilot brings institutional-grade payment governance, evidence-backed discrepancy detection, and working capital protection to the 63 million small retail businesses that power India.**  
    >  
    > Thank you. We welcome your questions."*

---

## 📊 Quick Numbers Cheat Sheet for the Demo Operator

| Action Item | Exact Bill Number | Expected Display Value |
|---|---|---|
| **Overview Total Payables** | *All 11 invoices* | **₹3,83,870.00** |
| **Overdue Total** | *4 overdue bills* | **₹1,01,088.00** |
| **Sharma Hardware Math Discrepancy** | `Sharma/26-27/0412` | Printed **₹21,995** vs Computed **₹22,130** (**₹135 gap**) |
| **Sahyadri Switchgear Duplicate** | `Sahyadri/26-27/0771` | Marked with bold **`DUPLICATE COPY`** watermark |
| **Nashik Lighting Bank Change** | `NLH/26-27/0288` | HDFC `****6614` → ICICI `****7719` (Phone verify required) |
| **Om Sai Missing PO** | `OSE/26-27/0507` | ₹32,804 bill exceeds ₹25,000 PO threshold |
| **ABC Electricals Maker-Checker** | `ABC/26-27/0184` | Total ₹12,500; record ₹2,500 request; drops balance to **₹5,000** |
| **Prime Solar Stale Invalidation** | `PSS/26-27/0121` | Approved ₹1,39,240; add ₹500 revision → status becomes **STALE** |
| **Deccan Power Failure & Retry** | `DPT/26-27/0559` | ₹36,816; forced failure lands in Failed; retry settles cleanly |

---

## 🛡️ 8 Tough Judge Questions & Bulletproof Answers

#### 1. "Why simulated payments instead of real UPI or Razorpay?"
> *"Connecting a payment API like RazorpayX or Cashfree is standard REST plumbing. The hard, high-value problem in MSME accounting is **what happens BEFORE money moves**: verifying line-item arithmetic, checking that bank details haven’t been tampered with, preventing duplicate submissions, and enforcing maker-checker approval separation. Simulating execution keeps the hackathon legally safe, compliant, and focused on financial governance."*

#### 2. "Can an accountant delete or alter audit logs to hide fraud?"
> *"No. In our PostgreSQL migration `006_audit.sql`, we wrote a database trigger that explicitly **blocks `UPDATE` and `DELETE` on the `audit_logs` table**. Even if someone has raw database credentials, the audit trail is strictly append-only."*

#### 3. "How do you prevent double payments on network retry?"
> *"Every payment requires an `Idempotency-Key` and uses `SELECT ... FOR UPDATE` row locks in PostgreSQL. In acceptance test `T20`, we threw 10 parallel execute requests simultaneously: exactly 1 succeeded in executing the debit, and 9 safely replayed the original mock transaction reference without double-charging."*

#### 4. "Why not let an LLM calculate invoice totals?"
> *"LLMs are probabilistic token predictors; accounting is exact, deterministic mathematics. If an LLM is 99% accurate, 1 out of 100 bills has hallucinated numbers. We use deterministic integer-paise math in PostgreSQL and TypeScript for calculations, and reserve AI strictly for document parsing and plain-English explanations."*

#### 5. "What happens if conference Wi-Fi cuts out right now?"
> *"Our console features a dual-engine architecture. It probes `GET /api/health` at boot. If the server or Wi-Fi drops, or if you append `?api=off`, it seamlessly falls back to our browser-local deterministic engine with zero downtime."*

#### 6. "How does this compare to Tally Prime or Vyapar?"
> *"Tally and Vyapar are after-the-fact bookkeeping tools—we do not replace them. But Tally does not provide real-time maker-checker approval separation for counter staff, it does not dynamically invalidate approvals when bills change, and it does not stop duplicate payments before money moves. LedgerPilot is the active pre-payment governance shield."*

#### 7. "How do you make money (Business Model)?"
> *"A tiered B2B SaaS model: ₹499/month for single-counter retailers to check bills and stop duplicate payments; ₹1,499/month for multi-seat wholesalers requiring multi-accountant maker-checker approval workflows and audit trails."*

#### 8. "What is your next roadmap milestone?"
> *"Phase 2: Direct WhatsApp bill intake so suppliers can submit invoice PDFs directly to a WhatsApp bot, paired with live GSTR-2B Input Tax Credit reconciliation to ensure GST compliance before releasing payment."*
