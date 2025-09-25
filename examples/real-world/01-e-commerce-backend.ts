/**
 * E-Commerce Backend Example
 * 
 * A complete e-commerce backend implementation showing:
 * - User management
 * - Product catalog
 * - Shopping cart
 * - Order processing
 * - Inventory management
 * - Payment handling
 * - Analytics
 */

import { DBBridge } from '@db-bridge/core';

class ECommerceBackend {
  private db: DBBridge;
  private cache: DBBridge;

  constructor(db: DBBridge, cache: DBBridge) {
    this.db = db;
    this.cache = cache;
  }

  // User Management
  async registerUser(userData: {
    email: string;
    password: string; // Should be hashed
    name: string;
    phone?: string;
  }) {
    // Check if email exists
    const existing = await this.db.table('users')
      .where('email', userData.email)
      .first();
    
    if (existing) {
      throw new Error('Email already registered');
    }

    // Create user
    const userId = await this.db.table('users').insert({
      ...userData,
      created_at: new Date(),
      email_verified: false,
      status: 'active'
    });

    // Create default settings
    await this.db.table('user_settings').insert({
      user_id: userId,
      currency: 'USD',
      language: 'en',
      notifications: {
        email: true,
        sms: false,
        push: true
      }
    });

    // Send verification email (mock)
    await this.sendVerificationEmail(userData.email);

    return userId;
  }

  async loginUser(email: string, password: string) {
    const user = await this.db.table('users')
      .where('email', email)
      .where('password', password) // Should compare hashed
      .where('status', 'active')
      .first();

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Create session
    const sessionId = this.generateSessionId();
    const redis = this.cache.getAdapter() as any;
    
    await redis.set(
      `session:${sessionId}`,
      JSON.stringify({
        userId: user.id,
        email: user.email,
        name: user.name,
        loginTime: new Date()
      }),
      3600 * 24 // 24 hours
    );

    // Update last login
    await this.db.table('users')
      .where('id', user.id)
      .update({ last_login: new Date() });

    return { sessionId, user };
  }

