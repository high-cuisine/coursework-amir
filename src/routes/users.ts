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

// Get user profile (must be before /:id route)
router.get('/profile', authenticateToken, async (req: any, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, role, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Error fetching user profile' });
  }
});

// Update user profile (must be before /:id route)
router.put('/profile', authenticateToken, async (req: any, res) => {
  try {
    const { username, email } = req.body;
    
    const result = await pool.query(
      'UPDATE users SET username = $1, email = $2 WHERE id = $3 RETURNING id, username, email, role, created_at',
      [username, email, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ message: 'Error updating user profile' });
  }
});

// Get all users (admin only)
router.get('/', authenticateToken, isAdmin, async (req: any, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, role, created_at FROM users'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Get user by ID (admin only)
router.get('/:id', authenticateToken, isAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, username, email, role, created_at FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Error fetching user' });
  }
});

// Update user (admin only)
router.put('/:id', authenticateToken, isAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const result = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, email, role, created_at',
      [role, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error updating user' });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, isAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
});

// Get users by role
router.get('/role/:role', authenticateToken, async (req: any, res) => {
  try {
    const { role } = req.params;
    console.log('Fetching users with role:', role);
    
    // Validate role
    if (!['customer', 'freelancer', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const result = await pool.query(
      'SELECT id, username, email, role, created_at FROM users WHERE role = $1',
      [role]
    );

    console.log('Found users:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users by role:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Get user orders
router.get('/orders', authenticateToken, (req: any, res) => {
  // In a real application, you would fetch orders from a database
  const orders = [
    {
      id: 1,
      title: 'Sample Order',
      description: 'This is a sample order',
      budget: 1000,
      deadline: '2024-12-31',
      status: 'open',
      customerId: req.user.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
  res.json(orders);
});

// Get user messages
router.get('/messages', authenticateToken, (req: any, res) => {
  // In a real application, you would fetch messages from a database
  const messages = [
    {
      id: 1,
      orderId: 1,
      senderId: req.user.userId,
      receiverId: 2,
      content: 'Hello!',
      createdAt: new Date().toISOString()
    }
  ];
  res.json(messages);
});

export default router; 