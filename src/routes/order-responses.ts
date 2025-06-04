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

// Get all responses for an order
router.get('/order/:orderId', authenticateToken, async (req, res) => {
  try {
    // Check if user is the customer of the order
    const orderCheck = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [req.params.orderId]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = orderCheck.rows[0];
    if (order.customer_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view responses for this order' });
    }

    const result = await pool.query(
      `SELECT r.*, 
        u.username as freelancer_name,
        u.avatar as freelancer_avatar
       FROM order_responses r
       JOIN users u ON r.freelancer_id = u.id
       WHERE r.order_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.orderId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching order responses:', error);
    res.status(500).json({ message: 'Error fetching order responses' });
  }
});

// Get freelancer's responses
router.get('/freelancer', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, 
        o.title as order_title,
        o.status as order_status,
        u.username as customer_name
       FROM order_responses r
       JOIN orders o ON r.order_id = o.id
       JOIN users u ON o.customer_id = u.id
       WHERE r.freelancer_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching freelancer responses:', error);
    res.status(500).json({ message: 'Error fetching freelancer responses' });
  }
});

// Create new response
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { order_id, proposal, price, estimated_time } = req.body;

    // Check if order exists and is open
    const orderCheck = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND status = $2',
      [order_id, 'open']
    );

    if (orderCheck.rows.length === 0) {
      return res.status(400).json({ message: 'Order not found or not open' });
    }

    // Check if freelancer already responded
    const existingResponse = await pool.query(
      'SELECT * FROM order_responses WHERE order_id = $1 AND freelancer_id = $2',
      [order_id, req.user.userId]
    );

    if (existingResponse.rows.length > 0) {
      return res.status(400).json({ message: 'You have already responded to this order' });
    }

    const result = await pool.query(
      `INSERT INTO order_responses (order_id, freelancer_id, proposal, price, estimated_time)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [order_id, req.user.userId, proposal, price, estimated_time]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating order response:', error);
    res.status(500).json({ message: 'Error creating order response' });
  }
});

// Update response status (accept/reject)
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;

    // Check if response exists
    const responseCheck = await pool.query(
      `SELECT r.*, o.customer_id, o.status as order_status
       FROM order_responses r
       JOIN orders o ON r.order_id = o.id
       WHERE r.id = $1`,
      [req.params.id]
    );

    if (responseCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Response not found' });
    }

    const response = responseCheck.rows[0];

    // Only order customer can accept/reject responses
    if (response.customer_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this response' });
    }

    // Check if order is still open
    if (response.order_status !== 'open') {
      return res.status(400).json({ message: 'Order is no longer open' });
    }

    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update response status
      await client.query(
        'UPDATE order_responses SET status = $1 WHERE id = $2',
        [status, req.params.id]
      );

      // If response is accepted, update order status and freelancer
      if (status === 'accepted') {
        await client.query(
          `UPDATE orders 
           SET status = 'in_progress',
               freelancer_id = $1
           WHERE id = $2`,
          [response.freelancer_id, response.order_id]
        );

        // Reject all other responses
        await client.query(
          `UPDATE order_responses 
           SET status = 'rejected'
           WHERE order_id = $1 AND id != $2`,
          [response.order_id, req.params.id]
        );
      }

      await client.query('COMMIT');
      res.json({ message: 'Response status updated successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating response status:', error);
    res.status(500).json({ message: 'Error updating response status' });
  }
});

// Delete response
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    // Check if response exists and belongs to the user
    const responseCheck = await pool.query(
      'SELECT * FROM order_responses WHERE id = $1 AND freelancer_id = $2',
      [req.params.id, req.user.userId]
    );

    if (responseCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Response not found or not authorized' });
    }

    await pool.query('DELETE FROM order_responses WHERE id = $1', [req.params.id]);
    res.json({ message: 'Response deleted successfully' });
  } catch (error) {
    console.error('Error deleting response:', error);
    res.status(500).json({ message: 'Error deleting response' });
  }
});

export default router; 