-- ============================================================================
-- SmartScan Supermarket Self-Checkout Database Schema (PostgreSQL)
-- Supports Multi-Store, RBAC, Real-time Inventory, Carts, Orders, and Security Exit Verification
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ENUMS
CREATE TYPE user_role_enum AS ENUM ('shopper', 'cashier', 'store_manager', 'security_guard', 'admin');
CREATE TYPE order_status_enum AS ENUM ('pending_payment', 'paid', 'verified_at_gate', 'flagged_audit', 'cancelled', 'refunded');
CREATE TYPE payment_method_enum AS ENUM ('upi', 'credit_card', 'debit_card', 'net_banking', 'fast_counter_cash', 'wallet');
CREATE TYPE payment_status_enum AS ENUM ('initiated', 'processing', 'successful', 'failed', 'refunded');
CREATE TYPE audit_action_enum AS ENUM ('scan_add', 'scan_remove', 'checkout_initiated', 'payment_completed', 'gate_exit_approved', 'gate_exit_rejected');

-- 2. STORES / BRANCHES TABLE
CREATE TABLE IF NOT EXISTS stores (
    store_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_code VARCHAR(20) UNIQUE NOT NULL, -- e.g., 'STORE-DEL-01'
    store_name VARCHAR(150) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    geo_latitude DECIMAL(10, 8),
    geo_longitude DECIMAL(11, 8),
    gstin VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. USERS & AUTHENTICATION TABLE (RBAC)
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(150) NOT NULL,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255), -- Nullable for quick OTP/guest shoppers
    role user_role_enum DEFAULT 'shopper' NOT NULL,
    assigned_store_id UUID REFERENCES stores(store_id) ON DELETE SET NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_role ON users(role);

-- 4. PRODUCT CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS categories (
    category_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name VARCHAR(100) UNIQUE NOT NULL,
    category_slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    tax_rate_percent DECIMAL(5, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. PRODUCTS / CATALOG TABLE
CREATE TABLE IF NOT EXISTS products (
    product_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    barcode VARCHAR(64) UNIQUE NOT NULL, -- EAN-13, UPC-A, Code-128
    sku VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category_id UUID REFERENCES categories(category_id) ON DELETE RESTRICT,
    brand VARCHAR(100),
    description TEXT,
    unit VARCHAR(50) NOT NULL, -- e.g. "1 Litre", "500g", "1 Unit"
    cost_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    selling_price DECIMAL(10, 2) NOT NULL,
    mrp DECIMAL(10, 2) NOT NULL,
    tax_rate_percent DECIMAL(5, 2) DEFAULT 5.00,
    image_url TEXT,
    nutrition_info TEXT,
    shelf_location VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_category ON products(category_id);

-- 6. STORE INVENTORY TABLE (Multi-Store Stock Levels)
CREATE TABLE IF NOT EXISTS store_inventory (
    inventory_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    reserved_quantity INT NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    low_stock_threshold INT NOT NULL DEFAULT 10,
    last_restocked_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_store_product UNIQUE (store_id, product_id)
);

CREATE INDEX idx_inventory_store_product ON store_inventory(store_id, product_id);

-- 7. ACTIVE SHOPPER CARTS TABLE
CREATE TABLE IF NOT EXISTS carts (
    cart_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(30) DEFAULT 'active', -- 'active', 'abandoned', 'converted'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_carts_session ON carts(session_token);
CREATE INDEX idx_carts_user ON carts(user_id);

-- 8. CART ITEMS TABLE
CREATE TABLE IF NOT EXISTS cart_items (
    cart_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id UUID NOT NULL REFERENCES carts(cart_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL,
    unit_mrp DECIMAL(10, 2) NOT NULL,
    tax_rate_percent DECIMAL(5, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_cart_product UNIQUE (cart_id, product_id)
);

-- 9. ORDERS / TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS orders (
    order_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL, -- e.g. 'ORD-20260916-8942'
    cart_id UUID REFERENCES carts(cart_id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(user_id) ON DELETE RESTRICT,
    store_id UUID NOT NULL REFERENCES stores(store_id) ON DELETE RESTRICT,
    subtotal_amount DECIMAL(10, 2) NOT NULL,
    tax_amount DECIMAL(10, 2) NOT NULL,
    discount_amount DECIMAL(10, 2) DEFAULT 0.00,
    total_amount DECIMAL(10, 2) NOT NULL,
    status order_status_enum DEFAULT 'pending_payment' NOT NULL,
    exit_verification_token VARCHAR(255) UNIQUE NOT NULL, -- Cryptographic hash for Security Gate QR
    exit_verified_at TIMESTAMP WITH TIME ZONE,
    verified_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_verification_token ON orders(exit_verification_token);
CREATE INDEX idx_orders_store_date ON orders(store_id, created_at);

-- 10. ORDER ITEMS TABLE (Billed Snapshot)
CREATE TABLE IF NOT EXISTS order_items (
    order_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    product_barcode VARCHAR(64) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    product_unit VARCHAR(50) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_selling_price DECIMAL(10, 2) NOT NULL,
    unit_mrp DECIMAL(10, 2) NOT NULL,
    tax_rate_percent DECIMAL(5, 2) NOT NULL,
    line_total DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);

-- 11. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
    payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    gateway_transaction_id VARCHAR(100),
    payment_method payment_method_enum NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    status payment_status_enum DEFAULT 'initiated' NOT NULL,
    gateway_response JSONB,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_order ON payments(order_id);

-- 12. GATE VERIFICATION & FRAUD AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(order_id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    action audit_action_enum NOT NULL,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_order ON audit_logs(order_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