  // Product Management
  async getProducts(filters: {
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    search?: string;
    inStock?: boolean;
    page?: number;
    perPage?: number;
  }) {
    const { page = 1, perPage = 20 } = filters;
    const redis = this.cache.getAdapter() as any;
    
    // Try cache first
    const cacheKey = `products:${JSON.stringify(filters)}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Build query
    let query = this.db.table('products').where('active', true);

    if (filters.category) {
      query = query.where('category_id', filters.category);
    }
    if (filters.minPrice !== undefined) {
      query = query.where('price', '>=', filters.minPrice);
    }
    if (filters.maxPrice !== undefined) {
      query = query.where('price', '<=', filters.maxPrice);
    }
    if (filters.inStock) {
      query = query.where('stock_quantity', '>', 0);
    }
    if (filters.search) {
      query = query.whereRaw(
        'MATCH(name, description) AGAINST(? IN NATURAL LANGUAGE MODE)',
        [filters.search]
      );
    }

    // Get total count
    const totalCount = await query.count();

    // Get paginated results
    const products = await query
      .select('id', 'name', 'slug', 'price', 'sale_price', 'image_url', 'rating', 'review_count')
      .orderBy('popularity_score', 'desc')
      .limit(perPage)
      .offset((page - 1) * perPage)
      .get();

    const result = {
      products,
      pagination: {
        page,
        perPage,
        total: totalCount,
        pages: Math.ceil(totalCount / perPage)
      }
    };

    // Cache for 5 minutes
    await redis.set(cacheKey, JSON.stringify(result), 300);

    return result;
  }

  async getProductDetails(productId: number) {
    const product = await this.db.query(`
      SELECT 
        p.*,
        c.name as category_name,
        c.slug as category_slug,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', pi.id,
            'url', pi.image_url,
            'alt', pi.alt_text,
            'is_primary', pi.is_primary
          )
        ) as images
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_images pi ON p.id = pi.product_id
      WHERE p.id = ? AND p.active = true
      GROUP BY p.id
    `, [productId]);

    if (!product.rows.length) {
      throw new Error('Product not found');
    }

    // Get related products
    const related = await this.getRelatedProducts(productId, product.rows[0].category_id);

    // Get reviews summary
    const reviews = await this.getProductReviews(productId, { limit: 5 });

    // Track view
    await this.trackProductView(productId);

    return {
      product: product.rows[0],
      related,
      reviews
    };
  }

  // Shopping Cart
  async addToCart(userId: number, productId: number, quantity: number) {
    // Validate product and stock
    const product = await this.db.table('products')
      .where('id', productId)
      .where('active', true)
      .first();

    if (!product) {
      throw new Error('Product not found');
    }

    if (product.stock_quantity < quantity) {
      throw new Error('Insufficient stock');
    }

    // Get or create cart
    let cart = await this.db.table('carts')
      .where('user_id', userId)
      .where('status', 'active')
      .first();

    if (!cart) {
      const cartId = await this.db.table('carts').insert({
        user_id: userId,
        status: 'active',
        created_at: new Date()
      });
      cart = { id: cartId };
    }

    // Add or update cart item
    const existingItem = await this.db.table('cart_items')
      .where('cart_id', cart.id)
      .where('product_id', productId)
      .first();

    if (existingItem) {
      await this.db.table('cart_items')
        .where('id', existingItem.id)
        .update({
          quantity: existingItem.quantity + quantity,
          updated_at: new Date()
        });
    } else {
      await this.db.table('cart_items').insert({
        cart_id: cart.id,
        product_id: productId,
        quantity: quantity,
        price: product.sale_price || product.price,
        created_at: new Date()
      });
    }

    // Update cart totals
    await this.updateCartTotals(cart.id);

    return this.getCart(userId);
  }

  async getCart(userId: number) {
    const cart = await this.db.query(`
      SELECT 
        c.id,
        c.subtotal,
        c.tax_amount,
        c.shipping_amount,
        c.discount_amount,
        c.total,
        c.coupon_code,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', ci.id,
            'product_id', p.id,
            'product_name', p.name,
            'product_slug', p.slug,
            'product_image', p.image_url,
            'quantity', ci.quantity,
            'price', ci.price,
            'subtotal', ci.quantity * ci.price,
            'in_stock', p.stock_quantity >= ci.quantity
          )
        ) as items
      FROM carts c
      LEFT JOIN cart_items ci ON c.id = ci.cart_id
      LEFT JOIN products p ON ci.product_id = p.id
      WHERE c.user_id = ? AND c.status = 'active'
      GROUP BY c.id
    `, [userId]);

    return cart.rows[0] || { items: [] };
  }

  // Order Processing
  async createOrder(userId: number, orderData: {
    shipping_address: any;
    billing_address: any;
    payment_method: string;
    shipping_method: string;
  }) {
    return await this.db.transaction(async (trx) => {
      // Get cart
      const cart = await trx.table('carts')
        .where('user_id', userId)
        .where('status', 'active')
        .first();

      if (!cart || !cart.total) {
        throw new Error('Cart is empty');
      }

      // Create order
      const orderId = await trx.table('orders').insert({
        user_id: userId,
        order_number: this.generateOrderNumber(),
        status: 'pending',
        subtotal: cart.subtotal,
        tax_amount: cart.tax_amount,
        shipping_amount: cart.shipping_amount,
        discount_amount: cart.discount_amount,
        total: cart.total,
        shipping_address: JSON.stringify(orderData.shipping_address),
        billing_address: JSON.stringify(orderData.billing_address),
        payment_method: orderData.payment_method,
        shipping_method: orderData.shipping_method,
        created_at: new Date()
      });

      // Copy cart items to order items
      const cartItems = await trx.table('cart_items')
        .where('cart_id', cart.id)
        .get();

      for (const item of cartItems) {
        // Create order item
        await trx.table('order_items').insert({
          order_id: orderId,
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price,
          subtotal: item.quantity * item.price
        });

        // Update inventory
        await trx.table('products')
          .where('id', item.product_id)
          .decrement('stock_quantity', item.quantity);

        // Update product sales count
        await trx.table('products')
          .where('id', item.product_id)
          .increment('sales_count', item.quantity);
      }

      // Process payment
      const paymentResult = await this.processPayment({
        orderId,
        amount: cart.total,
        method: orderData.payment_method
      });

      // Update order with payment info
      await trx.table('orders')
        .where('id', orderId)
        .update({
          payment_status: paymentResult.success ? 'paid' : 'failed',
          payment_reference: paymentResult.reference,
          status: paymentResult.success ? 'confirmed' : 'payment_failed'
        });

      if (!paymentResult.success) {
        throw new Error('Payment failed');
      }

      // Clear cart
      await trx.table('cart_items').where('cart_id', cart.id).delete();
      await trx.table('carts').where('id', cart.id).update({ status: 'converted' });

      // Send order confirmation
      await this.sendOrderConfirmation(orderId);

      return orderId;
    });
  }

  // Analytics
  async getDashboardStats(dateRange: { start: Date; end: Date }) {
    const stats = await this.db.query(`
      SELECT 
        COUNT(DISTINCT o.id) as total_orders,
        COUNT(DISTINCT o.user_id) as unique_customers,
        SUM(o.total) as total_revenue,
        AVG(o.total) as average_order_value,
        SUM(oi.quantity) as total_items_sold
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.created_at BETWEEN ? AND ?
        AND o.status NOT IN ('cancelled', 'refunded')
    `, [dateRange.start, dateRange.end]);

    const topProducts = await this.db.query(`
      SELECT 
        p.id,
        p.name,
        SUM(oi.quantity) as units_sold,
        SUM(oi.subtotal) as revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      WHERE o.created_at BETWEEN ? AND ?
        AND o.status NOT IN ('cancelled', 'refunded')
      GROUP BY p.id
      ORDER BY revenue DESC
      LIMIT 10
    `, [dateRange.start, dateRange.end]);

    const revenueByDay = await this.db.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as orders,
        SUM(total) as revenue
      FROM orders
      WHERE created_at BETWEEN ? AND ?
        AND status NOT IN ('cancelled', 'refunded')
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [dateRange.start, dateRange.end]);

    return {
      summary: stats.rows[0],
      topProducts: topProducts.rows,
      revenueChart: revenueByDay.rows
    };
  }

  // Helper methods
  private async updateCartTotals(cartId: number) {
    const totals = await this.db.query(`
      SELECT 
        SUM(quantity * price) as subtotal,
        COUNT(*) as item_count
      FROM cart_items
      WHERE cart_id = ?
    `, [cartId]);

    const subtotal = totals.rows[0].subtotal || 0;
    const taxRate = 0.08; // 8% tax
    const shippingAmount = subtotal > 50 ? 0 : 9.99; // Free shipping over $50
    
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount + shippingAmount;

    await this.db.table('carts')
      .where('id', cartId)
      .update({
        subtotal,
        tax_amount: taxAmount,
        shipping_amount: shippingAmount,
        total,
        updated_at: new Date()
      });
  }

  private async getRelatedProducts(productId: number, categoryId: number) {
    return await this.db.table('products')
      .where('category_id', categoryId)
      .where('id', '!=', productId)
      .where('active', true)
      .where('stock_quantity', '>', 0)
      .orderBy('sales_count', 'desc')
      .limit(4)
      .get();
  }

  private async getProductReviews(productId: number, options: { limit: number }) {
    return await this.db.query(`
      SELECT 
        r.*,
        u.name as user_name,
        u.avatar_url
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.product_id = ? AND r.status = 'approved'
      ORDER BY r.helpful_count DESC, r.created_at DESC
      LIMIT ?
    `, [productId, options.limit]);
  }

  private async trackProductView(productId: number) {
    await this.db.table('products')
      .where('id', productId)
      .increment('view_count', 1);

    // Update popularity score (views + sales weighted)
    await this.db.execute(`
      UPDATE products 
      SET popularity_score = (view_count * 0.1) + (sales_count * 10) + (rating * review_count * 2)
      WHERE id = ?
    `, [productId]);
  }

  private async processPayment(payment: {
    orderId: number;
    amount: number;
    method: string;
  }) {
    // Mock payment processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    const success = Math.random() > 0.1; // 90% success rate
    return {
      success,
      reference: `PAY-${Date.now()}-${payment.orderId}`,
      message: success ? 'Payment successful' : 'Card declined'
    };
  }

  private async sendVerificationEmail(email: string) {
    console.log(`Sending verification email to ${email}`);
  }

  private async sendOrderConfirmation(orderId: number) {
    console.log(`Sending order confirmation for order ${orderId}`);
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private generateOrderNumber(): string {
    return `ORD-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
  }
}

