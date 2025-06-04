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

// Get all categories
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, 
        p.name as parent_name,
        (SELECT COUNT(*) FROM orders WHERE category_id = c.id) as orders_count
       FROM categories c
       LEFT JOIN categories p ON c.parent_id = p.id
       ORDER BY c.name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Error fetching categories' });
  }
});

// Get category by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, 
        p.name as parent_name,
        (SELECT COUNT(*) FROM orders WHERE category_id = c.id) as orders_count
       FROM categories c
       LEFT JOIN categories p ON c.parent_id = p.id
       WHERE c.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ message: 'Error fetching category' });
  }
});

// Create new category (admin only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can create categories' });
    }

    const { name, description, parent_id } = req.body;

    const result = await pool.query(
      `INSERT INTO categories (name, description, parent_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, description, parent_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ message: 'Error creating category' });
  }
});

// Update category (admin only)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can update categories' });
    }

    const { name, description, parent_id } = req.body;

    const result = await pool.query(
      `UPDATE categories 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           parent_id = COALESCE($3, parent_id)
       WHERE id = $4
       RETURNING *`,
      [name, description, parent_id, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ message: 'Error updating category' });
  }
});

// Delete category (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can delete categories' });
    }

    // Check if category has subcategories
    const subcategoriesCheck = await pool.query(
      'SELECT COUNT(*) FROM categories WHERE parent_id = $1',
      [req.params.id]
    );

    if (parseInt(subcategoriesCheck.rows[0].count) > 0) {
      return res.status(400).json({ message: 'Cannot delete category with subcategories' });
    }

    // Check if category has orders
    const ordersCheck = await pool.query(
      'SELECT COUNT(*) FROM orders WHERE category_id = $1',
      [req.params.id]
    );

    if (parseInt(ordersCheck.rows[0].count) > 0) {
      return res.status(400).json({ message: 'Cannot delete category with existing orders' });
    }

    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ message: 'Error deleting category' });
  }
});

export default router; 