# SmartScan Supermarket Suite

Next-generation supermarket retail suite split into **two independent, modular web applications**:

1. **Shopper Mobile App (`/shopper-app`)** — Customer self-scanning mobile web app (PWA) with camera barcode scanner, live interactive cart, itemized GST calculation, coupon discounts, digital payments (UPI QR / Card / Fast Express Counter), and cryptographic exit gate pass QR generation.
2. **Manager & Security Operations Portal (`/manager-app`)** — Store manager inventory management hub (full SKU CRUD, stock adjustments, low stock alerts, CSV export, printable shelf tags) and Security Guard exit gate QR scanner with duplicate exit protection and physical bag audit checklist.

---

## 📁 Project Architecture

```
smart-scan/
├── shopper-app/                  # 📱 CUSTOMER MOBILE SELF-SCANNING APP
│   ├── .env                      # Shopper environment variables (PORT 3001, secrets)
│   ├── .env.example              # Template config
│   ├── package.json              # Express & backend dependencies
│   ├── server.js                 # Shopper Express API Backend
│   ├── index.html                # Shopper Mobile PWA Interface
│   ├── styles.css                # Mobile-first glassmorphic theme
│   ├── scanner.js                # Barcode camera & upload engine
│   ├── app.js                    # Shopper client controller
│   ├── manifest.json & sw.js     # PWA offline & installation support
│   └── data/
│       └── sample_products.json  # Store catalog dataset
│
├── manager-app/                  # 👔 STORE MANAGER & GUARD PORTAL
│   ├── .env                      # Manager credentials & portal config (PORT 3002)
│   ├── .env.example              # Template config
│   ├── package.json              # Express & backend dependencies
│   ├── server.js                 # Manager & Guard API Backend
│   ├── index.html                # Operations & Security Portal Interface
│   ├── styles.css                # Admin dark dashboard design system
│   ├── scanner.js                # Guard Exit Gate QR scanner engine
│   ├── app.js                    # Manager portal client controller
│   ├── shelf_tags.html           # Printable barcode shelf label tags
│   └── data/
│       └── sample_products.json  # Catalog inventory database
│
└── README.md                     # Documentation
```

---

## 🚀 Quick Start & How to Run

### 1. Run the Shopper Mobile App (Customer)

Open a terminal and run:

```bash
cd shopper-app
npm install
npm start
```

- **URL:** [http://localhost:3001](http://localhost:3001)
- **Default Demo Credentials (.env):**
  - **Phone / User ID:** `9876543210`
  - **Password:** `shopper123`
  - *(Or choose Quick Guest to start immediately)*

---

### 2. Run the Store Manager & Guard Portal (Admin)

Open a second terminal and run:

```bash
cd manager-app
npm install
npm start
```

- **URL:** [http://localhost:3002](http://localhost:3002)
- **Printable Shelf Barcode Tags:** [http://localhost:3002/shelf_tags.html](http://localhost:3002/shelf_tags.html)
- **Default Credentials (.env):**
  - **Manager Login:** Username: `admin` | Password: `SmartStore@2026`
  - **Manager Quick PIN:** `1234`
  - **Security Guard PIN:** `5678`

---

## ⚙️ Environment Variables Configuration (.env)

### `shopper-app/.env`
| Key | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Server port | `3001` |
| `STORE_ID` | Supermarket store branch ID | `STORE_104` |
| `JWT_SECRET` | Cryptographic signing secret for exit tokens | `smartscan_shopper_secure_jwt_token_2026` |
| `DEFAULT_SHOPPER_PHONE` | Demo customer login phone | `9876543210` |
| `DEFAULT_SHOPPER_PASSWORD`| Demo customer password | `shopper123` |
| `UPI_MERCHANT_ID` | UPI ID for checkout QR | `smartscan.store104@icici` |
| `VALID_PROMO_CODES` | Discount coupons mapping | `SMART10:10,SAVE50:50,WELCOME20:20` |

### `manager-app/.env`
| Key | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Server port | `3002` |
| `MANAGER_USERNAME` | Manager portal username | `admin` |
| `MANAGER_PASSWORD` | Secure manager password | `SmartStore@2026` |
| `MANAGER_PIN` | Quick unlock 4-digit PIN | `1234` |
| `GUARD_PIN` | Security guard gate access PIN | `5678` |
| `GUARD_NAME` | Security officer name | `Officer Singh` |
| `DEFAULT_LOW_STOCK_THRESHOLD` | Threshold for restock alert | `10` |
