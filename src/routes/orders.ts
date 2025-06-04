import express from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/db';

const router = express.Router();

// Middleware to verify JWT token
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ message: 'Invalid token' });
  }
};

// Admin middleware
const isAdmin = (req: any, res: any, next: any) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin rights required.' });
  }
  next();
};

// Get all orders (admin only)
router.get('/all', authenticateToken, isAdmin, async (req: any, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, 
        u1.username as customer_name,
        u2.username as freelancer_name
       FROM orders o
       LEFT JOIN users u1 ON o.customer_id = u1.id
       LEFT JOIN users u2 ON o.freelancer_id = u2.id
       ORDER BY o.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Error fetching orders' });
  }
});

// Get orders for regular users
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    let query = '';
    let params: any[] = [];

    if (req.user.role === 'customer') {
      // Customers see their own orders
      query = `
        SELECT o.*, 
          u1.username as customer_name,
          u2.username as freelancer_name
        FROM orders o
        LEFT JOIN users u1 ON o.customer_id = u1.id
        LEFT JOIN users u2 ON o.freelancer_id = u2.id
        WHERE o.customer_id = $1
        ORDER BY o.created_at DESC`;
      params = [req.user.userId];
    } else if (req.user.role === 'freelancer') {
      // Freelancers see open orders and their assigned orders
      query = `
        SELECT o.*, 
          u1.username as customer_name,
          u2.username as freelancer_name
        FROM orders o
        LEFT JOIN users u1 ON o.customer_id = u1.id
        LEFT JOIN users u2 ON o.freelancer_id = u2.id
        WHERE o.status = 'open' OR o.freelancer_id = $1
        ORDER BY o.created_at DESC`;
      params = [req.user.userId];
    } else {
      return res.status(403).json({ message: 'Invalid user role' });
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Error fetching orders' });
  }
});

// Get order by ID
router.get('/:id', authenticateToken, async (req: any, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, 
        u1.username as customer_name,
        u2.username as freelancer_name
       FROM orders o
       LEFT JOIN users u1 ON o.customer_id = u1.id
       LEFT JOIN users u2 ON o.freelancer_id = u2.id
       WHERE o.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = result.rows[0];

    // Check if user has permission to view this order
    if (req.user.role === 'admin') {
      // Admin can view any order
      res.json(order);
    } else if (req.user.role === 'customer') {
      // Customer can view their own orders
      if (order.customer_id === req.user.userId) {
        res.json(order);
      } else {
        res.status(403).json({ message: 'Not authorized to view this order' });
      }
    } else if (req.user.role === 'freelancer') {
      // Freelancer can view open orders and their assigned orders
      if (order.status === 'open' || order.freelancer_id === req.user.userId) {
        res.json(order);
      } else {
        res.status(403).json({ message: 'Not authorized to view this order' });
      }
    } else {
      res.status(403).json({ message: 'Invalid user role' });
    }
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ message: 'Error fetching order' });
  }
});

// Create new order
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const { title, description, budget, deadline } = req.body;

    const result = await pool.query(
      `INSERT INTO orders (title, description, budget, deadline, customer_id, status)
       VALUES ($1, $2, $3, $4, $5, 'open')
       RETURNING *`,
      [title, description, budget, deadline, req.user.userId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ message: 'Error creating order' });
  }
});

// Update order (admin only)
router.put('/:id', authenticateToken, isAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { title, description, budget, deadline, status } = req.body;

    const result = await pool.query(
      `UPDATE orders 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           budget = COALESCE($3, budget),
           deadline = COALESCE($4, deadline),
           status = COALESCE($5, status)
       WHERE id = $6
       RETURNING *`,
      [title, description, budget, deadline, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ message: 'Error updating order' });
  }
});

// Delete order (admin only)
router.delete('/:id', authenticateToken, isAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM orders WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ message: 'Error deleting order' });
  }
});

// Get orders by customer ID
router.get('/customer/:customerId', authenticateToken, async (req: any, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, 
        u1.username as customer_name,
        u2.username as freelancer_name
       FROM orders o
       LEFT JOIN users u1 ON o.customer_id = u1.id
       LEFT JOIN users u2 ON o.freelancer_id = u2.id
       WHERE o.customer_id = $1
       ORDER BY o.created_at DESC`,
      [req.params.customerId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching customer orders:', error);
    res.status(500).json({ message: 'Error fetching customer orders' });
  }
});

export default router; 