// Database schema
async function setupDatabase(db: DBBridge) {
  const schemas = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20),
      avatar_url VARCHAR(500),
      email_verified BOOLEAN DEFAULT false,
      status VARCHAR(20) DEFAULT 'active',
      last_login TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_email (email),
      INDEX idx_status (status)
    )`,
    
    `CREATE TABLE IF NOT EXISTS categories (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(100) UNIQUE NOT NULL,
      parent_id INT NULL,
      image_url VARCHAR(500),
      description TEXT,
      sort_order INT DEFAULT 0,
      active BOOLEAN DEFAULT true,
      FOREIGN KEY (parent_id) REFERENCES categories(id),
      INDEX idx_slug (slug),
      INDEX idx_parent (parent_id)
    )`,
    
    `CREATE TABLE IF NOT EXISTS products (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(200) NOT NULL,
      slug VARCHAR(200) UNIQUE NOT NULL,
      description TEXT,
      category_id INT,
      price DECIMAL(10,2) NOT NULL,
      sale_price DECIMAL(10,2),
      cost DECIMAL(10,2),
      sku VARCHAR(100) UNIQUE,
      barcode VARCHAR(100),
      stock_quantity INT DEFAULT 0,
      low_stock_threshold INT DEFAULT 10,
      weight DECIMAL(10,3),
      image_url VARCHAR(500),
      rating DECIMAL(2,1) DEFAULT 0,
      review_count INT DEFAULT 0,
      view_count INT DEFAULT 0,
      sales_count INT DEFAULT 0,
      popularity_score DECIMAL(10,2) DEFAULT 0,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      INDEX idx_slug (slug),
      INDEX idx_category (category_id),
      INDEX idx_price (price),
      INDEX idx_popularity (popularity_score),
      FULLTEXT(name, description)
    )`,
    
    `CREATE TABLE IF NOT EXISTS carts (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      status VARCHAR(20) DEFAULT 'active',
      subtotal DECIMAL(10,2) DEFAULT 0,
      tax_amount DECIMAL(10,2) DEFAULT 0,
      shipping_amount DECIMAL(10,2) DEFAULT 0,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      total DECIMAL(10,2) DEFAULT 0,
      coupon_code VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      INDEX idx_user_status (user_id, status)
    )`,
    
    `CREATE TABLE IF NOT EXISTS orders (
      id INT PRIMARY KEY AUTO_INCREMENT,
      order_number VARCHAR(50) UNIQUE NOT NULL,
      user_id INT NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      payment_status VARCHAR(20) DEFAULT 'pending',
      payment_method VARCHAR(50),
      payment_reference VARCHAR(100),
      shipping_method VARCHAR(50),
      shipping_address JSON,
      billing_address JSON,
      subtotal DECIMAL(10,2) NOT NULL,
      tax_amount DECIMAL(10,2) DEFAULT 0,
      shipping_amount DECIMAL(10,2) DEFAULT 0,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      total DECIMAL(10,2) NOT NULL,
      notes TEXT,
      shipped_at TIMESTAMP NULL,
      delivered_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      INDEX idx_order_number (order_number),
      INDEX idx_user (user_id),
      INDEX idx_status (status),
      INDEX idx_created (created_at)
    )`
  ];

  for (const schema of schemas) {
    await db.execute(schema);
  }
  console.log('✅ Database schema created');
}

// Example usage
async function main() {
  const db = DBBridge.mysql({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'ecommerce',
    pool: { min: 10, max: 50 }
  });

  const cache = DBBridge.redis({
    host: 'localhost',
    port: 6379
  });

  try {
    await db.connect();
    await cache.connect();
    console.log('✅ Connected to databases');

    await setupDatabase(db);

    const ecommerce = new ECommerceBackend(db, cache);

    // Example operations
    console.log('\n=== E-Commerce Operations ===');

    // Register user
    const userId = await ecommerce.registerUser({
      email: 'john@example.com',
      password: 'hashed_password',
      name: 'John Doe',
      phone: '+1234567890'
    });
    console.log('User registered:', userId);

    // Get products
    const products = await ecommerce.getProducts({
      category: '1',
      minPrice: 10,
      maxPrice: 100,
      inStock: true,
      page: 1
    });
    console.log('Products found:', products.products.length);

    // Add to cart
    await ecommerce.addToCart(userId, 1, 2);
    console.log('Added to cart');

    // Get cart
    const cart = await ecommerce.getCart(userId);
    console.log('Cart items:', cart.items?.length);

    // Analytics
    const stats = await ecommerce.getDashboardStats({
      start: new Date('2024-01-01'),
      end: new Date()
    });
    console.log('Dashboard stats:', stats.summary);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.disconnect();
    await cache.disconnect();
    console.log('\n✅ Disconnected');
  }
}

main().catch(console.error);