-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'customer',
    avatar VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    parent_id INTEGER REFERENCES categories(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    budget DECIMAL(10, 2) NOT NULL,
    deadline DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    category_id INTEGER REFERENCES categories(id),
    customer_id INTEGER REFERENCES users(id),
    freelancer_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create order responses table
CREATE TABLE IF NOT EXISTS order_responses (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id),
    freelancer_id INTEGER REFERENCES users(id),
    proposal TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    estimated_time INTEGER NOT NULL, -- estimated time in days
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, accepted, rejected
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id, freelancer_id)
);

-- Create archived orders table
CREATE TABLE IF NOT EXISTS archived_orders (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    budget DECIMAL(10, 2) NOT NULL,
    deadline DATE NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    customer_id INTEGER REFERENCES users(id),
    freelancer_id INTEGER REFERENCES users(id),
    completion_date TIMESTAMP NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id),
    sender_id INTEGER REFERENCES users(id),
    receiver_id INTEGER REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_freelancer_id ON orders(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_orders_category_id ON orders(category_id);
CREATE INDEX IF NOT EXISTS idx_order_responses_order_id ON order_responses(order_id);
CREATE INDEX IF NOT EXISTS idx_order_responses_freelancer_id ON order_responses(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_archived_orders_customer_id ON archived_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_archived_orders_freelancer_id ON archived_orders(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_archived_orders_category_id ON archived_orders(category_id);
CREATE INDEX IF NOT EXISTS idx_messages_order_id ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id); 