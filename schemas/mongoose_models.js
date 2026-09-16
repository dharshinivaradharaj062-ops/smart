/**
 * SmartScan Supermarket Self-Checkout Mongoose Schemas (MongoDB)
 * Models: User, Product, Cart, Transaction / Order, AuditLog
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// 1. User Schema (RBAC)
const UserSchema = new Schema({
  fullName: { type: String, required: true, trim: true },
  phoneNumber: { type: String, required: true, unique: true, index: true },
  email: { type: String, sparse: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false },
  role: {
    type: String,
    enum: ['shopper', 'cashier', 'store_manager', 'security_guard', 'admin'],
    default: 'shopper',
    index: true
  },
  assignedStoreId: { type: String, default: 'STORE_MAIN_01' },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date }
}, { timestamps: true });

// 2. Product Schema
const ProductSchema = new Schema({
  barcode: { type: String, required: true, unique: true, index: true },
  sku: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true, index: true },
  brand: { type: String, trim: true },
  description: { type: String },
  unit: { type: String, required: true }, // e.g., '1 Litre', '500g'
  costPrice: { type: Number, required: true, min: 0 },
  sellingPrice: { type: Number, required: true, min: 0 },
  mrp: { type: Number, required: true, min: 0 },
  discountPercent: { type: Number, default: 0, min: 0, max: 100 },
  taxRatePercent: { type: Number, default: 5, min: 0, max: 28 },
  stockQuantity: { type: Number, required: true, default: 0, min: 0 },
  lowStockThreshold: { type: Number, default: 10 },
  imageUrl: { type: String },
  nutrition: { type: String },
  shelfLocation: { type: String },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// 3. Cart Schema
const CartItemSubSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  barcode: { type: String, required: true },
  name: { type: String, required: true },
  unit: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  unitPrice: { type: Number, required: true },
  mrp: { type: Number, required: true },
  taxRatePercent: { type: Number, required: true },
  imageUrl: { type: String }
}, { _id: false });

const CartSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  storeId: { type: String, default: 'STORE_MAIN_01' },
  sessionToken: { type: String, required: true, unique: true },
  status: {
    type: String,
    enum: ['active', 'abandoned', 'converted'],
    default: 'active',
    index: true
  },
  items: [CartItemSubSchema],
  appliedCoupon: {
    code: String,
    discountAmount: Number
  }
}, { timestamps: true });

// 4. Order / Transaction Schema
const OrderItemSubSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  barcode: { type: String, required: true },
  name: { type: String, required: true },
  unit: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true },
  mrp: { type: Number, required: true },
  taxRatePercent: { type: Number, required: true },
  lineTotal: { type: Number, required: true }
}, { _id: false });

const OrderSchema = new Schema({
  orderNumber: { type: String, required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  storeId: { type: String, default: 'STORE_MAIN_01' },
  items: [OrderItemSubSchema],
  subtotal: { type: Number, required: true },
  taxTotal: { type: Number, required: true },
  discountTotal: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  totalSavings: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['pending_payment', 'paid', 'verified_at_gate', 'flagged_audit', 'cancelled'],
    default: 'paid',
    index: true
  },
  payment: {
    method: { type: String, enum: ['upi', 'credit_card', 'debit_card', 'net_banking', 'fast_counter_cash'] },
    transactionRef: String,
    paidAt: { type: Date, default: Date.now }
  },
  exitVerificationToken: { type: String, required: true, unique: true, index: true },
  exitVerifiedAt: { type: Date },
  verifiedByGuardName: { type: String }
}, { timestamps: true });

// 5. Audit Log Schema
const AuditLogSchema = new Schema({
  orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  orderNumber: String,
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  action: {
    type: String,
    enum: ['scan_add', 'scan_remove', 'checkout_initiated', 'payment_completed', 'gate_exit_approved', 'gate_exit_rejected'],
    required: true
  },
  metadata: { type: Schema.Types.Mixed },
  ipAddress: String
}, { timestamps: true });

module.exports = {
  User: mongoose.models.User || mongoose.model('User', UserSchema),
  Product: mongoose.models.Product || mongoose.model('Product', ProductSchema),
  Cart: mongoose.models.Cart || mongoose.model('Cart', CartSchema),
  Order: mongoose.models.Order || mongoose.model('Order', OrderSchema),
  AuditLog: mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema)
};
