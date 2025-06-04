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

// Get all archived orders (admin only)
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const result = await pool.query(
      `SELECT ao.*, 
        c.name as category_name,
        cu.username as customer_name,
        f.username as freelancer_name
       FROM archived_orders ao
       LEFT JOIN categories c ON ao.category_id = c.id
       LEFT JOIN users cu ON ao.customer_id = cu.id
       LEFT JOIN users f ON ao.freelancer_id = f.id
       ORDER BY ao.completion_date DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching archived orders:', error);
    res.status(500).json({ message: 'Error fetching archived orders' });
  }
});

// Get archived orders for a specific user
router.get('/user', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ao.*, 
        c.name as category_name,
        cu.username as customer_name,
        f.username as freelancer_name
       FROM archived_orders ao
       LEFT JOIN categories c ON ao.category_id = c.id
       LEFT JOIN users cu ON ao.customer_id = cu.id
       LEFT JOIN users f ON ao.freelancer_id = f.id
       WHERE ao.customer_id = $1 OR ao.freelancer_id = $1
       ORDER BY ao.completion_date DESC`,
      [req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user archived orders:', error);
    res.status(500).json({ message: 'Error fetching user archived orders' });
  }
});

// Get archived order by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ao.*, 
        c.name as category_name,
        cu.username as customer_name,
        f.username as freelancer_name
       FROM archived_orders ao
       LEFT JOIN categories c ON ao.category_id = c.id
       LEFT JOIN users cu ON ao.customer_id = cu.id
       LEFT JOIN users f ON ao.freelancer_id = f.id
       WHERE ao.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Archived order not found' });
    }

    const archivedOrder = result.rows[0];
    if (archivedOrder.customer_id !== req.user.userId && 
        archivedOrder.freelancer_id !== req.user.userId && 
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view this archived order' });
    }

    res.json(archivedOrder);
  } catch (error) {
    console.error('Error fetching archived order:', error);
    res.status(500).json({ message: 'Error fetching archived order' });
  }
});

// Archive a completed order
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { order_id, rating, review } = req.body;

    // Check if order exists and is completed
    const orderCheck = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND status = $2',
      [order_id, 'completed']
    );

    if (orderCheck.rows.length === 0) {
      return res.status(400).json({ message: 'Order not found or not completed' });
    }

    const order = orderCheck.rows[0];

    // Only order customer can archive and rate
    if (order.customer_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to archive this order' });
    }

    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert into archived_orders
      const archiveResult = await client.query(
        `INSERT INTO archived_orders (
          order_id, title, description, budget, deadline,
          category_id, customer_id, freelancer_id,
          completion_date, rating, review
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          order.id,
          order.title,
          order.description,
          order.budget,
          order.deadline,
          order.category_id,
          order.customer_id,
          order.freelancer_id,
          new Date(),
          rating,
          review
        ]
      );

      // Delete the original order
      await client.query('DELETE FROM orders WHERE id = $1', [order.id]);

      await client.query('COMMIT');
      res.status(201).json(archiveResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error archiving order:', error);
    res.status(500).json({ message: 'Error archiving order' });
  }
});

// Update archived order review
router.put('/:id/review', authenticateToken, async (req, res) => {
  try {
    const { rating, review } = req.body;

    // Check if archived order exists
    const orderCheck = await pool.query(
      'SELECT * FROM archived_orders WHERE id = $1',
      [req.params.id]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Archived order not found' });
    }

    const archivedOrder = orderCheck.rows[0];

    // Only order customer can update review
    if (archivedOrder.customer_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this review' });
    }

    const result = await pool.query(
      'UPDATE archived_orders SET rating = $1, review = $2 WHERE id = $3 RETURNING *',
      [rating, review, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating archived order review:', error);
    res.status(500).json({ message: 'Error updating archived order review' });
  }
});

export default router; 