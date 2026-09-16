# ⚡ SmartScan — Supermarket Self-Checkout PWA & Operations Suite

> Next-Generation Progressive Web App (PWA) and Store Operations Platform designed to completely eliminate retail supermarket checkout queues through customer mobile self-scanning, real-time GST taxation, instant UPI/Card digital payments, and cryptographic security exit gate verification.

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    subgraph "Shopper Client (Mobile PWA)"
        A[Store Entry / Guest Login] --> B[Camera Barcode Scanner]
        B -->|Scan Barcode| C[Live Product Detection Card]
        C -->|Add to Cart| D[Interactive Cart & GST Engine]
        D -->|Checkout| E[Mock Payment Gateway / Fast Counter]
        E -->|Success| F[Tamper-Proof Exit QR & Digital Invoice]
    end

    subgraph "Security & Store Admin (Desktop / Tablet)"
        G[Exit Gate Scanner] -->|Scan Exit QR| H[Gate Verification & Bag Audit Engine]
        I[Catalog & Stock Manager] -->|CRUD & CSV Import| J[Inventory DB / Real-time Stock]
        K[Sales & Cart Monitor] -->|Live Activity| L[Analytics & Peak Hour Metrics]
    end

    subgraph "Backend API & Database"
        M[Node.js / Express REST API]
        N[(PostgreSQL / MongoDB / In-Memory Store)]
        M <--> N
    end

    Shopper Client <-->|REST API / Service Worker| Backend API & Database
    Security & Store Admin <-->|REST API| Backend API & Database
```

---

## 🚀 Key Features

### 🛍️ Domain 1: Shopper Mobile Portal
1. **Zero-App-Download Quick Onboarding**: Instant guest session via full name and mobile number.
2. **HTML5 Barcode Engine**:
   - High-speed real-time decoding with dedicated laser guide viewfinder.
   - Built-in Web Audio API synthesizer for the supermarket checkout chime + haptic vibration.
   - Flashlight / Torch toggle and front/back camera flipping.
3. **Live Product Detection Card**:
   - Displays real-time product image, category, brand, weight/unit, discount savings, and live in-store stock levels.
   - Quantity stepper (`+` / `-`) with stock threshold constraints.
4. **Interactive Cart & Smart Taxation**:
   - Itemized cart with live quantity updates and deletion.
   - Real-time GST calculation (0%, 5%, 12%, 18%), item discounts, and promo code support (`SMART10`, `SAVE50`, `WELCOME`).
5. **Instant Digital Checkout & Anti-Tamper Exit Pass**:
   - Multi-option payment modal: UPI QR (GPay / PhonePe / Paytm), Credit/Debit Card, and Fast Cash Counter Slip.
   - Generates a **tamper-proof digital invoice** containing an animated security watermark, dynamic timestamp, and cryptographically signed QR code.

---

### 👔 Domain 2: Manager & Admin Dashboard
1. **Catalog & Inventory CRUD**:
   - Search by EAN-13, name, brand, or category.
   - "Add New SKU" modal with built-in barcode auto-generator.
   - Real-time inline stock and price adjusters.
   - CSV / JSON export for store accounting.
2. **Real-Time Stock Reduction**:
   - Automatic inventory deduction upon customer checkout.
   - Visual alerts for Low Stock (< 10 units) and Out of Stock.
3. **Live Cart & Transaction Monitor**:
   - Live stream of all in-store carts and settled orders.
4. **🛡️ Security Guard Exit Gate Scanner & Bag Audit**:
   - Dedicated exit gate verification tool.
   - Scans customer's exit QR code, validates cryptographic signature, and flags counterfeit or already-exited passes.
   - Provides an item checklist for quick physical bag audits.
5. **Store Analytics & Peak Hour Traffic**:
   - Real-time revenue metrics, average basket size, peak shopping hour chart, and bestseller leaderboards.

---

## 📂 Project Structure

```
smart scan/
├── index.html                  # Mobile-first PWA shell & responsive interface
├── styles.css                  # Modern dark glassmorphic design system
├── app.js                      # Reactive client application logic & state engine
├── scanner.js                  # HTML5 barcode engine, audio synthesizers, camera controls
├── shelf_tags.html             # Printable shelf price tags with scannable EAN-13 barcodes
├── manifest.json               # Progressive Web App manifest
├── sw.js                       # PWA Service Worker for offline asset caching
├── server.js                   # Production Node.js & Express REST API backend
├── package.json                # Server dependencies & scripts
├── data/
│   └── sample_products.json    # Rich mock supermarket dataset (8 real SKUs)
├── schemas/
│   ├── schema.sql              # Complete PostgreSQL relational database schema
│   └── mongoose_models.js      # Complete MongoDB Mongoose models
└── README.md                   # System documentation & setup guide
```

---

## 🗄️ Database Schemas

### 1. PostgreSQL Schema (`schemas/schema.sql`)
Includes tables with indexes, foreign key constraints, and enums:
- `users`: User profiles with RBAC (`shopper`, `cashier`, `store_manager`, `security_guard`, `admin`).
- `stores`: Multi-store branch locations, addresses, and GSTIN.
- `categories`: Product classifications and tax bands.
- `products`: Barcodes (EAN-13/UPC), SKUs, units, cost & selling prices.
- `store_inventory`: Real-time stock counts, reserved stock, and reorder thresholds.
- `carts` & `cart_items`: Active shopper sessions.
- `orders` & `order_items`: Billed snapshots, payment statuses, and exit tokens.
- `payments`: UPI, Card, Net Banking transaction logs.
- `audit_logs`: Security gate clearance and fraud audit history.

### 2. MongoDB Mongoose Models (`schemas/mongoose_models.js`)
- `User`, `Product`, `Cart`, `Order`, `AuditLog`.

---

## 📷 Camera Permissions & Security Guide

### 1. HTTPS / Localhost Requirement
Modern web browsers (Chrome, Safari, Edge, Firefox) enforce strict security policies:
- `navigator.mediaDevices.getUserMedia` is **only accessible in Secure Contexts (`https://` or `localhost` / `127.0.0.1`)**.
- When deploying to production, ensure SSL certificates are enabled.

### 2. iOS Safari Considerations
- iOS Safari requires user interaction before activating video streams.
- Ensure camera permissions are set to "Allow" in Safari Settings -> Camera.

### 3. Built-In Testing Aids
- **Quick Simulator Bar**: A top strip with 1-click test scan chips for all products.
- **[Printable Shelf Tags](shelf_tags.html)**: Generates SVG barcodes you can point your physical smartphone camera at!

---

## 🛠️ Quick Start Guide

### Option 1: Direct In-Browser Execution
Simply open [`index.html`](file:///d:/smart%20scan/index.html) in any modern browser (Chrome, Edge, Safari, Firefox). The application runs with built-in client persistence and simulation tools.

### Option 2: Run with Node.js & Express
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open `http://localhost:3000` in your mobile or desktop browser.

---

## 🔒 Security & Anti-Theft Verification

SmartScan protects store inventory with multi-layer verification:
1. **Unique Order Signature**: The exit QR code encodes a SHA-256 HMAC of the order number, total amount, customer phone, and store secret.
2. **Single-Exit Enforcement**: Once an exit pass is scanned at the security gate, its state transitions to `verified_at_gate`. Subsequent scan attempts trigger an **`ALREADY_EXITED`** security alert.
3. **Bag Audit Checklist**: Guard scanners display an instant checklist of billed items to cross-verify high-value physical goods.
