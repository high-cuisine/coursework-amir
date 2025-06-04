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

// Get all messages (admin only)
router.get('/', authenticateToken, isAdmin, async (req: any, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, 
        u1.username as sender_name,
        u2.username as receiver_name,
        o.title as order_title
       FROM messages m
       JOIN users u1 ON m.sender_id = u1.id
       JOIN users u2 ON m.receiver_id = u2.id
       JOIN orders o ON m.order_id = o.id
       ORDER BY m.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Error fetching messages' });
  }
});

// Get message by ID (admin only)
router.get('/:id', authenticateToken, isAdmin, async (req: any, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, 
        u1.username as sender_name,
        u2.username as receiver_name,
        o.title as order_title
       FROM messages m
       JOIN users u1 ON m.sender_id = u1.id
       JOIN users u2 ON m.receiver_id = u2.id
       JOIN orders o ON m.order_id = o.id
       WHERE m.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Message not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({ message: 'Error fetching message' });
  }
});

// Get messages by order ID
router.get('/order/:orderId', authenticateToken, async (req: any, res) => {
  try {
    const { orderId } = req.params;
    console.log('Fetching messages for order:', orderId);
    console.log('User:', req.user);

    // First, let's check the order details
    const orderDetails = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    );

    if (orderDetails.rows.length === 0) {
      console.log('Order not found:', orderId);
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = orderDetails.rows[0];
    console.log('Order details:', order);

    // Check if user is authorized to view messages
    let isAuthorized = false;

    if (req.user.role === 'customer') {
      // Customer can view messages if they are the order owner
      isAuthorized = order.customer_id === req.user.userId;
    } else if (req.user.role === 'freelancer') {
      // Freelancer can view messages if:
      // 1. They are assigned to the order, OR
      // 2. The order is open (no freelancer assigned yet)
      isAuthorized = order.freelancer_id === req.user.userId || 
                    (order.status === 'open' && order.freelancer_id === null);
    }

    if (!isAuthorized) {
      console.log('Access denied:', { 
        orderId, 
        userId: req.user.userId,
        userRole: req.user.role,
        orderCustomerId: order.customer_id,
        orderFreelancerId: order.freelancer_id,
        orderStatus: order.status
      });
      return res.status(403).json({ message: 'Not authorized to view messages for this order' });
    }

    const result = await pool.query(
      `SELECT m.*, 
        u1.username as sender_name,
        u2.username as receiver_name
       FROM messages m
       JOIN users u1 ON m.sender_id = u1.id
       JOIN users u2 ON m.receiver_id = u2.id
       WHERE m.order_id = $1
       ORDER BY m.created_at ASC`,
      [orderId]
    );

    console.log('Messages found:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching order messages:', error);
    res.status(500).json({ message: 'Error fetching order messages' });
  }
});

// Create new message
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const { order_id, receiver_id, content } = req.body;
    console.log('Creating message:', { order_id, receiver_id, content });
    console.log('User:', req.user);

    // First, let's check the order details
    const orderDetails = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [order_id]
    );

    if (orderDetails.rows.length === 0) {
      console.log('Order not found:', order_id);
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = orderDetails.rows[0];
    console.log('Order details:', order);

    // Check if user is authorized to send messages
    let isAuthorized = false;

    if (req.user.role === 'customer') {
      // Customer can send messages if they are the order owner
      isAuthorized = order.customer_id === req.user.userId;
    } else if (req.user.role === 'freelancer') {
      // Freelancer can send messages if:
      // 1. They are assigned to the order, OR
      // 2. The order is open (no freelancer assigned yet)
      isAuthorized = order.freelancer_id === req.user.userId || 
                    (order.status === 'open' && order.freelancer_id === null);
    }

    if (!isAuthorized) {
      console.log('Access denied:', { 
        orderId: order_id, 
        userId: req.user.userId,
        userRole: req.user.role,
        orderCustomerId: order.customer_id,
        orderFreelancerId: order.freelancer_id,
        orderStatus: order.status
      });
      return res.status(403).json({ message: 'Not authorized to send messages for this order' });
    }

    // Verify that the receiver is the other party in the order
    if (req.user.role === 'customer') {
      if (order.freelancer_id && receiver_id !== order.freelancer_id) {
        return res.status(400).json({ message: 'Invalid receiver for this order' });
      }
    } else if (req.user.role === 'freelancer') {
      if (receiver_id !== order.customer_id) {
        return res.status(400).json({ message: 'Invalid receiver for this order' });
      }
    }

    const result = await pool.query(
      `INSERT INTO messages (order_id, sender_id, receiver_id, content)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [order_id, req.user.userId, receiver_id, content]
    );

    console.log('Message created:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({ message: 'Error creating message' });
  }
});

// Update message
router.put('/:id', authenticateToken, async (req: any, res) => {
  try {
    // Check if user is authorized to update the message
    const messageCheck = await pool.query(
      'SELECT * FROM messages WHERE id = $1',
      [req.params.id]
    );

    if (messageCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const message = messageCheck.rows[0];
    if (message.sender_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this message' });
    }

    const { content } = req.body;

    const result = await pool.query(
      'UPDATE messages SET content = $1 WHERE id = $2 RETURNING *',
      [content, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({ message: 'Error updating message' });
  }
});

// Delete message (admin only)
router.delete('/:id', authenticateToken, isAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM messages WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Message not found' });
    }

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ message: 'Error deleting message' });
  }
});

export default router; 